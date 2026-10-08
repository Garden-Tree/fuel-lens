/**
 * 統計: スタンド別比較の表示行の選択と、棒グラフの長さ（純粋関数）。
 * /stats のスタンド別単価カードが使う。
 */

import type { StationComparison, StationSummary } from "./prices";

/** 表示するスタンドの最大件数 */
export const MAX_STATION_ROWS = 8;

/** 棒の最小幅（%）。最安のスタンドにこの幅を割り当てる */
export const STATION_BAR_MIN_WIDTH = 15;

/**
 * 表示するスタンドの行を選ぶ。
 * 先頭（給油回数の多い順）から max 件。「最安」のスタンドが入らないときは最後の 1 件と入れ替えて必ず見せる。
 * hiddenCount は表示されなかったスタンドの件数（「他 n 件」）。
 */
export function selectStationRows(
  comparison: Pick<StationComparison, "groups" | "cheapestKey">,
  max: number = MAX_STATION_ROWS
): { rows: StationSummary[]; hiddenCount: number } {
  let rows = comparison.groups.slice(0, max);
  const cheapestGroup = comparison.groups.find(g => g.key === comparison.cheapestKey);
  if (cheapestGroup && !rows.includes(cheapestGroup)) {
    rows = [...rows.slice(0, max - 1), cheapestGroup];
  }
  return { rows, hiddenCount: comparison.groups.length - rows.length };
}

/**
 * 棒の長さ（%）。表示中のスタンドの平均単価の最安 → 15%、最高 → 100% に線形で割り当てる。
 * 単価の差は数円程度でゼロ基準だと見分けられないため、差を強調する（1 件だけ・全て同額なら 100%）。
 * 平均単価・最安・最高のいずれかが null なら 0。
 */
export function stationBarWidth(avgPrice: number | null, min: number | null, max: number | null): number {
  if (avgPrice == null || min == null || max == null) return 0;
  if (max <= min) return 100;
  return STATION_BAR_MIN_WIDTH + ((avgPrice - min) / (max - min)) * (100 - STATION_BAR_MIN_WIDTH);
}
