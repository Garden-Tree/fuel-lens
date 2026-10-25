import { scrubAnalyticsUrl } from "./scrubUrl";

/**
 * Google Analytics 4（gtag.js）の有効化・初期化・ページビュー（docs/operations.md「Google Analytics 4」）。
 * 有効化は `NEXT_PUBLIC_GA_MEASUREMENT_ID`（G-XXXX）だけで決める。未設定・形式違いのビルドでは gtag を一切読み込まない
 * （Sentry の DSN と同じ考え方。lib/sentry/client.ts）。
 */

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/** 測定 ID。未設定・形式違いなら null（GA は無効） */
export function gaMeasurementIdOf(raw: string | undefined): string | null {
  const id = raw?.trim();
  return id && MEASUREMENT_ID_PATTERN.test(id) ? id : null;
}

/** このビルドの測定 ID（`NEXT_PUBLIC_` はビルド時に埋め込まれる） */
export function gaMeasurementId(): string | null {
  return gaMeasurementIdOf(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
}

/** 共有トークン（?t=）・記録 ID（#record-）を落とした URL。URL として読めなければ空文字（送らない） */
function scrubbed(raw: string): string {
  return raw ? (scrubAnalyticsUrl(raw) ?? "") : "";
}

type GaWindow = Pick<Window, "gtag" | "dataLayer">;

let lastLocation: string | null = null;

/**
 * gtag を用意して config する（1 回だけ。gtag.js の読み込み前でも dataLayer に積まれ、読み込み後に送られる）。
 * 自動のページビューは切り（send_page_view: false）、ページビューは trackPageView で自前で送る。
 * Google シグナルと広告のパーソナライズは使わない。page_location / page_referrer はクエリとハッシュを落とした値で上書きする
 * （gtag は既定で document.location / document.referrer をそのまま送るため）
 */
export function initGtag(id: string, win: GaWindow, location: string, referrer: string): void {
  if (typeof win.gtag === "function") return;
  win.dataLayer = win.dataLayer ?? [];
  const dataLayer = win.dataLayer;
  win.gtag = function gtag() {
    // gtag.js は arguments オブジェクトのまま積まれる前提で動く（配列にすると解釈されない）
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  win.gtag("js", new Date());
  win.gtag("config", id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: scrubbed(location),
    page_referrer: scrubbed(referrer),
  });
}

/**
 * App Router のパス変更ごとのページビュー。直前に送った URL と同じなら送らない（StrictMode の二重実行など）。
 * 以後のイベント（cta_click など）にも同じ page_location が付くよう `set` しておく
 */
export function trackPageView(win: GaWindow, location: string, initialReferrer: string): void {
  if (typeof win.gtag !== "function") return;
  const pageLocation = scrubbed(location);
  if (!pageLocation || pageLocation === lastLocation) return;
  const pageReferrer = lastLocation ?? scrubbed(initialReferrer);
  lastLocation = pageLocation;
  win.gtag("set", { page_location: pageLocation, page_referrer: pageReferrer });
  win.gtag("event", "page_view", { page_location: pageLocation, page_referrer: pageReferrer });
}

/** テスト用: 直前のページビューの記憶を消す */
export function resetPageViewStateForTest(): void {
  lastLocation = null;
}
