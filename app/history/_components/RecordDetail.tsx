"use client";

import type { ReactNode } from "react";
import { Car, Pencil, Trash2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui";
import { efficiencyNullReason, formatKm, formatOdometer } from "@/lib/format";
import { formatPricePerUnit } from "@/lib/calculations";
import { isFuelType } from "@/lib/fillChain";
import { dayParts, formatEfficiency, formatLiters, formatYen } from "@/lib/history/recordList";
import { FUEL_TYPE_LABELS, type DistanceMode, type FuelRecord, type Vehicle } from "@/lib/types";

export type RecordDetailProps = {
  record: FuelRecord;
  distanceMode: DistanceMode;
  /** 移動先の候補（選択中の車両を除く） */
  moveTargets: readonly Pick<Vehicle, "id" | "name">[];
  readOnly: boolean;
  /** この記録の削除・移動の処理中（確認ダイアログの表示中を含む） */
  busy: boolean;
  onEdit: () => void;
  onMove: (vehicleId: string) => void;
  onDelete: () => void;
};

const ACTION =
  "inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 text-sm font-medium transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

function Item({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-h-10 items-baseline justify-between gap-4 border-b border-line py-2 ${wide ? "lg:col-span-2" : ""}`}>
      <dt className="shrink-0 text-[13px] text-sub">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-faint">未入力</span>;
}

/** 行を開いたときの明細（日付・スタンド・数値・メモ）と操作（編集・別の車両へ移動・削除） */
export default function RecordDetail({
  record,
  distanceMode,
  moveTargets,
  readOnly,
  busy,
  onEdit,
  onMove,
  onDelete,
}: RecordDetailProps) {
  const day = dayParts(record.date);
  const liters = formatLiters(record.fuel_amount);
  const efficiency = formatEfficiency(record.fuel_efficiency);
  const cost = formatYen(record.total_cost);
  const price = formatPricePerUnit(record.price_per_unit);
  const hasDistance = typeof record.total_distance === "number" && Number.isFinite(record.total_distance);
  const showOdometer = distanceMode === "odometer" || typeof record.odometer === "number";
  const disabled = readOnly || busy;

  return (
    <div className="px-4 pb-4 lg:pl-[60px]">
      <dl className="grid lg:grid-cols-2 lg:gap-x-8">
        <Item label="給油日">
          {day ? (
            <span className="num">
              {day.year}/{day.month}/{Number(day.day)}
              <span className="font-sans">（{day.weekday}）</span>
            </span>
          ) : (
            <span className="text-faint">日付なし</span>
          )}
        </Item>
        <Item label="スタンド">
          {record.gas_station?.trim() ? <span className="break-words">{record.gas_station}</span> : <Missing />}
        </Item>
        <Item label="給油量">
          {liters ? <><span className="num">{liters}</span><span className="text-xs text-sub"> L</span></> : <Missing />}
        </Item>
        <Item label={distanceMode === "odometer" ? "区間距離" : "走行距離"}>
          {hasDistance ? (
            <><span className="num">{formatKm(record.total_distance as number)}</span><span className="text-xs text-sub"> km</span></>
          ) : (
            <Missing />
          )}
        </Item>
        {showOdometer && (
          <Item label="オドメーター">
            <span className="num">{formatOdometer(record.odometer).replace(/^ODO /, "")}</span>
          </Item>
        )}
        <Item label="単価">
          {price === "--" ? <Missing /> : <><span className="num">¥{price}</span><span className="text-xs text-sub">/L</span></>}
        </Item>
        <Item label="支払総額">{cost ? <span className="num font-bold text-money">{cost}</span> : <Missing />}</Item>
        <Item label="燃費">
          {efficiency ? (
            <><span className="num font-bold">{efficiency}</span><span className="text-xs text-sub"> km/L</span></>
          ) : (
            <span className="text-sub">{efficiencyNullReason(record)}</span>
          )}
        </Item>
        <Item label="燃料種別">{isFuelType(record.fuel_type) ? FUEL_TYPE_LABELS[record.fuel_type] : <Missing />}</Item>
        <Item label="給油の種類">
          {record.is_full === false ? <span className="text-warn">部分給油</span> : "満タン"}
          {record.missed_previous === true && <span className="text-red-400">・前回の記録漏れあり</span>}
        </Item>
        {record.memo && (
          <div className="flex flex-col gap-1 border-b border-line py-2 lg:col-span-2">
            <dt className="text-[13px] text-sub">メモ</dt>
            <dd className="whitespace-pre-wrap break-words text-sm text-ink">{record.memo}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onEdit} disabled={disabled} className={`${ACTION} text-ink`}>
          <Pencil className="h-4 w-4 text-sub" aria-hidden="true" />
          編集
        </button>
        {moveTargets.length > 0 && (
          <Menu
            label="移動先の車両"
            trigger="別の車両へ移動"
            triggerIcon={<Car className="h-4 w-4" />}
            triggerClassName="rounded-xl"
            disabled={disabled}
          >
            {moveTargets.map(v => (
              <MenuItem key={v.id} onSelect={() => onMove(v.id)}>
                {v.name}
              </MenuItem>
            ))}
          </Menu>
        )}
        <button type="button" onClick={onDelete} disabled={disabled} className={`${ACTION} ml-auto text-red-400`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          削除
        </button>
      </div>
      {readOnly && <p className="mt-2 text-xs text-warn">閲覧専用のため、編集・移動・削除はできません</p>}
    </div>
  );
}
