import { SegmentedControl, type SegmentedOption } from "@/components/ui";
import type { Period } from "@/lib/stats";

const PERIOD_OPTIONS: ReadonlyArray<SegmentedOption<Period>> = [
  { value: "3m", label: "3ヶ月" },
  { value: "6m", label: "6ヶ月" },
  { value: "1y", label: "1年" },
  { value: "all", label: "全期間" },
];

interface PeriodFilterProps {
  period: Period;
  onChange: (period: Period) => void;
  unknownDateCount: number;
}

/** 期間フィルタ (3ヶ月 / 6ヶ月 / 1年 / 全期間) と、日付不明の記録の注記 */
export default function PeriodFilter({ period, onChange, unknownDateCount }: PeriodFilterProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SegmentedControl aria-label="期間" options={PERIOD_OPTIONS} value={period} onChange={onChange} className="lg:max-w-md" />
      {unknownDateCount > 0 && (
        <p className="px-1 text-[11px] text-sub">
          日付不明 {unknownDateCount}件（期間フィルタ・グラフには含まれません）
        </p>
      )}
    </div>
  );
}
