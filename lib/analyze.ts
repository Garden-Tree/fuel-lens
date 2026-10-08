/**
 * /api/analyze 用の純粋ヘルパーと型定義。
 *
 * - 副作用なし。import してよいのは依存のないドメインモジュール（lib/types.ts・lib/dates.ts・lib/calculations.ts）だけ
 *   （React・Supabase・Clerk などに依存させず、サーバーでもクライアントでも単体テストでもそのまま使えるようにする）。
 * - サーバー（route.ts）とクライアント（page.tsx・ScanReviewSheet・useRecordForm）の両方から型を参照できる。
 */

import { calculateFuelMetrics } from "./calculations";
import { isValidCalendarDate } from "./dates";
import { FUEL_TYPES, type FuelType } from "./types";

// ---------------------------------------------------------------------------
// 型定義（レスポンス契約）
// ---------------------------------------------------------------------------

/** AIが抽出する数値フィールド */
export const NUMERIC_FIELDS = [
  "fuel_amount",
  "total_cost",
  "price_per_unit",
  "total_distance",
  "odometer",
] as const;
export type NumericField = (typeof NUMERIC_FIELDS)[number];

/** confidence を持ちうるフィールド */
export const CONFIDENCE_FIELDS = [
  "date",
  "fuel_amount",
  "total_cost",
  "price_per_unit",
  "total_distance",
  "odometer",
  "gas_station",
  "fuel_type",
] as const;
export type ConfidenceField = (typeof CONFIDENCE_FIELDS)[number];

/** サニタイズ済みの解析結果（/api/analyze 成功時の本体） */
export type AnalyzeResult = {
  /** YYYY-MM-DD。読めない／不正な日付は null */
  date: string | null;
  /** 給油量 (L) */
  fuel_amount: number | null;
  /** 支払総額 (円) */
  total_cost: number | null;
  /** 単価 (円/L)。total_cost と fuel_amount があれば再計算で上書きされる */
  price_per_unit: number | null;
  /** トリップメーターの区間距離 (km)。満タン法の分子。オドメーターではない */
  total_distance: number | null;
  /** オドメーター（積算距離, km）。見えていれば。オドメーターモードの車両では確認シート（ScanReviewSheet）が主入力に使う */
  odometer: number | null;
  /** 店舗名（最大100文字） */
  gas_station: string | null;
  /** 油種。読み取れなければ null */
  fuel_type: FuelType | null;
  /** 各項目の確信度 0〜1（AIが返した場合のみ） */
  confidence?: Partial<Record<ConfidenceField, number>>;
};

/** 妥当性チェックの警告の種類（plausibilityWarnings） */
export type ScanWarningCode = "FUEL_TOO_LARGE" | "DISTANCE_TOO_LARGE" | "EFFICIENCY_TOO_HIGH";

/** 妥当性チェックの警告。クライアントは code で絞り込み、message（日本語）を表示する */
export type ScanWarning = {
  code: ScanWarningCode;
  message: string;
};

/**
 * 区間距離（トリップメーター）の読み取り値 total_distance に基づく警告か。
 * DISTANCE_* と、total_distance ÷ 給油量で求める EFFICIENCY_TOO_HIGH。
 * オドメーターモードの車両では区間距離の読み取り値を保存に使わない（区間はオドメーターの差分）ので、確認シートに出さない。
 */
export function isTripDistanceWarning(code: string): boolean {
  return code.startsWith("DISTANCE_") || code === "EFFICIENCY_TOO_HIGH";
}

/** /api/analyze 成功レスポンス */
export type AnalyzeSuccessResponse = AnalyzeResult & {
  /** 妥当性チェックに引っかかった場合の警告（code と日本語の message）。保存は妨げない */
  warnings?: ScanWarning[];
  /** サーバーログと突き合わせるための短いID */
  requestId: string;
};

/** /api/analyze エラーレスポンス */
export type AnalyzeErrorResponse = {
  error: string;
  code?: string;
  requestId?: string;
};

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** リクエストボディの上限（Vercel の 4.5MB 制限より手前で弾く） */
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
/** Base64 文字列の上限（≒4MB の画像。クライアントは 0.8MB 以下に圧縮する） */
export const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_BODY_BYTES / 3) * 4);

export type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";

/** 妥当性チェックのしきい値 */
export const PLAUSIBILITY_LIMITS = {
  /** km/L。これを超える燃費は読み取りミスの可能性が高い */
  maxFuelEfficiency: 60,
  /** L。乗用車の給油量としてあり得ない値 */
  maxFuelAmount: 200,
  /** km。1回の給油間隔としてあり得ない値（オドメーターを誤読した可能性） */
  maxTripDistance: 2000,
} as const;

// ---------------------------------------------------------------------------
// Origin チェック
// ---------------------------------------------------------------------------

/**
 * URL 文字列（Origin / Referer / NEXT_PUBLIC_APP_URL）から host（ポート込み）を取り出す。
 * パースできなければ null。
 */
