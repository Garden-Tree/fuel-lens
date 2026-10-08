/**
 * 統計ページ（/stats）の表示モデル。記録と期間から、ページが描画に使う値をまとめて導出する純粋関数。
 */

import type { FuelRecord } from "../types";
import { filterByPeriod, countUnknownDate, hasStatsData, sortByDateAsc } from "./period";
import type { Period } from "./period";
import { summarize } from "./summary";
import type { StatsSummary } from "./summary";
import {
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
  buildPriceAxis,
  buildPriceSeries,
  buildTimeDomain,
} from "./series";
import type { EfficiencyAxis, EfficiencyPoint, MonthlyCostPoint, PricePoint, TimeDomain } from "./series";
import { priceDelta, summarizeStations } from "./prices";
import type { PriceDelta, StationComparison, StationSummary } from "./prices";
import { selectStationRows, stationBarWidth } from "./stationRows";

/** スタンド比較 1 行分（表示用） */
export type StationRowModel = {
  group: StationSummary;
  isCheapest: boolean;
  /** 棒の長さ（%） */
  barWidth: number;
};

export type StatsModel = {
  period: Period;
  /** 日付が不明（欠落・不正）な記録の件数（期間フィルタ・グラフの対象外） */
  unknownDateCount: number;
  /** 期間フィルタ後の記録 */
  filteredRecords: FuelRecord[];
  /** 統計に使える値を持つ記録の件数 */
  validRecordCount: number;
  summary: StatsSummary;
  efficiency: {
    series: EfficiencyPoint[];
    axis: EfficiencyAxis;
    timeDomain: TimeDomain | null;
  };
  monthlyCost: MonthlyCostPoint[];
  price: {
    series: PricePoint[];
    axis: EfficiencyAxis;
    timeDomain: TimeDomain | null;
    /** 最新の給油の前回比など。期間フィルタを掛けない全記録で求める */
    delta: PriceDelta;
  };
  stations: {
    comparison: StationComparison;
    rows: StationRowModel[];
    hiddenCount: number;
  };
};

export function buildStatsModel(records: ReadonlyArray<FuelRecord>, period: Period, today: Date): StatsModel {
  const filteredRecords = filterByPeriod(records, period, today);
  // 統計に使える値（燃費 or 支払総額）を持つ記録を日付昇順で
  const validRecords = sortByDateAsc(filteredRecords.filter(hasStatsData));
  // 平均は validRecords から、合計（走行距離・給油量・支払総額）は燃費も支払総額も無い部分給油・持ち越し行を含む期間内の全記録から
  const summary = summarize(validRecords, filteredRecords);

  const efficiencySeries = buildEfficiencySeries(validRecords);
  // 参照線はサマリーカードと同じ Σkm/ΣL を使い、表示上の数値を一致させる
  const efficiencyAxis = buildEfficiencyAxis(efficiencySeries, summary.avgEfficiency);

  // 単価トレンドとスタンド比較は期間フィルタ後の全記録から（単価・店舗名の有無は各関数が判定する）
  const comparison = summarizeStations(filteredRecords);
  const priceSeries = buildPriceSeries(filteredRecords);
  // 平均線は期間の平均単価（Σ支払総額 ÷ Σ給油量。サマリーカードの平均単価と同じ規則）
  const priceAxis = buildPriceAxis(priceSeries, comparison.overallAvgPrice);

  const { rows, hiddenCount } = selectStationRows(comparison);
  const prices = rows.flatMap(g => (g.avgPrice != null ? [g.avgPrice] : []));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  return {
    period,
    unknownDateCount: countUnknownDate(records),
    filteredRecords,
    validRecordCount: validRecords.length,
    summary,
    efficiency: {
      series: efficiencySeries,
      axis: efficiencyAxis,
      timeDomain: buildTimeDomain(efficiencySeries),
    },
    monthlyCost: buildMonthlyCostSeries(validRecords),
    price: {
      series: priceSeries,
      axis: priceAxis,
      timeDomain: buildTimeDomain(priceSeries),
      // 「前回比」は最新の給油についての表示なので、比較の基準が期間フィルタで欠けないよう全記録で求める
      delta: priceDelta(records),
    },
    stations: {
      comparison,
      rows: rows.map(group => ({
        group,
        isCheapest: group.key === comparison.cheapestKey,
        barWidth: stationBarWidth(group.avgPrice, minPrice, maxPrice),
      })),
      hiddenCount,
    },
  };
}
