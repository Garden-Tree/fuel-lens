import type { ScanLoadingStep } from "@/lib/scan/useScanPipeline";
import type { VehicleType } from "@/lib/types";

/**
 * 解析待ちの間に出す提携先の紹介（PR）の設定と、表示するかの判定（純粋関数）。
 * 提携先を増やすときは SCAN_WAIT_PROMOS に足す。同じ車両の種類に複数あれば、リンクが入っている最初の 1 件を出す。
 */
export type ScanWaitPromo = {
  id: string;
  /** 対象の車両の種類。ここに含まれない車両では出さない */
  vehicleTypes: readonly VehicleType[];
  /** 提携先のリンク（A8.net。インプレッション用の画像タグは使わない）。null の間は出さない */
  href: string | null;
  title: string;
  body: string;
  /** 主ボタン（リンク）の文言 */
  cta: string;
  /** 報酬を受け取ることがある旨（広告であることの明示） */
  disclosure: string;
};

export const SCAN_WAIT_PROMOS: readonly ScanWaitPromo[] = [
  {
    id: "insweb-bike",
    vehicleTypes: ["bike"],
    href: "https://px.a8.net/svt/ejp?a8mat=3NPG18+31JS36+2PS+1HM30Y",
    title: "解析が終わるまで少々お待ちください",
    body: "バイク保険、更新の前に見直していますか？ インズウェブでは複数の保険会社の見積りを一度にとれます（無料）。",
    cta: "無料で見積もる",
    disclosure: "FuelLens は紹介した保険会社の見積りから報酬を受け取ることがあります。",
  },
  {
    id: "insurance-car",
    vehicleTypes: ["car"],
    // TODO: 車用のアフィリエイトリンクが決まったらここに URL を入れる（null の間は車では何も出ない）
    href: null,
    title: "解析が終わるまで少々お待ちください",
    body: "自動車保険、更新の前に見直していますか？ 一括見積りで複数社の保険料を比べられます（無料）。",
    cta: "無料で見積もる",
    disclosure: "FuelLens は紹介した保険会社の見積りから報酬を受け取ることがあります。",
  },
];

/** 解析が始まってから出すまでの待ち時間（すぐ終わるスキャンで一瞬だけ出ないようにする） */
export const SCAN_WAIT_PROMO_DELAY_MS = 1500;
/** 同じ端末で再び出すまでの間隔 */
export const SCAN_WAIT_PROMO_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
export const SCAN_WAIT_PROMO_STORAGE_KEY = "fuel_lens_pr_scan_wait_shown_at";

/** 解析が終わったときの見出し（結果は PR を閉じると見える） */
export const SCAN_WAIT_PROMO_DONE_TITLE = "解析が終わりました";

export function findScanWaitPromo(
  vehicleType: VehicleType | null | undefined,
  promos: readonly ScanWaitPromo[] = SCAN_WAIT_PROMOS,
): ScanWaitPromo | null {
  if (!vehicleType) return null;
  return promos.find((p) => p.href && p.vehicleTypes.includes(vehicleType)) ?? null;
}

export type ScanWaitPromoInput = {
  loadingStep: ScanLoadingStep;
  /** 解析が始まってからの経過（ミリ秒） */
  elapsedMs: number;
  vehicleType: VehicleType | null | undefined;
  /** 一括読み取り中か */
  batchActive: boolean;
  /** この端末で最後に出した時刻（ミリ秒）。無ければ null */
  lastShownAt: number | null;
  now: number;
  /** テスト用。省略時は SCAN_WAIT_PROMOS */
  promos?: readonly ScanWaitPromo[];
};

/** 出す提携先を返す。出さないなら null */
export function decideScanWaitPromo(input: ScanWaitPromoInput): ScanWaitPromo | null {
  if (input.loadingStep !== "analyze") return null;
  if (input.batchActive) return null;
  if (input.elapsedMs < SCAN_WAIT_PROMO_DELAY_MS) return null;
  if (input.lastShownAt !== null && input.now - input.lastShownAt < SCAN_WAIT_PROMO_INTERVAL_MS) return null;
  return findScanWaitPromo(input.vehicleType, input.promos);
}

export function readPromoShownAt(): number | null {
  try {
    const raw = window.localStorage.getItem(SCAN_WAIT_PROMO_STORAGE_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function writePromoShownAt(now: number): void {
  try {
    window.localStorage.setItem(SCAN_WAIT_PROMO_STORAGE_KEY, String(now));
  } catch {
    // 保存できなくても動作に影響しない
  }
}
