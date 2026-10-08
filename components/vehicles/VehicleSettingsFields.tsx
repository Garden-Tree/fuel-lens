"use client";

import { Car, Bike } from "lucide-react";
import { isFuelType } from "@/lib/fillChain";
import { FUEL_TYPES, FUEL_TYPE_LABELS, type DistanceMode, type FuelType, type VehicleType } from "@/lib/types";

const DISTANCE_MODE_OPTIONS: readonly { value: DistanceMode; label: string; detail: string }[] = [
  { value: "trip", label: "トリップメーター", detail: "区間距離" },
  { value: "odometer", label: "オドメーター", detail: "積算距離" },
];

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

/** 距離の入力方式・既定の燃料種別の入力欄（編集行と追加フォームで共通） */
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
  const modeLabelId = `${idPrefix}-mode-label`;
  const fuelId = `${idPrefix}-fuel-type`;
  return (
    <div className="space-y-2">
      <div>
        <p id={modeLabelId} className="text-[11px] text-gray-400 mb-1">
          距離の入力方式
        </p>
        <div
          className="grid grid-cols-2 gap-1 bg-gray-900 p-0.5 rounded-xl border border-gray-800"
          role="radiogroup"
          aria-labelledby={modeLabelId}
        >
          {DISTANCE_MODE_OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onModeChange(opt.value)}
                disabled={disabled}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-60 ${
                  selected ? "bg-blue-600 text-white shadow" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {opt.label}
                <span className="block text-[10px] font-normal opacity-80">（{opt.detail}）</span>
              </button>
            );
          })}
        </div>
        {switchNote && (
          <p role="status" className="mt-1 text-[11px] text-amber-400">
            {switchNote}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={fuelId} className="text-[11px] text-gray-400 flex-shrink-0">
          既定の燃料種別
        </label>
        <select
          id={fuelId}
          value={fuelType ?? ""}
          onChange={(e) => onFuelTypeChange(isFuelType(e.target.value) ? e.target.value : null)}
          disabled={disabled}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-lg px-2 py-2 sm:py-1.5 text-base sm:text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition disabled:opacity-60"
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

const TYPE_OPTIONS: readonly { value: VehicleType; label: string; Icon: typeof Car }[] = [
  { value: "car", label: "自動車", Icon: Car },
  { value: "bike", label: "バイク", Icon: Bike },
];

/** 車両タイプ（自動車 / バイク）の切り替え。編集行（edit）と追加フォーム（add）で見た目だけ異なる */
export function VehicleTypeToggle({
  variant,
  value,
  onChange,
  disabled,
}: {
  variant: "edit" | "add";
  value: VehicleType;
  onChange: (type: VehicleType) => void;
  disabled?: boolean;
}) {
  const isAdd = variant === "add";
  return (
    <div
      className={
        isAdd
          ? "flex bg-gray-950 p-0.5 rounded-xl border border-gray-800 flex-shrink-0"
          : "flex bg-gray-900 p-0.5 rounded-xl border border-gray-800"
      }
      role="radiogroup"
      aria-label="車両タイプ"
    >
      {TYPE_OPTIONS.map(({ value: optValue, label, Icon }) => {
        const selected = value === optValue;
        const selectedClass = isAdd
          ? "bg-blue-600/20 border border-blue-500/30 text-blue-400"
          : "bg-blue-600 text-white shadow";
        return (
          <button
            key={optValue}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(optValue)}
            disabled={disabled}
            className={`${
              isAdd ? "px-3 rounded-lg font-semibold text-xs" : "p-3 sm:p-2 rounded-lg"
            } transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              selected ? selectedClass : "text-gray-500 hover:text-gray-300"
            }`}
            title={label}
            aria-label={label}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
