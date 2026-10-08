import { MapPin } from "lucide-react";
import RecordBadges from "@/components/RecordBadges";
import { formatOdometer } from "@/lib/format";
import type { DistanceMode, FuelRecord } from "@/lib/types";

type StatsRecord = Pick<
  FuelRecord,
  "fuel_amount" | "total_distance" | "odometer" | "gas_station" | "memo" | "is_full" | "missed_previous" | "fuel_type"
>;

/**
 * 記録カードの明細（給油量・走行距離（オドメーターモードは区間距離）・ODO・スタンド・メモ）。
 * - `variant="card"`: /app の最新記録カード。ラベルが上・値が下の 2 列、スタンドとメモも枠内
 * - `variant="compact"`: /history のカード。部分給油などのバッジ → ラベルと値が横並びの 2 列 → メモ → スタンド
 * 仕様は docs/design-fill-chain.md 4 章「履歴カード」。
 */
export default function RecordStats({
  record,
  distanceMode,
  variant,
}: {
  record: StatsRecord;
  distanceMode: DistanceMode;
  variant: "card" | "compact";
}) {
  const odometerMode = distanceMode === "odometer";
  const odometerLine = odometerMode && (
    <p className="col-span-2 text-xs font-mono text-gray-400">{formatOdometer(record.odometer)}</p>
  );
  const memoLine = (className: string) =>
    record.memo && (
      <p className={className} title={record.memo}>
        <span className="sr-only">メモ: </span>
        {record.memo}
      </p>
    );

  if (variant === "card") {
    return (
      <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-xl p-4 border border-white/5">
        <div>
          <p className="text-[10px] text-gray-400 uppercase">給油量</p>
          <p className="text-lg font-mono font-bold text-blue-200">
            {record.fuel_amount ?? "--"} <span className="text-xs text-gray-500">L</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase">{odometerMode ? "区間距離" : "走行距離"}</p>
          <p className="text-lg font-mono font-bold text-gray-200">
            {record.total_distance ?? "--"} <span className="text-xs text-gray-500">km</span>
          </p>
        </div>
        {odometerLine}
        <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-white/5">
          <MapPin className="w-3 h-3 text-gray-500" />
          <p className="text-xs text-gray-400 truncate">{record.gas_station || "場所不明"}</p>
        </div>
        {memoLine("col-span-2 text-xs text-gray-400 truncate")}
      </div>
    );
  }

  return (
    <>
      <RecordBadges record={record} className="mb-2" />

      <div className="grid grid-cols-2 gap-2 text-sm bg-black/20 p-3 rounded-lg">
        <div className="flex justify-between border-r border-gray-800 pr-2">
          <span className="text-gray-500 text-xs">給油量</span>
          <span className="font-mono text-gray-300">{record.fuel_amount ?? "--"} L</span>
        </div>
        <div className="flex justify-between pl-2">
          <span className="text-gray-500 text-xs">{odometerMode ? "区間" : "走行"}</span>
          <span className="font-mono text-gray-300">{record.total_distance ?? "--"} km</span>
        </div>
        {odometerLine}
      </div>

      {memoLine("mt-2 text-xs text-gray-400 truncate")}

      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 pr-24">
        <MapPin className="w-3 h-3 flex-shrink-0" />
        <span className="truncate" title={record.gas_station || undefined}>
          {record.gas_station || "SS不明"}
        </span>
      </div>
    </>
  );
}
