import type { AnalyzeSuccessResponse } from "@/lib/analyze";
import type { FuelRecord, RecordInput } from "@/lib/types";

/**
 * 旧レシートの一括読み取り（複数の写真を順に読み取って 1 件ずつ確認・保存する）の純粋なヘルパー。
 * React と I/O に依存しない。処理の流れは lib/scan/batchController.ts、状態のフックは lib/scan/useBatchScan.ts。
 */

/** 一度に読み取れる写真の上限 */
export const MAX_BATCH_IMAGES = 20;

/**
 * クライアント側のペース配分: 直近 PACER_WINDOW_MS の間に送る解析リクエストを PACER_MAX_REQUESTS 回までにする。
 * サーバーの上限（1 分 5 回。lib/server/analyze/rateLimit.ts）より窓を少し長くし、時計のずれで超えないようにする
 */
export const PACER_MAX_REQUESTS = 5;
export const PACER_WINDOW_MS = 62_000;

/** 429 で Retry-After が読めないときの待ち時間 */
export const DEFAULT_RETRY_AFTER_MS = 30_000;
/** Retry-After の上限（異常な値で何十分も待たない） */
export const MAX_RETRY_AFTER_MS = 120_000;
/** 1 枚あたり 429 で自動的に再試行する回数の上限（超えたらその写真は読み取り失敗として手動入力・スキップを選べるようにする） */
export const MAX_RATE_LIMIT_RETRIES = 4;

/** 一括読み取りに回す画像の選別結果 */
export type BatchSelection = {
  /** 読み取る画像（選択順。上限まで） */
  images: File[];
  /** 画像以外で除いたファイルの数 */
  nonImages: number;
  /** 上限を超えて除いた画像の数 */
  overLimit: number;
};

/** 選ばれたファイルから画像だけを選び、上限（MAX_BATCH_IMAGES）までに切り詰める */
export function selectBatchImages(files: readonly File[], limit: number = MAX_BATCH_IMAGES): BatchSelection {
  const all = files.filter((f) => f.type.startsWith("image/"));
  return {
    images: all.slice(0, limit),
    nonImages: files.length - all.length,
    overLimit: Math.max(0, all.length - limit),
  };
}

/** 上限を超えて選ばれたときの案内 */
export function overLimitMessage(overLimit: number, limit: number = MAX_BATCH_IMAGES): string {
  return `一度に読み取れるのは ${limit} 枚までです。最初の ${limit} 枚を読み取ります（残りの ${overLimit} 枚は、終わってからもう一度選んでください）`;
}

/** 未ログインで複数の写真が選ばれたときの案内（解析 API は呼ばない） */
export const BATCH_SIGNED_OUT_MESSAGE =
  "複数の写真の読み取り（AIスキャン）はログイン後に使えます。手動入力はログインなしでも使えます。";

/**
 * 未ログインのお試し（lib/trial.ts）で、残り回数より多くの写真が選ばれたときの案内。
 * 一括読み取りは 1 枚ごとに 1 回分を使うので、最初の remaining 枚だけを読み取る
 */
export function trialBatchLimitMessage(remaining: number, dropped: number): string {
  return `お試しで読み取れるのはあと ${remaining} 回のため、最初の ${remaining} 枚だけ読み取ります。残りの ${dropped} 枚はログインすると読み取れます`;
}

/** 複数枚の一括読み取りを始められない理由ごとの案内 */
export const BATCH_BLOCKED_MESSAGES = {
  readOnly: "閲覧専用（クラウド接続待ち）のため、写真の一括読み取りは始められません",
  loading: "読み込み中のため、写真の一括読み取りは始められません。少し待ってからもう一度選んでください",
  busy: "読み取り中のため、新しい写真は読み込めません。終わってからもう一度選んでください",
} as const;

/**
 * Retry-After ヘッダーの値をミリ秒にする。秒数（整数）か HTTP 日付に対応し、読めなければ fallback。
 * 0 以下は 1 秒、上限は MAX_RETRY_AFTER_MS
 */
export function parseRetryAfterMs(
  header: string | null | undefined,
  now: number,
  fallbackMs: number = DEFAULT_RETRY_AFTER_MS
): number {
  let ms: number | null = null;
  const value = header?.trim() ?? "";
  if (/^\d+$/.test(value)) {
    ms = Number(value) * 1000;
  } else if (value !== "") {
    const at = Date.parse(value);
    if (Number.isFinite(at)) ms = at - now;
  }
  if (ms === null) ms = fallbackMs;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(1000, ms));
}

/**
 * 解析リクエストのペース配分（スライディングウィンドウ）。送った時刻を覚えておき、次に送ってよいまでの待ち時間を返す。
 * 429 を受けたら `blockUntil` でその時刻まで止める
 */
