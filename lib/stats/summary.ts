/**
 * 統計: サマリーカード用の集計（summarize）。
 *
 * 【燃費の平均について（満タン法）】
 * 本アプリの燃費は満タン法（燃費 = 前回の満タン給油からの走行距離 ÷ 給油量）で算出する。
 * この前提では、期間全体の燃費は「各給油の燃費の単純平均」ではなく
 * 「Σ走行距離 ÷ Σ給油量」（走行距離で重み付けした調和平均に相当）が正しい。
 * 例: 100km/10L (10km/L) と 500km/25L (20km/L) の 2 回なら、
 *   単純平均 = 15 km/L だが、実際は 600km / 35L = 17.14 km/L。
 * そのため summarize() の avgEfficiency は Σkm/ΣL を返し、
 * 参考値として単純平均 meanEfficiency も併せて返す。
 *
 * 【run 単位で集計する理由】
 * 部分給油・持ち越し行（オドメーターモードでオドメーターが無い・戻った記録）は、距離と給油量の片方しか持たない、
 * あるいは次の満タン給油の距離に自分の分が含まれる。記録ごとに「距離と給油量の両方がある記録」を拾うと
 * 分子と分母で区間がずれて値が歪む（例: A(1000 km) → B(ODO なし, 20 L) → C(1600 km, 20 L) で C の 600 km を 20 L で割ってしまう）。
 * そこで燃費と走行コストは、連鎖計算（lib/fillChain.ts の applyFillChain）が満タン給油で閉じた run の記録に付ける
 * run_distance / run_fuel / run_cost（導出値）だけで Σ ÷ Σ を求める。
 * 全件が満タンのトリップモードでは各記録が 1 件の run なので、従来の記録ごとの集計と同じ値になる。
 */

import type { FuelRecord } from "../types";
import { hasNumber, hasPositiveNumber } from "./period";

/** summarize() の戻り値 */
export type StatsSummary = {
  /** 集計対象の記録件数 */
  count: number;
  /**
   * 期間平均燃費 = Σrun_distance ÷ Σrun_fuel（満タン給油で閉じた run のうち、距離と給油量が正のもの）。対象なしは null。
   * run は連鎖計算が燃費の出た記録に付ける導出値（部分給油・持ち越し行の分を含む）
   */
  avgEfficiency: number | null;
  /** 各記録の燃費（fuel_efficiency > 0）の単純平均。参考値。対象なしは null */
  meanEfficiency: number | null;
  /** 支払総額の合計（有効な数値の記録すべて） */
  totalCost: number;
  /** 平均単価 = Σ支払総額 ÷ Σ給油量（両方が正の記録のみ）。対象なしは null */
  avgPricePerUnit: number | null;
  /**
   * 走行コスト = Σrun_cost ÷ Σrun_distance（満タン給油で閉じた run のうち、支払総額がすべて分かり、距離と支払総額が正のもの）。
   * 対象なしは null
   */
  costPerKm: number | null;
  /** 走行距離の合計（正の値の記録すべて） */
  totalDistance: number;
  /** 給油量の合計（正の値の記録すべて） */
  totalFuel: number;
};


/**
 * サマリーカード用の集計。
 *
 * 比率系の指標は、分子と分母の両方が正の値として存在する対象だけで「合計 ÷ 合計」を求める。
 * 片方しか無いものを混ぜると、分子と分母で母集団が異なり値が歪むため。
 * - 平均燃費・走行コスト: 満タン給油で閉じた run 単位（run_distance / run_fuel / run_cost を持つ記録。ファイル先頭のコメント参照）。
 *   期間フィルタ後の記録を渡した場合、run を閉じた記録が期間内なら、その run の全体（期間より前の部分給油を含む）を数える
 * - 平均単価: 記録単位（支払総額と給油量の両方が正の記録）
 * 合計（totalDistance / totalFuel / totalCost）は記録ごとの値をそのまま合算する（部分給油・持ち越し行も含む）。
 * 各記録の燃費の単純平均は meanEfficiency として参考値で返す。
 */
export function summarize(records: ReadonlyArray<FuelRecord>): StatsSummary {
  let totalCost = 0;
  let totalDistance = 0;
  let totalFuel = 0;

  // run 単位の集計（満タン給油で閉じた run のみ）
  let effDistance = 0;
  let effFuel = 0;
  let kmCost = 0;
  let kmDistance = 0;
  // 記録単位のペア集計（両方が正の記録のみ）
  let priceCost = 0;
  let priceFuel = 0;

  let effSum = 0;
  let effCount = 0;

  for (const r of records) {
    const cost = r.total_cost;
    const fuel = r.fuel_amount;
    const dist = r.total_distance;

    if (hasNumber(cost)) totalCost += cost;
    if (hasPositiveNumber(dist)) totalDistance += dist;
    if (hasPositiveNumber(fuel)) totalFuel += fuel;

    const runDistance = r.run_distance;
    const runFuel = r.run_fuel;
    const runCost = r.run_cost;
    if (hasPositiveNumber(runDistance) && hasPositiveNumber(runFuel)) {
      effDistance += runDistance;
      effFuel += runFuel;
    }
    if (hasPositiveNumber(runDistance) && hasPositiveNumber(runCost)) {
      kmCost += runCost;
      kmDistance += runDistance;
    }
    if (hasPositiveNumber(cost) && hasPositiveNumber(fuel)) {
      priceCost += cost;
      priceFuel += fuel;
    }
    if (hasPositiveNumber(r.fuel_efficiency)) {
      effSum += r.fuel_efficiency;
      effCount++;
    }
  }

  return {
    count: records.length,
    avgEfficiency: effFuel > 0 ? effDistance / effFuel : null,
    meanEfficiency: effCount > 0 ? effSum / effCount : null,
    totalCost,
    avgPricePerUnit: priceFuel > 0 ? priceCost / priceFuel : null,
    costPerKm: kmDistance > 0 ? kmCost / kmDistance : null,
    totalDistance,
    totalFuel,
  };
}
