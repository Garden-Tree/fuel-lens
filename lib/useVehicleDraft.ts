"use client";

import { useCallback, useMemo, useState } from "react";
import { distanceModeOf, isFuelType } from "@/lib/fillChain";
import type { DistanceMode, FuelType, Vehicle, VehicleSettings, VehicleType } from "@/lib/types";

/** 車両の追加フォーム・編集行の入力値 */
export interface VehicleDraftValues {
  name: string;
  type: VehicleType;
  mode: DistanceMode;
  fuelType: FuelType | null;
}

export const EMPTY_VEHICLE_DRAFT: VehicleDraftValues = {
  name: "",
  type: "car",
  mode: "trip",
  fuelType: null,
};

/** 既存の車両から編集の初期値を作る */
export function draftFromVehicle(v: Vehicle): VehicleDraftValues {
  return {
    name: v.name,
    type: v.type,
    mode: distanceModeOf(v),
    fuelType: isFuelType(v.default_fuel_type) ? v.default_fuel_type : null,
  };
}

export interface VehicleDraft extends VehicleDraftValues {
  setName: (name: string) => void;
  setType: (type: VehicleType) => void;
  setMode: (mode: DistanceMode) => void;
  setFuelType: (fuelType: FuelType | null) => void;
  /** 前後の空白を除いた名前 */
  trimmedName: string;
  /** 名前が空でなければ保存・追加できる */
  isValid: boolean;
  /** onAdd / onUpdate に渡す設定（距離の入力方式・既定の燃料種別） */
  settings: VehicleSettings;
  /** 空の初期値（車・トリップメーター・燃料種別なし）へ戻す */
  reset: () => void;
  /** 既存の車両の値を読み込む（編集開始） */
  load: (vehicle: Vehicle) => void;
}

/** 車両の追加フォーム・編集行の下書き状態（名前・タイプ・距離の入力方式・既定の燃料種別）と検証 */
export function useVehicleDraft(initial: VehicleDraftValues = EMPTY_VEHICLE_DRAFT): VehicleDraft {
  const [values, setValues] = useState<VehicleDraftValues>(initial);

  const setName = useCallback((name: string) => setValues((p) => ({ ...p, name })), []);
  const setType = useCallback((type: VehicleType) => setValues((p) => ({ ...p, type })), []);
  const setMode = useCallback((mode: DistanceMode) => setValues((p) => ({ ...p, mode })), []);
  const setFuelType = useCallback((fuelType: FuelType | null) => setValues((p) => ({ ...p, fuelType })), []);
  const reset = useCallback(() => setValues(EMPTY_VEHICLE_DRAFT), []);
  const load = useCallback((vehicle: Vehicle) => setValues(draftFromVehicle(vehicle)), []);

  const trimmedName = values.name.trim();
  const settings = useMemo<VehicleSettings>(
    () => ({ distance_mode: values.mode, default_fuel_type: values.fuelType }),
    [values.mode, values.fuelType],
  );

  return {
    ...values,
    setName,
    setType,
    setMode,
    setFuelType,
    trimmedName,
    isValid: trimmedName.length > 0,
    settings,
    reset,
    load,
  };
}
