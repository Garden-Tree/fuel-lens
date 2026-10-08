/**
 * 統計: グラフ用の系列（燃費・月別支払総額・単価）と、Y 軸・時間軸の範囲の計算。
 */

import type { FuelRecord } from "../types";
import { normalizeDateString, parseLocalDate } from "../dates";
import { detectStationBrand, normalizeStationName } from "../stations";
import { hasNumber, hasPositiveNumber } from "./period";
import { pricedRecordsAsc } from "./prices";

/** 燃費グラフ 1 点分 */
export type EfficiencyPoint = {
  /** ローカル日付 0 時のエポックミリ秒（X 軸用） */
  timestamp: number;
  /** YYYY-MM-DD */
  name: string;
  efficiency: number;
  cost: number;
  gasStation: string;
};

/** 月別支払総額グラフ 1 本分 */
export type MonthlyCostPoint = {
  /** 表示ラベル "YYYY/M月" */
  month: string;
  /** 並び替え用キー "YYYY-MM" */
  key: string;
  cost: number;
};

/** 燃費グラフの Y 軸設定 */
/** グラフの時間軸の範囲 [最小, 最大]（epoch ms。buildTimeDomain） */
export type TimeDomain = [number, number];

export type EfficiencyAxis = {
  /** [min, max]。データなしは undefined（recharts の auto に任せる） */
  domain: [number, number] | undefined;
  /** 目盛り値（平均値を含む）。データなしは undefined */
  ticks: number[] | undefined;
  /** 目盛りに差し込んだ平均値（小数第2位で丸め済み）。平均なしは null */
  averageTick: number | null;
};

/**
 * 燃費グラフ用の系列を作る。
 * 対象: 有効な日付があり、燃費が正の記録。日付の昇順。
 * 金額だけの記録（燃費 null）を 0 として描くと折れ線が急落するため除外する。
 */
export function buildEfficiencySeries(records: ReadonlyArray<FuelRecord>): EfficiencyPoint[] {
  const points: EfficiencyPoint[] = [];
  for (const r of records) {
    if (!hasPositiveNumber(r.fuel_efficiency)) continue;
    const date = normalizeDateString(r.date);
    if (!date) continue;
    const dt = parseLocalDate(date) as Date;
    points.push({
      timestamp: dt.getTime(),
      name: date,
      efficiency: r.fuel_efficiency,
      cost: hasNumber(r.total_cost) ? r.total_cost : 0,
      gasStation: r.gas_station || "不明",
    });
  }
  points.sort((a, b) => a.timestamp - b.timestamp || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return points;
}

/**
 * 月別の支払総額を集計する。
 * 対象: 有効な日付があり、支払総額が正の記録。年月の昇順。
 */
export function buildMonthlyCostSeries(records: ReadonlyArray<FuelRecord>): MonthlyCostPoint[] {
  const map = new Map<string, number>();
  for (const r of records) {
    if (!hasPositiveNumber(r.total_cost)) continue;
    const date = normalizeDateString(r.date);
    if (!date) continue;
    const key = date.slice(0, 7); // YYYY-MM
    map.set(key, (map.get(key) ?? 0) + r.total_cost);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, cost]) => {
      const [y, m] = key.split("-");
      return { key, month: `${y}/${Number(m)}月`, cost };
    });
}

/**
 * 燃費グラフの Y 軸の範囲と目盛りを求める。
 * データ範囲に 15% の余白を付け、5 等分した目盛りに平均値（小数第2位で丸め）を差し込む。
 * 目盛りの判定で平均値と比較する際は、ここで返す averageTick（丸め済み）を使うこと。
 * 元の平均値（丸め前）と比較すると、浮動小数の誤差でラベルが一致しない。
 */
export function buildEfficiencyAxis(
  series: ReadonlyArray<Pick<EfficiencyPoint, "efficiency">>,
  average: number | null
): EfficiencyAxis {
  return buildValueAxis(series.map(p => p.efficiency), average, roundTo2);
}

/**
 * 値の配列から Y 軸の範囲と目盛りを求める共通処理（buildEfficiencyAxis / buildPriceAxis）。
 * round は目盛り値と平均値の丸め（燃費は小数第2位、単価は小数第1位）。
 */
function buildValueAxis(
  values: ReadonlyArray<number>,
  average: number | null,
  round: (v: number) => number
): EfficiencyAxis {
  if (values.length === 0) return { domain: undefined, ticks: undefined, averageTick: null };

  let min = Math.min(...values);
  let max = Math.max(...values);
  const averageTick = average != null && average > 0 ? round(average) : null;
  if (averageTick != null) {
    min = Math.min(min, averageTick);
    max = Math.max(max, averageTick);
  }

  const pad = (max - min) * 0.15 || 1;
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const step = (yMax - yMin) / 4;
  const base = [0, 1, 2, 3, 4].map(i => round(yMin + step * i));
  const ticks = averageTick != null
    ? Array.from(new Set([...base, averageTick])).sort((a, b) => a - b)
    : base;

  return { domain: [yMin, yMax], ticks, averageTick };
}

/** 小数第2位で丸める（toFixed(2) と同じ丸め） */
export function roundTo2(v: number): number {
  return parseFloat(v.toFixed(2));
}

/**
 * X 軸（時刻）の表示範囲。データ範囲の 5%（最低 1 日）を前後に余白として付ける。
 */
export function buildTimeDomain(series: ReadonlyArray<Pick<EfficiencyPoint, "timestamp">>): TimeDomain | null {
  if (series.length === 0) return null;
  const times = series.map(p => p.timestamp);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const oneDay = 86_400_000;
  const padding = Math.max((max - min) * 0.05, oneDay);
  return [min - padding, max + padding];
}

/** 小数第1位で丸める（toFixed(1) と同じ丸め。単価の目盛り用） */
export function roundTo1(v: number): number {
  return parseFloat(v.toFixed(1));
}

/** 単価グラフ 1 点分 */
export type PricePoint = {
  /** ローカル日付 0 時のエポックミリ秒（X 軸用） */
  timestamp: number;
  /** 表示ラベル "M/D" */
  name: string;
  /** 単価 (円/L) */
  price: number;
  /** 正規化した店舗名（normalizeStationName）。店舗名なしは null */
  station: string | null;
  /** ブランドの表示名（detectBrand）。判定できなければ null */
  brand: string | null;
};

/**
 * 単価グラフ用の系列を作る。
 * 対象: 有効な日付があり、単価（recordPrice）が正の記録。日付の昇順（同日は id 順）。
 */
export function buildPriceSeries(records: ReadonlyArray<FuelRecord>): PricePoint[] {
  return pricedRecordsAsc(records).map(({ record, date, price }) => {
    const dt = parseLocalDate(date) as Date;
    const station = normalizeStationName(record.gas_station);
    return {
      timestamp: dt.getTime(),
      name: `${dt.getMonth() + 1}/${dt.getDate()}`,
      price,
      station: station || null,
      brand: detectStationBrand(record.gas_station)?.label ?? null,
    };
  });
}

/** 単価グラフの Y 軸。buildEfficiencyAxis と同じ考え方で、目盛りと平均値を小数第1位に丸める */
export function buildPriceAxis(
  series: ReadonlyArray<Pick<PricePoint, "price">>,
  average: number | null
): EfficiencyAxis {
  return buildValueAxis(series.map(p => p.price), average, roundTo1);
}
