import type { Period } from "@/lib/stats";

const PERIOD_OPTIONS: ReadonlyArray<{ value: Period; label: string }> = [
  { value: "all", label: "全期間" },
  { value: "1y", label: "1年" },
  { value: "6m", label: "6ヶ月" },
  { value: "3m", label: "3ヶ月" },
];

interface PeriodFilterProps {
  period: Period;
  onChange: (period: Period) => void;
  unknownDateCount: number;
}

/** 期間フィルタ (全期間 / 1年 / 6ヶ月 / 3ヶ月) と、日付不明の記録の注記 */
export default function PeriodFilter({ period, onChange, unknownDateCount }: PeriodFilterProps) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 w-full">
      <p className="text-[11px] text-gray-500">
        {unknownDateCount > 0 && `日付不明 ${unknownDateCount}件（期間フィルタ・グラフには含まれません）`}
      </p>
      <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800 shrink-0">
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-3 sm:py-1.5 text-xs font-bold rounded-md transition ${
              period === opt.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
