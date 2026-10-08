import { useEffect, useRef } from "react";

/**
 * アプリ内の window イベント（フックのインスタンス間の通知）。
 */

/** 車両削除・一括追加など、給油記録が別経路で変更されたことを useVehicles / useFuelRecords → useFuelRecords へ知らせる window イベント */
export const FUEL_RECORDS_CHANGED_EVENT = "fuel_records_changed";

/** FUEL_RECORDS_CHANGED_EVENT の detail（受け手は使わない。デバッグ用の情報） */
export type FuelRecordsChangedDetail = { vehicleId: string } | { bulk: true };

/**
 * 給油記録が別経路で変わったことを全フックインスタンスへ知らせる（useFuelRecords が再読み込みする。発火元のインスタンスも含む）。
 * SSR 中は何もしない。
 */
export function notifyRecordsChanged(detail: FuelRecordsChangedDetail = { bulk: true }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FUEL_RECORDS_CHANGED_EVENT, { detail }));
}

/**
 * window のイベントを購読するフック。handler は毎回の描画の最新のものを呼ぶ（handler が変わっても購読し直さない）。
 */
export function useWindowEvent(name: string, handler: (event: Event) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = (event: Event) => handlerRef.current(event);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  }, [name]);
}
