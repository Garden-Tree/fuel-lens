/**
 * 選択中の車両の決定と保存先（純粋関数。useVehicles から使う）。
 */

import { LOCAL_DEFAULT_VEHICLE_ID } from "./migrateLocalData";
import type { Vehicle } from "./types";

const SELECTED_VEHICLE_KEY = "fuel_lens_selected_vehicle_id";

/**
 * 選択中の車両 ID を保存する localStorage キー。
 * ログイン中はユーザーごとに分け、別アカウントの車両 ID を読まないようにする。
 * 未ログイン時は従来のキー（互換のため）。
 */
export function selectedVehicleStorageKey(userId: string | null | undefined): string {
  return userId ? `${SELECTED_VEHICLE_KEY}_${userId}` : SELECTED_VEHICLE_KEY;
}

/**
 * 一覧と保存値から選択する車両 ID を決める。保存値が一覧にあればそれ、無ければ先頭の車両、
 * 一覧が空なら fallbackId（省略時は未ログイン時の既定車両の ID）。
 */
export function pickSelected(
  list: readonly Pick<Vehicle, "id">[],
  cachedId: string | null,
  fallbackId: string = LOCAL_DEFAULT_VEHICLE_ID
): string {
  if (cachedId && list.some(v => v.id === cachedId)) return cachedId;
  return list[0]?.id ?? fallbackId;
}

/** フォールバックなどで保存値と実際の選択がずれたときだけ、実際の選択を保存し直すべきか */
export function shouldPersistSelection(effectiveId: string, storedId: string | null): boolean {
  return effectiveId !== storedId;
}
