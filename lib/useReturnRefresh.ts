import { useEffect, useRef } from "react";

/**
 * 画面に戻ったときの再取得（他の端末・タブでの変更を、手動で再読み込みしなくても反映する）。
 *
 * - `visibilitychange`（visible に戻った）を主に使い、`window` の `focus` を予備にする（iOS の PWA では visibilitychange が確実）。
 *   離れた時刻は `visibilitychange`（hidden）と `blur` の早いほう。戻ったときに 1 回だけ判定し、続けて届くもう一方のイベントは無視する。
 * - 離れていた時間が `minHiddenMs`（既定 10 秒）未満のタブ切り替えでは再取得しない。
 * - 購読者ごとに `minIntervalMs`（既定 30 秒）に 1 回まで。オフライン（`navigator.onLine === false`）では何もしない。
 * - 離れた時刻はタブ内で共有する（document / window のリスナーは購読者がいる間だけ 1 組）。
 *   同じ画面の複数のフック（useVehicles と useFuelRecords）は、戻るたびにそれぞれ 1 回ずつ呼ばれる。
 */

export const RETURN_REFRESH_MIN_HIDDEN_MS = 10 * 1000;
export const RETURN_REFRESH_MIN_INTERVAL_MS = 30 * 1000;

export type ReturnRefreshInput = {
  /** 画面から離れた時刻（ms）。離れていなければ null */
  hiddenAt: number | null;
  now: number;
  /** この購読者が最後に再取得した時刻（ms）。まだなら null */
  lastRefreshAt: number | null;
  minHiddenMs?: number;
  minIntervalMs?: number;
  /** navigator.onLine。false なら再取得しない（省略時はオンライン扱い） */
  online?: boolean;
};

/** 画面に戻ったときに再取得するかを決める（純粋関数） */
export function shouldRefreshOnReturn({
  hiddenAt,
  now,
  lastRefreshAt,
  minHiddenMs = RETURN_REFRESH_MIN_HIDDEN_MS,
  minIntervalMs = RETURN_REFRESH_MIN_INTERVAL_MS,
  online = true,
}: ReturnRefreshInput): boolean {
  if (!online) return false;
  if (hiddenAt == null) return false;
  if (now - hiddenAt < minHiddenMs) return false;
  if (lastRefreshAt != null && now - lastRefreshAt < minIntervalMs) return false;
  return true;
}

type Subscriber = {
  minHiddenMs: number;
  minIntervalMs: number;
  lastRefreshAt: { current: number | null };
  run: () => void;
};

const subscribers = new Set<Subscriber>();
/** タブ内で共有する「画面から離れた時刻」。戻ったときに null に戻す */
let hiddenAt: number | null = null;

function markHidden(): void {
  if (hiddenAt == null) hiddenAt = Date.now();
}

function handleReturn(): void {
  const since = hiddenAt;
  hiddenAt = null;
  if (since == null) return;
  const now = Date.now();
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  for (const s of [...subscribers]) {
    const refresh = shouldRefreshOnReturn({
      hiddenAt: since,
      now,
      lastRefreshAt: s.lastRefreshAt.current,
      minHiddenMs: s.minHiddenMs,
      minIntervalMs: s.minIntervalMs,
      online,
    });
    if (!refresh) continue;
    s.lastRefreshAt.current = now;
    try {
      s.run();
    } catch (e) {
      console.error("画面復帰時の再取得に失敗:", e);
    }
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "hidden") markHidden();
  else handleReturn();
}

function onFocus(): void {
  if (document.visibilityState !== "hidden") handleReturn();
}

function install(): void {
  hiddenAt = document.visibilityState === "hidden" ? Date.now() : null;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("blur", markHidden);
  window.addEventListener("focus", onFocus);
}

function uninstall(): void {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("blur", markHidden);
  window.removeEventListener("focus", onFocus);
  hiddenAt = null;
}

export type UseReturnRefreshOptions = {
  /** false の間は購読しない（未ログイン・障害中など） */
  enabled?: boolean;
  minHiddenMs?: number;
  minIntervalMs?: number;
};

/**
 * 画面に戻ったとき（しばらく離れていた場合だけ）callback を呼ぶ。callback は毎回の描画の最新のものを呼ぶ。
 * 判定は `shouldRefreshOnReturn`。SSR 中は何もしない。
 */
export function useReturnRefresh(callback: () => void, options: UseReturnRefreshOptions = {}): void {
  const {
    enabled = true,
    minHiddenMs = RETURN_REFRESH_MIN_HIDDEN_MS,
    minIntervalMs = RETURN_REFRESH_MIN_INTERVAL_MS,
  } = options;
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  // 購読し直しても（enabled の切り替えなど）間隔の制限は引き継ぐ
  const lastRefreshAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") return;
    const subscriber: Subscriber = {
      minHiddenMs,
      minIntervalMs,
      lastRefreshAt,
      run: () => callbackRef.current(),
    };
    if (subscribers.size === 0) install();
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) uninstall();
    };
  }, [enabled, minHiddenMs, minIntervalMs]);
}
