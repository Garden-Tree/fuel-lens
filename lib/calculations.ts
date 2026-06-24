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

  // 単価の計算 (総額 / 給油量)
  if (cost != null && amount != null && amount > 0) {
    price_per_unit = Math.round(cost / amount);
  }

  // 燃費の計算 (走行距離 / 給油量)
  if (distance != null && amount != null && amount > 0) {
    // 小数点第2位まで丸める
    fuel_efficiency = parseFloat((distance / amount).toFixed(2));
  }

  return { price_per_unit, fuel_efficiency };
}
