import { isFuelType } from "@/lib/fillChain";
import { efficiencyNullReason, formatOdometer } from "@/lib/format";
import { FUEL_TYPE_LABELS, type FuelRecord } from "@/lib/types";

// 互換: 実体は lib/format.ts（既存の import を壊さないため再エクスポートする）
export { efficiencyNullReason, formatOdometer };

/**
 * 記録カード（/app の最新記録・/history の行）の表示用ヘルパー。
 * 仕様は docs/design-fill-chain.md 4 章「履歴カード」。
 */

const BADGE = "inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11px] font-bold leading-4";

/**
 * 部分給油・記録漏れ・燃料種別のバッジ。どれも無ければ何も描画しない。
 * - `inline`: 行の補足（ボタンの中）に置くため span で描画する（既定は div）
 * - `showFuelType={false}`: 燃料種別は文字で別に出すとき
 */
export default function RecordBadges({
  record,
  className = "",
  inline = false,
  showFuelType = true,
}: {
  record: Pick<FuelRecord, "is_full" | "missed_previous" | "fuel_type">;
  className?: string;
  inline?: boolean;
  showFuelType?: boolean;
}) {
  const fuelType = showFuelType && isFuelType(record.fuel_type) ? record.fuel_type : null;
  const partial = record.is_full === false;
  const missed = record.missed_previous === true;
  if (!partial && !missed && !fuelType) return null;
  const Tag = inline ? "span" : "div";
  return (
    <Tag className={`${inline ? "inline-flex" : "flex flex-wrap"} items-center gap-1 ${className}`}>
      {partial && <span className={`${BADGE} bg-warn-bg text-warn`}>部分給油</span>}
      {missed && <span className={`${BADGE} bg-red-500/15 text-red-400`}>記録漏れ</span>}
      {fuelType && <span className={`${BADGE} bg-surface-2 text-sub`}>{FUEL_TYPE_LABELS[fuelType]}</span>}
    </Tag>
  );
}
