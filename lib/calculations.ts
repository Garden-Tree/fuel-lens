/**
 * 給油記録に関する数値計算を共通化するユーティリティ
 */

/**
 * 走行距離、給油量、支払総額から単価と燃費を安全に計算して返します。
 * @param distance 走行距離 (km)
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
