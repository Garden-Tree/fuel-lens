"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown, StickyNote } from "lucide-react";
import RecordBadges from "@/components/RecordBadges";
import { efficiencyNullReason } from "@/lib/format";
import { formatPricePerUnit } from "@/lib/calculations";
import { isFuelType } from "@/lib/fillChain";
import {
  dayParts,
  formatDistance,
  formatEfficiency,
  formatLiters,
  formatYen,
  recordElementId,
} from "@/lib/history/recordList";
import { FUEL_TYPE_LABELS, type DistanceMode, type FuelRecord } from "@/lib/types";

/** 店舗名が無いときの表示 */
export const NO_STATION_LABEL = "店舗名なし";

/** PC の列の幅（見出し行 RecordColumnsHeader と揃える） */
const COL = "hidden w-24 shrink-0 text-right lg:block";
const TRAILING = "flex shrink-0 flex-col items-end gap-0.5 text-right lg:w-28";

export type RecordRowProps = {
  record: FuelRecord;
  distanceMode: DistanceMode;
  /** 日付の欄に月も出す（月ごとにまとめない「登録の新しい順」） */
  showMonth: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** 開いたときの中身（明細と操作、または編集フォーム） */
  children: ReactNode;
};

/** 燃費が出ないときの右側の文言。部分給油は「次の満タンで計算」 */
function nullEfficiencyText(record: FuelRecord): string {
  if (record.is_full === false) return "次の満タンで計算";
  return efficiencyNullReason(record) ?? "";
}

/**
 * 履歴の 1 行（押すとその場で開き、明細と操作を出す）。
 * - 左: 日（等幅 18px）と曜日。中: 店舗名と「燃料種別・給油量・区間」。右: 燃費と支払総額
 * - PC（≥ lg）は給油量・区間・単価を右側の列に並べる（補足からは外す）
 * - `id="record-<id>"`（ホームから `/history#record-<id>` で開ける）
 */
export default function RecordRow({ record, distanceMode, showMonth, expanded, onToggle, children }: RecordRowProps) {
  const detailId = useId();
  const day = dayParts(record.date);
  const station = record.gas_station?.trim() || NO_STATION_LABEL;
  const fuelType = isFuelType(record.fuel_type) ? FUEL_TYPE_LABELS[record.fuel_type] : null;
  const liters = formatLiters(record.fuel_amount);
  const distance = formatDistance(record.total_distance);
  const efficiency = formatEfficiency(record.fuel_efficiency);
  const cost = formatYen(record.total_cost);
  const price = formatPricePerUnit(record.price_per_unit);
  const distanceLabel = distanceMode === "odometer" ? "区間" : "走行距離";

  // スマホの補足: 燃料種別・給油量・区間（給油量と区間は PC では列に出すので隠す）
  const mobileParts: { key: string; node: ReactNode }[] = [];
  if (liters) mobileParts.push({ key: "l", node: <><span className="num">{liters}</span> L</> });
  if (distance) mobileParts.push({ key: "km", node: <><span className="num">{distance}</span> km</> });

  return (
    <li
      id={recordElementId(record.id)}
      className={`scroll-mt-4 first:rounded-t-2xl last:rounded-b-2xl ${expanded ? "bg-surface-2/40" : ""}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        onClick={onToggle}
        className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left text-ink transition-colors hover:bg-surface-2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [li:first-child>&]:rounded-t-2xl ${
          expanded ? "" : "[li:last-child>&]:rounded-b-2xl"
        }`}
      >
        {/* 日付 */}
        <span className="flex w-8 shrink-0 flex-col items-center leading-tight" aria-hidden="true">
          {day ? (
            <>
              {showMonth && <span className="text-[11px] text-sub">{day.month}月</span>}
              <span className="num text-lg font-bold">{day.day}</span>
              <span className="text-[11px] text-sub">{day.weekday}</span>
            </>
          ) : (
            <span className="text-lg font-bold text-faint">--</span>
          )}
        </span>
        <span className="sr-only">{day ? `${day.year}年${day.month}月${Number(day.day)}日（${day.weekday}）` : "日付なし"}</span>

        {/* 店舗名と補足 */}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={`truncate text-[15px] ${record.gas_station?.trim() ? "" : "text-sub"}`}>{station}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-sub">
            <RecordBadges record={record} inline showFuelType={false} />
            <span className="min-w-0 truncate">
              {fuelType}
              {mobileParts.map((part, i) => (
                <span key={part.key} className="lg:hidden">
                  {(fuelType || i > 0) && "・"}
                  {part.node}
                </span>
              ))}
            </span>
            {record.memo && (
              <span className="flex shrink-0 items-center" title="メモあり">
                <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">メモあり</span>
              </span>
            )}
          </span>
        </span>

        {/* PC の列: 給油量・区間・単価 */}
        <span className={`${COL} num text-sm`}>
          <span className="sr-only">給油量 </span>
          {liters ?? <span className="text-faint">--</span>}
          <span className="text-xs text-sub"> L</span>
        </span>
        <span className={`${COL} num text-sm`}>
          <span className="sr-only">{distanceLabel} </span>
          {distance ?? <span className="text-faint">--</span>}
          <span className="text-xs text-sub"> km</span>
        </span>
        <span className={`${COL} num text-sm`}>
          <span className="sr-only">単価 </span>
          {price === "--" ? <span className="text-faint">--</span> : <>¥{price}</>}
          <span className="text-xs text-sub">/L</span>
        </span>

        {/* 燃費と支払総額 */}
        <span className={TRAILING}>
          {efficiency ? (
            <span className="num text-lg font-bold leading-tight">
              {efficiency}
              <span className="sr-only"> km/L</span>
            </span>
          ) : (
            <span className="text-xs leading-5 text-sub">{nullEfficiencyText(record)}</span>
          )}
          {cost ? (
            <span className="num text-xs text-money">{cost}</span>
          ) : (
            <span className="text-xs text-faint">金額なし</span>
          )}
        </span>

        {/* 開閉の目印（スマホはモックどおり出さず、補足の「給油量・区間」に幅を回す） */}
        <ChevronDown
          className={`hidden h-4 w-4 shrink-0 text-faint transition-transform sm:block ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div id={detailId} role="region" aria-label={`${station}の記録の詳細`}>
          {children}
        </div>
      )}
    </li>
  );
}

/** PC の列見出し（行の列と同じ幅で並べる。読み上げは各セルの sr-only で行う） */
export function RecordColumnsHeader({ distanceMode }: { distanceMode: DistanceMode }) {
  return (
    <div className="hidden items-center gap-3 px-4 text-xs text-sub lg:flex" aria-hidden="true">
      <span className="w-8 shrink-0" />
      <span className="flex-1" />
      <span className="w-24 shrink-0 text-right">給油量</span>
      <span className="w-24 shrink-0 text-right">{distanceMode === "odometer" ? "区間" : "走行距離"}</span>
      <span className="w-24 shrink-0 text-right">単価</span>
      <span className="w-28 shrink-0 text-right">燃費 km/L</span>
      <span className="w-4 shrink-0" />
    </div>
  );
}
