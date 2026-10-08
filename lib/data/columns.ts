/**
 * 保存する列の検証とパッチの適用（純粋関数）。ローカル・クラウドのストア、キャッシュ、フックの楽観更新で共有する。
 */

import { isDistanceMode, isFuelType, normalizeRecord, normalizeVehicle, sanitizeMemo, sanitizeOdometer } from "../fillChain";
import type { FuelRecord, Vehicle, VehicleSettings } from "../types";
import type { RecordPatch, VehiclePatch } from "./types";

/**
 * add / update / addMany で保存する列（id・user_id 以外の FuelRecord の列）。
 * 導出値の run_distance / run_fuel / run_cost は DB の列ではないので含めない（連鎖計算済みの記録を渡しても保存されない）
 */
const RECORD_COLUMNS = [
  "date",
  "total_distance",
  "fuel_amount",
  "gas_station",
  "price_per_unit",
  "total_cost",
  "fuel_efficiency",
  "vehicle_id",
  "created_at",
  "odometer",
  "is_full",
  "missed_previous",
  "fuel_type",
  "memo",
] as const satisfies readonly (keyof FuelRecord)[];

type RecordColumn = (typeof RECORD_COLUMNS)[number];

/**
 * 保存する値を既知の列だけに絞り、0004 で追加した列の値を検証する（純粋関数）。
 * - 渡されたキー（値が undefined でないもの）だけを返す。Supabase へ送らなかった列には DB の既定値が入る
 *   （0004 適用前の DB でも、新しい列を指定しない保存は従来どおり成功する）
 * - is_full / missed_previous は真偽値以外なら捨てる（DB の既定値 true / false）
 * - odometer は 0 以上の有限数、fuel_type は 4 値、memo は 200 文字まで（空は null）に正規化する
 */
export function pickRecordColumns(input: Partial<FuelRecord>): Partial<Pick<FuelRecord, RecordColumn>> {
  const out: Partial<Record<RecordColumn, unknown>> = {};
  for (const key of RECORD_COLUMNS) {
    const value = input[key];
    if (value === undefined) continue;
    switch (key) {
      case "odometer":
        out.odometer = sanitizeOdometer(value);
        break;
      case "is_full":
      case "missed_previous":
        if (typeof value === "boolean") out[key] = value;
        break;
      case "fuel_type":
        out.fuel_type = isFuelType(value) ? value : null;
        break;
      case "memo":
        out.memo = sanitizeMemo(value);
        break;
      default:
        out[key] = value;
    }
  }
  return out as Partial<Pick<FuelRecord, RecordColumn>>;
}

/** 記録に変更を適用した新しい記録（既知の列だけ。新しい列は既定値で補完） */
export function applyRecordPatch<T extends FuelRecord>(record: T, patch: RecordPatch): T {
  return normalizeRecord({ ...record, ...pickRecordColumns(patch) });
}

/**
 * 呼び出し側から受け取った設定を検証し、既知の値だけを残す（不明な値のキーは捨てる）。
 * Supabase へは定義済みのキーだけを送る（未指定なら DB の既定値 / 変更なし）。
 */
export function sanitizeVehicleSettings(settings: VehicleSettings | null | undefined): VehicleSettings {
  const out: VehicleSettings = {};
  if (!settings) return out;
  if (isDistanceMode(settings.distance_mode)) out.distance_mode = settings.distance_mode;
  if (settings.default_fuel_type === null || isFuelType(settings.default_fuel_type)) {
    out.default_fuel_type = settings.default_fuel_type;
  }
  return out;
}

/** 車両の更新で保存する値（名前・種別は渡されたものだけ、設定は sanitizeVehicleSettings） */
export function vehiclePatchColumns(patch: VehiclePatch): VehiclePatch {
  const out: VehiclePatch = {};
  if (patch.name !== undefined) out.name = patch.name;
  if (patch.type !== undefined) out.type = patch.type;
  return { ...out, ...sanitizeVehicleSettings(patch) };
}

/** 車両に変更を適用した新しい車両（新しい列は既定値で補完） */
export function applyVehiclePatch<T extends Vehicle>(vehicle: T, patch: VehiclePatch): T {
  return normalizeVehicle({ ...vehicle, ...vehiclePatchColumns(patch) });
}
