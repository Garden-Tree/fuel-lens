import { normalizeDateString } from "../dates";
import type { FuelRecord } from "../types";

/**
 * 履歴画面（/history）の月ごとのまとまり。純粋関数（React・DOM に依存しない）。
 */

export type MonthGroup<T> = {
  /** "YYYY-MM"。日付なしのまとまりは "none" */
  key: string;
  /** 見出し（「2026年9月」、shortLabel なら「9月」、日付なしは「日付なし」） */
  label: string;
  /** 件数 */
  count: number;
  /** 支払総額の合計（円）。支払総額の無い記録は 0 として足す */
  totalCost: number;
  records: T[];
};

export const NO_DATE_GROUP_KEY = "none";
export const NO_DATE_GROUP_LABEL = "日付なし";

export type GroupByMonthOptions = {
  /** 見出しを「9月」にする（年を 1 つに絞り込んでいるとき） */
  shortLabel?: boolean;
};

/** 支払総額の合計。有限の数値だけを足す */
export function sumTotalCost(records: readonly Pick<FuelRecord, "total_cost">[]): number {
  return records.reduce(
    (sum, r) => (typeof r.total_cost === "number" && Number.isFinite(r.total_cost) ? sum + r.total_cost : sum),
    0
  );
}

/**
 * 絞り込み・並べ替え済みの記録を月ごとのまとまりに分ける。
 * - まとまりの順は、各月の記録が最初に現れた順（給油日の新しい順なら新しい月から）。各まとまりの中の順も入力のまま
 * - 日付が欠落・不正な記録は最後の「日付なし」にまとめる
 */
export function groupByMonth<T extends Pick<FuelRecord, "date" | "total_cost">>(
  records: readonly T[],
  { shortLabel = false }: GroupByMonthOptions = {}
): MonthGroup<T>[] {
  const groups = new Map<string, T[]>();
  const noDate: T[] = [];
  for (const record of records) {
    const date = normalizeDateString(record.date);
    if (!date) {
      noDate.push(record);
      continue;
    }
    const key = date.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }

  const result: MonthGroup<T>[] = [];
  for (const [key, list] of groups) {
    const [y, m] = key.split("-");
    result.push({
      key,
      label: shortLabel ? `${Number(m)}月` : `${y}年${Number(m)}月`,
      count: list.length,
      totalCost: sumTotalCost(list),
      records: list,
    });
  }
  if (noDate.length > 0) {
    result.push({
      key: NO_DATE_GROUP_KEY,
      label: NO_DATE_GROUP_LABEL,
      count: noDate.length,
      totalCost: sumTotalCost(noDate),
      records: noDate,
    });
  }
  return result;
}
