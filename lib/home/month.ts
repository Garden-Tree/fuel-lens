/**
 * ホーム画面の「今月」の集計（純粋関数）。月の境界はローカル暦（lib/dates.ts）。日付の無い・不正な記録は数えない。
 */

import { localDateString, normalizeDateString } from "../dates";
import { hasNumber, hasPositiveNumber, recordPrice, sortByDateAsc } from "../stats";
import type { FuelRecord } from "../types";

export type MonthSummary = {
  /** "YYYY-MM"（ローカル暦） */
  monthKey: string;
  /** 見出し（例: 「10月」） */
  label: string;
  /** 今月の給油回数（日付が今月の記録の件数） */
  count: number;
  /** 支払総額の合計（円）。支払総額の分かる記録が無ければ null */
  totalCost: number | null;
  /** 給油量の合計（L。正の値のみ） */
  totalFuel: number;
  /** 今月の最新の単価（円/L）。今月に単価の分かる記録が無ければ null */
  latestPrice: number | null;
  /** latestPrice − その 1 つ前（先月以前を含む）の単価。比べられなければ null */
  priceDiff: number | null;
};

/** today（ローカル）を含む月の記録を集計する */
export function monthSummaryOf(records: ReadonlyArray<FuelRecord>, today: Date): MonthSummary {
  const monthKey = monthKeyOf(today);
  const label = `${today.getMonth() + 1}月`;

  let count = 0;
  let costSum = 0;
  let costCount = 0;
  let totalFuel = 0;

  // 単価は日付の昇順（同日は id 順。統計ページの priceDelta と同じ並び）に並べ、今月の最後と、その 1 つ前を比べる
  const priced: { month: string; price: number }[] = [];
  for (const r of sortByDateAsc(records)) {
    const date = normalizeDateString(r.date);
    if (!date) continue;
    const month = date.slice(0, 7);
    if (month === monthKey) {
      count++;
      if (hasNumber(r.total_cost)) {
        costSum += r.total_cost;
        costCount++;
      }
      if (hasPositiveNumber(r.fuel_amount)) totalFuel += r.fuel_amount;
    }
    const price = recordPrice(r);
    if (price != null && month <= monthKey) priced.push({ month, price });
  }

  let latestPrice: number | null = null;
  let priceDiff: number | null = null;
  const last = priced[priced.length - 1];
  if (last && last.month === monthKey) {
    latestPrice = last.price;
    const prev = priced[priced.length - 2];
    priceDiff = prev ? last.price - prev.price : null;
  }

  return {
    monthKey,
    label,
    count,
    totalCost: costCount > 0 ? costSum : null,
    totalFuel,
    latestPrice,
    priceDiff,
  };
}

/** now（ローカル）の月の "YYYY-MM" */
export function monthKeyOf(now: Date): string {
  return localDateString(now).slice(0, 7);
}

/** "YYYY-MM" の月の 1 日（ローカル）。monthSummaryOf に渡す */
export function monthStartOf(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
