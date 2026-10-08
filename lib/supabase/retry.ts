import { getOutage } from "./outage";

// ------------------------------------------------------------------
// 障害からの復旧（再試行）
// ------------------------------------------------------------------

/** useVehicles / useFuelRecords に再読み込みを依頼する window イベント */
export const SUPABASE_RETRY_EVENT = "fuel_lens_retry";
/** online / visibilitychange による自動再試行の最小間隔 */
const AUTO_RETRY_MIN_INTERVAL_MS = 30 * 1000;
let lastAutoRetryAt = 0;

/** クラウドデータの再読み込みを依頼する（バナーの「再試行」ボタン・自動再試行から呼ぶ） */
export function requestSupabaseRetry(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPABASE_RETRY_EVENT));
}

/**
 * 障害中、ネットワーク復帰（online）とタブの再表示（visibilitychange → visible）で
 * 自動的に再試行する。間隔は 30 秒に 1 回まで。戻り値は購読解除関数。
 */
export function subscribeOutageAutoRetry(): () => void {
  if (typeof window === "undefined") return () => {};
  const tryRetry = () => {
    if (!getOutage()) return;
    const now = Date.now();
    if (now - lastAutoRetryAt < AUTO_RETRY_MIN_INTERVAL_MS) return;
    lastAutoRetryAt = now;
    requestSupabaseRetry();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") tryRetry();
  };
  window.addEventListener("online", tryRetry);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("online", tryRetry);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
