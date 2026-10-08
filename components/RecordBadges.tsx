import { isFuelType } from "@/lib/fillChain";
import { efficiencyNullReason, formatOdometer } from "@/lib/format";
import { FUEL_TYPE_LABELS, type FuelRecord } from "@/lib/types";

// 互換: 実体は lib/format.ts（既存の import を壊さないため再エクスポートする）
export { efficiencyNullReason, formatOdometer };

/**
 * 記録カード（/app の最新記録・/history）の表示用ヘルパー。
 * 仕様は docs/design-fill-chain.md 4 章「履歴カード」。
 */

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