export type RequestPacer = {
  /** いま送ると上限を超えるなら、送ってよくなるまでのミリ秒。送ってよければ 0 */
  delayMs(now: number): number;
  /** リクエストを送った（送る直前に呼ぶ） */
  record(now: number): void;
  /** この時刻まで送らない（429 の Retry-After） */
  blockUntil(at: number): void;
};

export function createRequestPacer(
  max: number = PACER_MAX_REQUESTS,
  windowMs: number = PACER_WINDOW_MS
): RequestPacer {
  let sent: number[] = [];
  let blockedUntil = 0;
  return {
    delayMs(now) {
      sent = sent.filter((t) => now - t < windowMs);
      const byWindow = sent.length >= max ? sent[sent.length - max] + windowMs - now : 0;
      return Math.max(0, byWindow, blockedUntil - now);
    },
    record(now) {
      sent.push(now);
    },
    blockUntil(at) {
      blockedUntil = Math.max(blockedUntil, at);
    },
  };
}

/** 待ち時間（ミリ秒）を表示用の秒数（切り上げ、1 以上）にする */
export function waitSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** 回数制限で待っている間の表示 */
export function rateLimitWaitMessage(seconds: number): string {
  return `読み取りの回数制限のため、あと ${seconds} 秒待っています`;
}

/** 一括読み取りの進み具合（「3 / 12 枚目」） */
export function batchPositionLabel(index: number, total: number): string {
  return `${index + 1} / ${total} 枚目`;
}

/**
 * 終わったとき（または中止したとき）の結果の toast。
 * - 全部終わった: 「12 枚中 9 件を保存、3 件をスキップしました」（スキップ 0 件なら「12 枚中 12 件を保存しました」）
 * - 途中で中止: 「12 枚中 3 件を保存、1 件をスキップし、残りの 8 枚は中止しました」
 */
export function batchSummaryMessage(counts: { total: number; saved: number; skipped: number; cancelled?: number }): string {
  const { total, saved, skipped } = counts;
  const cancelled = counts.cancelled ?? 0;
  const head = `${total} 枚中 ${saved} 件を保存`;
  if (cancelled > 0) {
    return skipped > 0
      ? `${head}、${skipped} 件をスキップし、残りの ${cancelled} 枚は中止しました`
      : `${head}し、残りの ${cancelled} 枚は中止しました`;
  }
  return skipped > 0 ? `${head}、${skipped} 件をスキップしました` : `${head}しました`;
}

/** 重複の可能性があるときの注意 */
export const POSSIBLE_DUPLICATE_MESSAGE = "同じ日付・金額の記録がすでにあります";

/**
 * 一括読み取りの 1 件と同じ記録がすでにありそうか（同じ日付 + 支払総額、給油量は両方にあるときだけ比べる）。
 * records は記録先の車両の記録（useVehicleScope の records。未分類は既定車両のときだけ含まれる）。
 * 支払総額が無ければ給油量（両方にあるとき）で比べる。日付が無い・金額も給油量も無いときは判定しない（null）。
 * 保存時の確認（lib/recordDraft.ts の findDuplicateRecord。日付・給油量・金額の完全一致）より広く拾い、
 * 保存の前に注意として出すためのもの
 */
export function findPossibleDuplicate(
  records: readonly FuelRecord[],
  candidate: Pick<RecordInput, "date" | "total_cost" | "fuel_amount">
): FuelRecord | null {
  const date = candidate.date?.trim() ?? "";
  if (date === "") return null;
  const cost = candidate.total_cost ?? null;
  const fuel = candidate.fuel_amount ?? null;
  if (cost === null && fuel === null) return null;
  for (const r of records) {
    if ((r.date ?? "") !== date) continue;
    if (cost !== null) {
      if ((r.total_cost ?? null) !== cost) continue;
    } else if (r.fuel_amount == null) {
      continue;
    }
    const rFuel = r.fuel_amount ?? null;
    if (fuel !== null && rFuel !== null && Math.abs(fuel - rFuel) >= 0.01) continue;
    return r;
  }
  return null;
}

/**
 * 読み取れなかった写真の確認シートに渡す空の読み取り結果（写真を見ながら手入力する）。
 * すべて null なので、各項目は「要確認」になり、日付も空のまま（今日を入れない）
 */
export function emptyAnalyzeResult(): AnalyzeSuccessResponse {
  return {
    date: null,
    fuel_amount: null,
    total_cost: null,
    price_per_unit: null,
    total_distance: null,
    odometer: null,
    gas_station: null,
    fuel_type: null,
    requestId: "",
  };
}
