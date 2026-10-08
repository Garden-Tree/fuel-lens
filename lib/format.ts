import type { FuelRecord } from "./types";

/**
 * 表示用の純粋なフォーマットヘルパー（React・DOM に依存しない）。
 */

/** 燃費が null の理由（短い文言）。燃費があれば null。仕様は docs/design-fill-chain.md 4 章「履歴カード」 */
export function efficiencyNullReason(record: Pick<FuelRecord, "fuel_efficiency" | "is_full" | "fuel_amount">): string | null {
  if (record.fuel_efficiency) return null;
  if (record.is_full === false) return "部分給油（次の満タンで計算）";
  if (record.fuel_amount == null || record.fuel_amount <= 0) return "給油量不明";
  return "区間不明";
}

/** オドメーターの表示（例: 「ODO 12,345 km」）。未入力なら「ODO 未入力」 */
export function formatOdometer(odometer: number | null | undefined): string {
  return typeof odometer === "number" && Number.isFinite(odometer)
    ? `ODO ${odometer.toLocaleString("ja-JP", { maximumFractionDigits: 1 })} km`
    : "ODO 未入力";
}

/** 距離（km）の表示。桁区切りあり、小数は 2 桁まで（単位は付けない） */
export function formatKm(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

/** "YYYY-MM-DD" → "YYYY/M/D" */
export function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}/${Number(m)}/${Number(d)}`;
}

/** 単価の差（円/L）を符号付きで表示する。0.1 円未満の差は "±0.0" */
export function formatPriceDiff(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded === 0) return "±0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/** 値上がりは赤、値下がりは緑、変わらなければ灰色（Tailwind のクラス名） */
export function priceDiffClass(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded > 0) return "text-red-400";
  if (rounded < 0) return "text-emerald-400";
  return "text-gray-400";
}
