/**
 * 給油記録に関する数値計算を共通化するユーティリティ
 *
 * 【前提】本アプリの燃費計算は「満タン法」を前提とする。
 * 燃費 = 前回給油からの走行距離 ÷ 今回の給油量。
 * そのため distance には、トリップメーターの区間距離（前回給油時にリセットした値）を渡す想定であり、
 * オドメーター（積算距離）の絶対値ではない。詳細は README「燃費の計算について（満タン法）」を参照。
 */

/**
 * 走行距離、給油量、支払総額から単価と燃費を安全に計算して返します。
 * - 単価 (円/L) は小数第 1 位に丸める（`Math.round(x * 10) / 10`）。国内の給油機は 0.1 円/L 単位で精算するため。
 *   lib/analyze.ts の derivePricePerUnit が同じ丸めを複製しているので、変更時は両方を揃えること。
 * - 燃費 (km/L) は小数第 2 位に丸める（`toFixed(2)`）。
 * @param distance 走行距離 (km)。満タン法のため「前回給油からの区間距離（トリップ）」を渡すこと。
 * @param amount 給油量 (L)
 * @param cost 支払総額 (円)
 */
export function calculateFuelMetrics(
  distance: number | null | undefined,
  amount: number | null | undefined,
  cost: number | null | undefined
): {
  price_per_unit: number | null;
  fuel_efficiency: number | null;
} {
  let price_per_unit: number | null = null;
  let fuel_efficiency: number | null = null;

  // 単価の計算 (総額 / 給油量)。0.1 円/L 単位に丸める
  if (cost != null && amount != null && amount > 0) {
    price_per_unit = Math.round((cost / amount) * 10) / 10;
  }

  // 燃費の計算 (走行距離 / 給油量)
  if (distance != null && amount != null && amount > 0) {
    // 小数点第2位まで丸める
    fuel_efficiency = roundFuelEfficiency(distance / amount);
  }

  return { price_per_unit, fuel_efficiency };
}

/**
 * 燃費 (km/L) の丸め。小数第 2 位（`toFixed(2)`）。
 * calculateFuelMetrics と lib/fillChain.ts の applyFillChain（部分給油の合算）で共有する。
 */
export function roundFuelEfficiency(value: number): number {
  return parseFloat(value.toFixed(2));
}

/**
 * 単価 (円/L) の表示用文字列。常に小数第 1 位まで出す（例: 141.8 → "141.8"、160 → "160.0"）。
 * 丸めルール変更前に保存された整数の単価も同じ桁数で表示するため。null / 非有限値は "--"。
 * 通貨記号や単位は呼び出し側で付ける。
 */
export function formatPricePerUnit(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "--";
}
