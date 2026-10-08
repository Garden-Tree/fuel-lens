/**
 * 記録一覧の範囲（RecordScope）の組み立てと判定（純粋関数）。
 * 判定は lib/recordFilters.ts の matchesSelectedVehicle と同じ結果になる（tests/data/localStore.test.ts で確認）。
 */

import { isDefaultVehicleSelected, isUnclassifiedRecord } from "../recordFilters";
import type { RecordScope } from "./types";

/** 選択中の車両と既定車両（vehicles[0]）から一覧の範囲を決める。未分類は既定車両を選択中のときだけ含める */
export function recordScopeOf(
  selectedVehicleId: string | null | undefined,
  defaultVehicleId: string | null | undefined
): RecordScope {
  return {
    vehicleId: selectedVehicleId || null,
    includeUnclassified: isDefaultVehicleSelected(selectedVehicleId, defaultVehicleId),
  };
}

/** 記録が範囲に入るか。ローカル既定車両（default-*）を選択中なら未分類の記録だけ */
export function matchesRecordScope(record: { vehicle_id?: string | null }, scope: RecordScope): boolean {
  const { vehicleId } = scope;
  if (vehicleId && !vehicleId.startsWith("default-") && record.vehicle_id === vehicleId) return true;
  return scope.includeUnclassified && isUnclassifiedRecord(record);
}
