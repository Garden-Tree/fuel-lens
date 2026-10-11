import type { ReactNode } from "react";

import { formatPricePerUnit } from "@/lib/calculations";
import type { FuelRecord } from "@/lib/types";
import { hasPositiveNumber, type StatsSummary } from "@/lib/stats";
import { GroupedList, Num, Section, ValueRow } from "@/components/ui";

/**
 * 期間内の燃費（正の値）の最高・最低。燃費の記録が無ければ null。
 * 単純平均（summary.meanEfficiency）と同じ母集団（期間内の記録のうち fuel_efficiency が正のもの）から求める。
 * グラフの系列は日付が不正な記録を落とすので使わない
 */
export function efficiencyRange(records: ReadonlyArray<Pick<FuelRecord, "fuel_efficiency">>): { max: number; min: number } | null {
  let max = -Infinity;
  let min = Infinity;
  for (const r of records) {
    const e = r.fuel_efficiency;
    if (!hasPositiveNumber(e)) continue;
    if (e > max) max = e;
    if (e < min) min = e;
  }
  return max === -Infinity ? null : { max, min };
}

interface EfficiencyHeroProps {
  summary: StatsSummary;
  /** 期間内の記録（最高・最低の算出に使う。平均と同じ母集団） */
  records: ReadonlyArray<Pick<FuelRecord, "fuel_efficiency">>;
  /** カードの下半分に置くもの（燃費の推移グラフ） */
  children?: ReactNode;
  className?: string;
}

/**
 * ヒーローカード: 平均燃費（大きな数値）と最高・最低、その下に燃費の推移グラフ（children）。
 * 平均燃費は満タン法の Σkm/ΣL（summary.avgEfficiency）。各給油の単純平均は小さな補足として添える。
 */
export function EfficiencyHero({ summary, records, children, className = "" }: EfficiencyHeroProps) {
  const range = efficiencyRange(records);
  return (
    <section
      aria-labelledby="stats-hero-title"
      className={`rounded-hero bg-surface px-4 pb-3 pt-3.5 lg:px-6 lg:pb-4 lg:pt-5 ${className}`}
      title={
        summary.meanEfficiency != null
          ? `総走行距離 ÷ 総給油量（満タン法）。各給油の単純平均: ${summary.meanEfficiency.toFixed(2)} km/L`
          : "総走行距離 ÷ 総給油量（満タン法）"
      }
    >
      <h2 id="stats-hero-title" className="text-[13px] text-sub">
        平均燃費
      </h2>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <Num className="text-[34px] font-bold leading-tight">
            {summary.avgEfficiency != null ? summary.avgEfficiency.toFixed(2) : "--"}
          </Num>
          <span className="text-[13px] text-sub"> km/L</span>
        </div>
        {range && (
          <p className="text-xs text-sub">
            最高 <Num className="text-ink">{range.max.toFixed(2)}</Num>・最低 <Num className="text-ink">{range.min.toFixed(2)}</Num>
          </p>
        )}
      </div>
      {summary.meanEfficiency != null && summary.avgEfficiency != null && (
        <p className="text-[11px] text-sub">
          単純平均 <Num>{summary.meanEfficiency.toFixed(2)}</Num>
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

/** 「費用」グループリスト（給油代の合計・1kmあたり・平均単価・給油回数）。記録が1件以上あるときだけ表示する */
export function CostSummary({ summary, className = "" }: { summary: StatsSummary; className?: string }) {
  if (summary.count === 0) return null;
  return (
    <Section title="費用" className={className}>
      <GroupedList>
        <ValueRow label="給油代の合計" value={`¥${summary.totalCost.toLocaleString()}`} tone="money" />
        <ValueRow label="1kmあたり" value={summary.costPerKm != null ? `¥${summary.costPerKm.toFixed(1)}` : "--"} />
        <ValueRow
          label="平均単価"
          value={summary.avgPricePerUnit != null ? `¥${formatPricePerUnit(summary.avgPricePerUnit)}` : "--"}
          unit={summary.avgPricePerUnit != null ? " /L" : undefined}
        />
        <ValueRow label="給油回数" value={summary.count} unit=" 回" />
      </GroupedList>
    </Section>
  );
}
