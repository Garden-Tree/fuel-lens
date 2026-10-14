"use client";

import { useSyncExternalStore } from "react";
import { localDateString } from "../dates";
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

const currentDayKey = () => localDateString(new Date());

/**
 * 今日（ローカル暦の "YYYY-MM-DD"）。useCurrentMonthKey と同じく、画面に戻ってきたときにも読み直す。
 * シェアカード（今月 / 直近 30 日）の期間に使う。
 */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, currentDayKey, currentDayKey);
}
