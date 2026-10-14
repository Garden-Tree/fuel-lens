"use client";

import { useMemo } from "react";
import { GroupedList, Section, ValueRow } from "@/components/ui";
import { formatPricePerUnit } from "@/lib/calculations";
import { formatPriceDiff } from "@/lib/format";
import { monthStartOf, monthSummaryOf } from "@/lib/home/month";
import { useCurrentMonthKey } from "@/lib/home/useCurrentMonthKey";
import { formatYen } from "@/lib/home/recent";
import type { FuelRecord } from "@/lib/types";

/** 単価の前回比の色（値上がりは cost-up、値下がりは up、変わらなければ sub） */
function priceDiffTone(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded > 0) return "text-cost-up";
  if (rounded < 0) return "text-up";
  return "text-sub";
}

/** ホームの「今月」（見出しは「10月」など）: 給油代・給油量（回数）・単価（前回比）。集計は lib/home/month.ts */
export default function MonthSummarySection({ records }: { records: ReadonlyArray<FuelRecord> }) {
  // いまの月（描画時の日付から求め、画面に戻ってきたときにも読み直す。開いたまま月をまたいでも切り替わる）
  const monthKey = useCurrentMonthKey();
  const s = useMemo(() => monthSummaryOf(records, monthStartOf(monthKey)), [records, monthKey]);

  return (
    <Section title={s.label}>
      <GroupedList>
        {s.count === 0 ? (
          <p className="flex min-h-[46px] items-center px-4 text-sm text-sub">この月の給油記録はまだありません</p>
        ) : (
          <>
            <ValueRow label="給油代" value={formatYen(s.totalCost) ?? "--"} tone={s.totalCost !== null ? "money" : "sub"} />
            <ValueRow label="給油量" value={s.totalFuel.toFixed(2)} unit={` L・${s.count}回`} />
            <ValueRow
              label="単価"
              value={s.latestPrice !== null ? `¥${formatPricePerUnit(s.latestPrice)}` : "--"}
              tone={s.latestPrice !== null ? "default" : "sub"}
              unit={
                s.priceDiff !== null ? (
                  <span className={priceDiffTone(s.priceDiff)}>
                    {" "}
                    前回比 <span className="num">{formatPriceDiff(s.priceDiff)}</span>
                  </span>
                ) : undefined
              }
            />
          </>
        )}
      </GroupedList>
    </Section>
  );
}