export function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Origin ヘッダーのホストが許可ホストのいずれかと一致するか。
 * - origin が無い（同一オリジンの GET や一部クライアント）場合は検査対象外として true
 * - origin が "null" や不正な URL の場合は false
 */
export function isAllowedOrigin(
  origin: string | null | undefined,
  allowedHosts: Array<string | null | undefined>
): boolean {
  if (!origin) return true;
  const originHost = hostFromUrl(origin);
  if (!originHost) return false;
  return allowedHosts.some((h) => !!h && h.toLowerCase() === originHost);
}

// ---------------------------------------------------------------------------
// 画像ペイロードの検証
// ---------------------------------------------------------------------------

export type ParsedImage =
  | { ok: true; base64: string; mimeType: SupportedImageMime; approxBytes: number }
  | { ok: false; status: 400 | 413 | 415; error: string };

const DATA_URL_PREFIX = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(;[a-z0-9-]+=[^;,]*)*(;base64)?,/i;
const BASE64_CHARSET = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * 先頭バイトのマジックナンバーから画像形式を判定する。
 * JPEG: FF D8 FF / PNG: 89 50 4E 47 0D 0A 1A 0A / WebP: "RIFF" .... "WEBP"
 */
export function detectImageMime(head: Uint8Array): SupportedImageMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    head.length >= 12 &&
    head[0] === 0x52 && // R
    head[1] === 0x49 && // I
    head[2] === 0x46 && // F
    head[3] === 0x46 && // F
    head[8] === 0x57 && // W
    head[9] === 0x45 && // E
    head[10] === 0x42 && // B
    head[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

/** Base64 文字列の先頭 n 文字（4の倍数）をデコードして Uint8Array にする */
function decodeBase64Head(base64: string, chars = 32): Uint8Array {
  const slice = base64.slice(0, chars - (chars % 4));
  const bin = atob(slice);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * クライアントから受け取った `image` 文字列を検証し、Gemini に渡せる形に整える。
 * - 任意の `data:image/...;base64,` プレフィックスを剥がす
 * - Base64 文字集合と長さを検証する
 * - 先頭バイトのマジックナンバーで JPEG/PNG/WebP を判定し、その MIME を返す
 */
export function parseImagePayload(image: unknown): ParsedImage {
  if (typeof image !== "string" || image.length === 0) {
    return { ok: false, status: 400, error: "画像データが不正です。Base64形式の文字列を送信してください。" };
  }

  let payload = image.trim();

  const m = DATA_URL_PREFIX.exec(payload);
  if (m) {
    const declared = (m[1] || "").toLowerCase();
    if (declared && !declared.startsWith("image/")) {
      return { ok: false, status: 415, error: "対応していないデータ形式です。JPEG/PNG/WebP の画像を送信してください。" };
    }
    if (!m[3]) {
      return { ok: false, status: 400, error: "画像データが不正です。Base64形式の文字列を送信してください。" };
    }
    payload = payload.slice(m[0].length);
  } else if (/^data:/i.test(payload)) {
    return { ok: false, status: 400, error: "画像データが不正です。Base64形式の文字列を送信してください。" };
  }

  // 改行・空白が混ざった Base64（MIME 折り返し等）を許容する
  payload = payload.replace(/\s+/g, "");

  if (payload.length === 0 || payload.length % 4 !== 0 || !BASE64_CHARSET.test(payload)) {
    return { ok: false, status: 400, error: "画像データが不正です。Base64形式の文字列を送信してください。" };
  }

  if (payload.length > MAX_IMAGE_BASE64_LENGTH) {
    return { ok: false, status: 413, error: "画像サイズが大きすぎます。4MB以下の画像を使用してください。" };
  }

  let mimeType: SupportedImageMime | null = null;
  try {
    mimeType = detectImageMime(decodeBase64Head(payload));
  } catch {
    mimeType = null;
  }
  if (!mimeType) {
    return { ok: false, status: 415, error: "対応していない画像形式です。JPEG/PNG/WebP の画像を送信してください。" };
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const approxBytes = (payload.length * 3) / 4 - padding;

  return { ok: true, base64: payload, mimeType, approxBytes };
}

// ---------------------------------------------------------------------------
// AI 応答の検証
// ---------------------------------------------------------------------------

/** 有限かつ 0 以上の数値に正規化する。数値文字列も許容。それ以外は null */
export function toNonNegativeNumber(value: unknown): number | null {
  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string" && value.trim() !== "") {
    // "12,345" や "45.6L" のような軽微な混入は取り除く
    const cleaned = value.replace(/[,\s]/g, "").replace(/[^\d.+-]+$/g, "");
    // "不明" / "N/A" / "円" のように数字を含まない文字列は空になる。Number("") は 0 なので明示的に弾く
    if (cleaned === "") return null;
    n = Number(cleaned);
  } else {
    return null;
  }
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 0〜1 にクランプした確信度。数値でなければ null */
function toConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/**
 * 油種の生の値を FuelType に正規化する。
 * - 許可値（regular / premium / diesel / other）はそのまま
 * - レギュラー・ハイオク・軽油や英語表記（high-octane など）は対応する値に寄せる
 * - それ以外の空でない文字列は other、空・文字列以外は null
 */
export function normalizeFuelType(value: unknown): FuelType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "") return null;
  if ((FUEL_TYPES as readonly string[]).includes(v)) return v as FuelType;
  if (v.includes("レギュラー") || v.includes("regular")) return "regular";
  if (v.includes("ハイオク") || v.includes("premium") || v.includes("high-octane") || v.includes("high octane")) {
    return "premium";
  }
  if (v.includes("軽油") || v.includes("diesel")) return "diesel";
  return "other";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * AI 応答（JSON.parse 済み）を検証し、許可されたキーだけを持つ AnalyzeResult に正規化する。
 * - 配列やプリミティブなど「プレーンなオブジェクト」でなければ null を返す（呼び出し側で 502 にする）
 * - 数値: 有限かつ 0 以上。それ以外は null
 * - date: YYYY-MM-DD の実在日付。それ以外は null
 * - gas_station: trim して 100 文字まで。空なら null
 * - fuel_type: regular / premium / diesel / other のいずれか（日本語・英語の表記ゆれは寄せる）。それ以外は null
 * - 未知のキーは捨てる
 */
export function sanitizeAIResponse(raw: unknown): AnalyzeResult | null {
  if (!isPlainObject(raw)) return null;

  const result: AnalyzeResult = {
    date: isValidCalendarDate(raw.date) ? raw.date : null,
    fuel_amount: toNonNegativeNumber(raw.fuel_amount),
    total_cost: toNonNegativeNumber(raw.total_cost),
    price_per_unit: toNonNegativeNumber(raw.price_per_unit),
    total_distance: toNonNegativeNumber(raw.total_distance),
    odometer: toNonNegativeNumber(raw.odometer),
    gas_station: null,
    fuel_type: normalizeFuelType(raw.fuel_type),
  };

  if (typeof raw.gas_station === "string") {
    const trimmed = raw.gas_station.trim().slice(0, 100);
    result.gas_station = trimmed.length > 0 ? trimmed : null;
  }

  if (isPlainObject(raw.confidence)) {
    const confidence: Partial<Record<ConfidenceField, number>> = {};
    for (const field of CONFIDENCE_FIELDS) {
      const c = toConfidence(raw.confidence[field]);
      if (c !== null) confidence[field] = c;
    }
    if (Object.keys(confidence).length > 0) result.confidence = confidence;
  }

  return result;
}

/**
 * 単価 (円/L) を総額と給油量から再計算する（lib/calculations.ts の calculateFuelMetrics。0.1 円/L 単位に丸める）。
 * 計算できなければ null。
 */
export function derivePricePerUnit(
  totalCost: number | null | undefined,
  fuelAmount: number | null | undefined
): number | null {
  return calculateFuelMetrics(null, fuelAmount, totalCost).price_per_unit;
}

/** fuel_amount / total_cost / total_distance のいずれかが読み取れているか */
export function hasAnyCoreValue(result: Pick<AnalyzeResult, "fuel_amount" | "total_cost" | "total_distance">): boolean {
  return result.fuel_amount !== null || result.total_cost !== null || result.total_distance !== null;
}

/**
 * 読み取り結果の妥当性チェック。問題があれば警告（code と日本語の message）を返す（空配列なら問題なし）。
 * 値を書き換えたり破棄したりはしない。保存するかどうかはユーザーに委ねる。
 */
export function plausibilityWarnings(
  result: Pick<AnalyzeResult, "fuel_amount" | "total_distance">
): ScanWarning[] {
  const warnings: ScanWarning[] = [];
  const add = (code: ScanWarningCode, message: string) => warnings.push({ code, message });
  const { fuel_amount, total_distance } = result;

  if (fuel_amount !== null && fuel_amount > PLAUSIBILITY_LIMITS.maxFuelAmount) {
    add(
      "FUEL_TOO_LARGE",
      `給油量が ${fuel_amount} L と大きすぎます（${PLAUSIBILITY_LIMITS.maxFuelAmount} L 超）。読み取りミスの可能性があるため確認してください。`
    );
  }

  if (total_distance !== null && total_distance > PLAUSIBILITY_LIMITS.maxTripDistance) {
    add(
      "DISTANCE_TOO_LARGE",
      `走行距離が ${total_distance} km と大きすぎます（${PLAUSIBILITY_LIMITS.maxTripDistance} km 超）。オドメーター（積算距離）を読み取った可能性があります。トリップメーターの区間距離を確認してください。`
    );
  }

  if (
    fuel_amount !== null &&
    total_distance !== null &&
    fuel_amount > 0 &&
    total_distance / fuel_amount > PLAUSIBILITY_LIMITS.maxFuelEfficiency
  ) {
    const eff = (total_distance / fuel_amount).toFixed(1);
    add(
      "EFFICIENCY_TOO_HIGH",
      `燃費が ${eff} km/L と非現実的です（${PLAUSIBILITY_LIMITS.maxFuelEfficiency} km/L 超）。走行距離または給油量の読み取りミスの可能性があります。`
    );
  }

  return warnings;
}
