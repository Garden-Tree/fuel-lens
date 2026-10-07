import type { FuelRecord } from "@/lib/useFuelRecords";
import { FUEL_TYPE_LABELS, isFuelType } from "@/lib/fillChain";

/**
 * 記録カード（/app の最新記録・/history）の表示用ヘルパー。
 * 仕様は docs/design-fill-chain.md 4 章「履歴カード」。
 */

/** 燃費が null の理由（短い文言）。燃費があれば null */
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

/** 部分給油・記録漏れ・燃料種別のバッジ。どれも無ければ何も描画しない */
export default function RecordBadges({
  record,
  className = "",
}: {
  record: Pick<FuelRecord, "is_full" | "missed_previous" | "fuel_type">;
  className?: string;
}) {
  const fuelType = isFuelType(record.fuel_type) ? record.fuel_type : null;
  const partial = record.is_full === false;
  const missed = record.missed_previous === true;
  if (!partial && !missed && !fuelType) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {partial && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          部分給油
        </span>
      )}
      {missed && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30">
          記録漏れ
        </span>
      )}
      {fuelType && (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-gray-700/50 text-gray-300 border border-gray-600/60">
          {FUEL_TYPE_LABELS[fuelType]}
        </span>
      )}
    </div>
  );
}
