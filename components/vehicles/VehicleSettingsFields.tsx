"use client";

import { Car, Bike } from "lucide-react";
import { isFuelType } from "@/lib/fillChain";
import { FUEL_TYPES, FUEL_TYPE_LABELS, type DistanceMode, type FuelType, type VehicleType } from "@/lib/types";
import { SegmentedControl, type SegmentedOption } from "@/components/ui";

const DISTANCE_MODE_OPTIONS: readonly SegmentedOption<DistanceMode>[] = [
  { value: "trip", label: "トリップメーター" },
  { value: "odometer", label: "オドメーター" },
];

/** 方式ごとの入力の説明（選択中のものを表示する） */
const DISTANCE_MODE_DETAILS: Readonly<Record<DistanceMode, string>> = {
  trip: "前回給油からの区間距離（トリップメーター）を入力します",
  odometer: "積算距離（オドメーター）を入力し、区間距離は自動で計算します",
};

/** 一覧の行に出す距離の入力方式の短い名前 */
export const DISTANCE_MODE_SHORT_LABELS: Readonly<Record<DistanceMode, string>> = {
  trip: "トリップメーター",
  odometer: "オドメーター",
};

/** オドメーターへ切り替えるときの注意（docs/design-fill-chain.md 4 章） */
const ODOMETER_SWITCH_NOTE =
  "オドメーターが入っていない既存の記録は、区間距離と燃費が「不明」になります（記録は消えません）。";

/**
 * オドメーターからトリップメーターへ戻すときの注意。切り替え時に、オドメーター差分の区間距離を走行距離として保存し直す
 * （lib/useVehicles.ts の updateVehicle と planDistanceWriteBack）
 */
const TRIP_SWITCH_NOTE =
  "トリップメーター方式に切り替えると、オドメーターから自動計算していた区間距離を切り替え時点の値で走行距離として保存し、以後はその値を表示します（記録は消えません）";

/** 既存の車両の方式を from → to に切り替えるときの注意。切り替えないなら null */
export function modeSwitchNote(from: DistanceMode, to: DistanceMode): string | null {
  if (from === to) return null;
  return to === "odometer" ? ODOMETER_SWITCH_NOTE : TRIP_SWITCH_NOTE;
}

/** 設定行の入力欄（右寄せ・透明背景・16px 以上・高さ 40px） */
export const VEHICLE_ROW_INPUT =
  "h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-right text-base text-ink placeholder:text-faint transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60";

/** 距離の入力方式・既定の燃料種別の入力行（編集行と追加フォームで共通。GroupedList の中に置く） */
export default function VehicleSettingsFields({
  idPrefix,
  mode,
  fuelType,
  onModeChange,
  onFuelTypeChange,
  disabled,
  switchNote,
}: {
  idPrefix: string;
  mode: DistanceMode;
  fuelType: FuelType | null;
  onModeChange: (mode: DistanceMode) => void;
  onFuelTypeChange: (fuelType: FuelType | null) => void;
  disabled?: boolean;
  /** 方式を切り替えるときの注意（modeSwitchNote）。null・省略なら出さない */
  switchNote?: string | null;
}) {
  const fuelId = `${idPrefix}-fuel-type`;
  return (
    <div className="divide-y divide-line">
      <div className="space-y-2 px-4 py-3">
        <p className="text-[15px] text-ink">距離の入力方式</p>
        <SegmentedControl
          aria-label="距離の入力方式"
          options={DISTANCE_MODE_OPTIONS}
          value={mode}
          onChange={onModeChange}
          disabled={disabled}
          className="bg-ground!"
        />
        <p className="text-xs text-sub">{DISTANCE_MODE_DETAILS[mode]}</p>
        {switchNote && (
          <p role="status" className="text-xs text-warn">
            {switchNote}
          </p>
        )}
      </div>
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-1.5">
        <label htmlFor={fuelId} className="shrink-0 text-[15px] text-ink">
          既定の燃料種別
        </label>
        <select
          id={fuelId}
          value={fuelType ?? ""}
          onChange={(e) => onFuelTypeChange(isFuelType(e.target.value) ? e.target.value : null)}
          disabled={disabled}
          className={`${VEHICLE_ROW_INPUT} cursor-pointer [color-scheme:dark]`}
        >
          <option value="">未指定</option>
          {FUEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {FUEL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const TYPE_OPTIONS: readonly SegmentedOption<VehicleType>[] = [
  {
    value: "car",
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Car className="h-4 w-4" aria-hidden="true" />
        自動車
      </span>
    ),
    ariaLabel: "自動車",
  },
  {
    value: "bike",
    label: (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Bike className="h-4 w-4" aria-hidden="true" />
        バイク
      </span>
    ),
    ariaLabel: "バイク",
  },
];

/** 車両タイプ（自動車 / バイク）の切り替え */
export function VehicleTypeToggle({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: VehicleType;
  onChange: (type: VehicleType) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SegmentedControl
      aria-label="車両タイプ"
      options={TYPE_OPTIONS}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`bg-ground! ${className}`}
    />
  );
}
