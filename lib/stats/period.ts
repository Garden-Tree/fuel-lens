/**
 * 統計: 期間フィルタ・並び替え・基本ヘルパ（lib/stats/index.ts から再エクスポート）。
 * 日付の検証・変換の実体は lib/dates.ts。
 */

import type { FuelRecord } from "../types";
import { localDateString, normalizeDateString, subtractMonthsClamped } from "../dates";

/** 期間フィルタの種別（全期間 / 1年 / 6ヶ月 / 3ヶ月） */
export type Period = "all" | "1y" | "6m" | "3m";

/** 期間種別 → 遡る月数（"all" は undefined） */
export const PERIOD_MONTHS: Record<Exclude<Period, "all">, number> = {
  "1y": 12,
  "6m": 6,
  "3m": 3,
};

// ---------------------------------------------------------------------------
// 基本ヘルパ
// ---------------------------------------------------------------------------

/** 有限の number か（null / undefined / NaN / Infinity を弾く） */
export function hasNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 正の有限 number か */
export function hasPositiveNumber(v: unknown): v is number {
  return hasNumber(v) && v > 0;
}

/** 記録に有効な日付があるか */
export function hasValidDate(record: Pick<FuelRecord, "date">): boolean {
  return normalizeDateString(record.date) !== null;
}

/** 日付が不明（欠落・不正）な記録の件数 */
export function countUnknownDate(records: ReadonlyArray<Pick<FuelRecord, "date">>): number {
  let n = 0;
  for (const r of records) if (!hasValidDate(r)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// フィルタ・並び替え
// ---------------------------------------------------------------------------

/**
 * 期間フィルタ。
 * - "all": 全記録をそのまま返す（日付不明の記録も含む）。
 * - それ以外: today から n ヶ月前（日付は月末に丸め）の "YYYY-MM-DD" を下限とし、
 *   `record.date >= cutoff` を文字列の辞書順で比較する。日付不明の記録は除外する。
 *
 * タイムゾーンに依存しないよう、Date の比較ではなく文字列比較にしている
 * （`new Date("YYYY-MM-DD")` は UTC 0 時に解釈され、ローカルの now とずれる）。
 */
export function filterByPeriod<T extends Pick<FuelRecord, "date">>(
  records: ReadonlyArray<T>,
  period: Period,
  today: Date
): T[] {
  if (period === "all") return [...records];
  const months = PERIOD_MONTHS[period];
  const cutoff = localDateString(subtractMonthsClamped(today, months));
  return records.filter(r => {
    const d = normalizeDateString(r.date);
    return d !== null && d >= cutoff;
  });
}

/**
 * 日付の昇順に並び替える。日付不明の記録は末尾に置く。
 * 同一日付は id の昇順で安定化する。
 */
export function sortByDateAsc<T extends Pick<FuelRecord, "date" | "id">>(records: ReadonlyArray<T>): T[] {
  return [...records].sort((a, b) => {
    const da = normalizeDateString(a.date);
    const db = normalizeDateString(b.date);
    if (da === db) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da < db ? -1 : 1;
  });
}

/** 統計に使える値（燃費または支払総額）を 1 つ以上持つ記録か */
export function hasStatsData(record: Pick<FuelRecord, "fuel_efficiency" | "total_cost">): boolean {
  return hasNumber(record.fuel_efficiency) || hasNumber(record.total_cost);
}
