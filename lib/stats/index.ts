/**
 * 統計ページ（/stats）用の純粋な集計ロジック。`@/lib/stats` はこのファイルに解決される。
 *
 * - period.ts: 期間フィルタ・並び替え・基本ヘルパ
 * - summary.ts: サマリーカード用の集計（summarize。燃費は満タン法の run 単位）
 * - series.ts: グラフ用の系列と Y 軸・時間軸の範囲
 * - prices.ts: 単価・スタンド別の集計・前回比
 * - stationRows.ts: スタンド比較の表示行の選択と棒の長さ
 */

export {
  PERIOD_MONTHS,
  countUnknownDate,
  filterByPeriod,
  hasNumber,
  hasPositiveNumber,
  hasStatsData,
  hasValidDate,
  sortByDateAsc,
} from "./period";
export type { Period } from "./period";

export { summarize } from "./summary";
export type { StatsSummary } from "./summary";

export {
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
  buildPriceAxis,
  buildPriceSeries,
  buildTimeDomain,
  roundTo1,
  roundTo2,
} from "./series";
export type { EfficiencyAxis, EfficiencyPoint, MonthlyCostPoint, PricePoint, TimeDomain } from "./series";

export { priceDelta, recordPrice, summarizeStations } from "./prices";
export type { PriceDelta, PriceSample, StationComparison, StationSummary } from "./prices";

export { MAX_STATION_ROWS, STATION_BAR_MIN_WIDTH, selectStationRows, stationBarWidth } from "./stationRows";

export { buildStatsModel } from "./model";
export type { StationRowModel, StatsModel } from "./model";
