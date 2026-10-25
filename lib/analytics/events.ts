import type { DistanceMode, RecordSource, VehicleType } from "@/lib/types";

/**
 * Google Analytics 4 に送る行動イベント（docs/operations.md「Google Analytics 4」）。
 *
 * - gtag（components/GoogleAnalytics.tsx が `NEXT_PUBLIC_GA_MEASUREMENT_ID` のあるビルドでだけ用意する）が無ければ何もしない
 * - パラメータは列挙値・真偽値・数値だけ。ユーザー ID・メール・記録の中身・金額・車名・URL のクエリは送らない
 *   （型で縛り、送る直前に sanitizeEventParams でも英小文字の短い識別子以外の文字列を落とす）
 */

/** /app への CTA を置いている公開ページ */
export const CTA_PAGES = ["/", "/calc", "/gas-cost", "/annual-gas-cost", "/fuel-convert", "/expense", "/fuelio"] as const;
export type CtaPage = (typeof CTA_PAGES)[number];

/**
 * CTA の位置（リンクの `data-ga-cta` 属性の値）。
 * hero = ランディングの最初の画面、bottom = ランディングの最後、header = ヘッダーの「今すぐ始める」、
 * cta_box = ツールページ本文の「アプリを使う」の枠、calc_result = 燃費計算の「この内容で FuelLens に記録する」
 */
export const CTA_POSITIONS = ["hero", "bottom", "header", "cta_box", "calc_result"] as const;
export type CtaPosition = (typeof CTA_POSITIONS)[number];

/** CTA のリンクに付ける属性名（components/GoogleAnalytics.tsx の 1 か所のクリック listener が拾う） */
export const CTA_ATTRIBUTE = "data-ga-cta";

export type ScanMode = "single" | "pair" | "batch";
export type A2hsAction = "shown" | "install_click" | "dismissed" | "installed";
export type ShareMethod = "native" | "x" | "download";

/** イベント名とパラメータ。値は列挙値・真偽値・数値だけにする（自由入力の文字列を入れない） */
export type AnalyticsEvents = {
  cta_click: { page: CtaPage; position: CtaPosition };
  /** promo_id は lib/promo/scanWait.ts の設定 ID（利用者の入力ではない） */
  promo_impression: { promo_id: string; vehicle_type: VehicleType };
  promo_click: { promo_id: string; vehicle_type: VehicleType };
  /** trial = 未ログインのお試し読み取り */
  scan_start: { mode: ScanMode; logged_in: boolean; trial: boolean };
  /** is_first = 保存前の記録が 0 件だった。distance_mode は取り込み・復元（複数車両）では mixed */
  record_saved: { source: RecordSource; is_first: boolean; distance_mode: DistanceMode | "mixed" };
  sign_up_prompt_click: { prompt: "trial_exhausted" };
  a2hs_prompt: { action: A2hsAction };
  share_card: { method: ShareMethod };
};

export type AnalyticsEventName = keyof AnalyticsEvents;
type ParamValue = string | number | boolean;

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

/** 列挙値として送ってよい文字列（英小文字・数字・_ - / だけの 40 文字以内）。メール・日本語・URL のクエリは通らない */
const ENUM_LIKE = /^[a-z0-9_/-]{1,40}$/;

/** 送る直前の最終チェック。列挙値らしくない文字列・有限でない数値・それ以外の型は落とす */
export function sanitizeEventParams(params: Record<string, unknown>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string" && ENUM_LIKE.test(value)) out[key] = value;
  }
  return out;
}

function getGtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  return typeof window.gtag === "function" ? window.gtag : null;
}

/** GA4 にイベントを送る。gtag が無い（GA 無効のビルド・読み込み前の SSR）なら何もしない。失敗しても投げない */
export function trackEvent<N extends AnalyticsEventName>(name: N, params: AnalyticsEvents[N]): void {
  const gtag = getGtag();
  if (!gtag) return;
  try {
    gtag("event", name, sanitizeEventParams(params));
  } catch (err) {
    console.error("アクセス解析のイベントを送れませんでした", err);
  }
}

/** クリックされた CTA の page / position。公開ページの既知の位置でなければ null（送らない） */
export function ctaClickParamsOf(pathname: string, position: string | null | undefined): AnalyticsEvents["cta_click"] | null {
  const page = (CTA_PAGES as readonly string[]).includes(pathname) ? (pathname as CtaPage) : null;
  const pos = position && (CTA_POSITIONS as readonly string[]).includes(position) ? (position as CtaPosition) : null;
  return page && pos ? { page, position: pos } : null;
}
