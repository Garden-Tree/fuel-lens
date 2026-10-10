"use client";

import Link from "next/link";
import { GroupedList, ListRow, Num, Section } from "@/components/ui";
import { RECENT_RECORD_COUNT, recentRowOf } from "@/lib/home/recent";
import { recordElementId } from "@/lib/history/recordList";
import type { FuelRecord } from "@/lib/types";

/** 部分給油のバッジ（燃費は次の満タンで計算） */
function PartialBadge() {
  return <span className="rounded-md bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn">部分給油</span>;
}

/**
 * ホームの「最近の記録」: 新しい順に 3 件（店舗名・日付・燃料種別・支払総額、右に燃費）。行は履歴画面でその記録を開き（`/history#record-<id>`）、「すべて見る」は履歴画面へ。
 * records は連鎖計算済み・日付の降順（useVehicleScope の records）。
 */
export default function RecentRecordsSection({ records }: { records: ReadonlyArray<FuelRecord> }) {
  const rows = records.slice(0, RECENT_RECORD_COUNT).map(recentRowOf);
  return (
    <Section
      title="最近の記録"
      action={
        <Link
          href="/history"
          className="-my-2 inline-flex min-h-10 items-center rounded-lg px-1 text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          すべて見る
        </Link>
      }
    >
      <GroupedList>
        {rows.map(row => (
          <ListRow
            key={row.id}
            href={`/history#${recordElementId(row.id)}`}
            title={row.title}
            subtitle={
              <>
                {row.dateLabel}
                {row.fuelLabel && `・${row.fuelLabel}`}
                {row.costLabel && (
                  <>
                    ・<span className="num">{row.costLabel}</span>
                  </>
                )}
              </>
            }
            trailing={
              row.efficiency !== null ? (
                <Num className="text-lg font-bold text-ink">{row.efficiency.toFixed(2)}</Num>
              ) : row.partial ? (
                <PartialBadge />
              ) : (
                <span className="num text-lg font-bold text-faint">
                  --.--
                </span>
              )
            }
            showChevron
          />
        ))}
      </GroupedList>
    </Section>
  );
}
