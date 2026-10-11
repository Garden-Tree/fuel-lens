"use client";

import { useSyncExternalStore } from "react";
import { monthKeyOf } from "./month";

// 画面に戻ってきたとき（PWA を開き直した・タブを切り替えた）に月を読み直す
function subscribe(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

const currentMonthKey = () => monthKeyOf(new Date());

/**
 * いまの月（ローカル暦の "YYYY-MM"）。描画のたびに現在の日付から求め、画面に戻ってきたとき
 * （visibilitychange / focus）にも読み直すので、開いたまま月をまたいだ PWA でも新しい月に切り替わる。
 * スナップショットは文字列なので、月が変わらない限り再描画しない。
 * サーバーでも同じ式で求める（ホームの「今月」は読み込み完了後にだけ描画するため、ハイドレーションでは使われない）。
 */
export function useCurrentMonthKey(): string {
  return useSyncExternalStore(subscribe, currentMonthKey, currentMonthKey);
}
