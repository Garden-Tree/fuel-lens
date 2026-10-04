/**
 * 車両と給油記録の対応判定（純粋関数）。
 *
 * useFuelRecords の読み込み・追加・更新・削除、および useVehicles で共有し、
 * 「どの記録がどの車両に属するか」の判定を 1 箇所に集約する。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 文字列が UUID 形式かどうか（Supabase の主キー判定・クエリ値の検証に使用） */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** ログアウト時にローカルで採番される車両ID（default-car / local-vehicle-*）か */
export function isLocalVehicleId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id.startsWith("default-") || id.startsWith("local-vehicle-");
}

/**
 * 記録が「未分類」か。
 * vehicle_id が null / 空、またはローカル既定車両 (default-*) を指す記録は、
 * 既定（先頭）車両を選択しているときにだけ表示する。
 */
export function isUnclassifiedRecord(record: { vehicle_id?: string | null }): boolean {
  const vid = record.vehicle_id;
  return vid == null || vid === "" || vid.startsWith("default-");
}

/**
 * 現在選択中の車両が「既定（先頭）車両」か。
 * 未選択、ローカル既定車両、または defaultVehicleId と一致する場合に真。
 */
export function isDefaultVehicleSelected(
  selectedVehicleId: string | null | undefined,
  defaultVehicleId: string | null | undefined
): boolean {
  if (!selectedVehicleId) return true;
  if (selectedVehicleId.startsWith("default-")) return true;
  return defaultVehicleId != null && selectedVehicleId === defaultVehicleId;
}

/**
 * 記録が選択中の車両に属するかを判定する。
 *
 * - 選択中の車両IDと一致する記録は常に含める
 * - 未分類の記録（vehicle_id null / default-*）は、既定（先頭）車両を選択中のときのみ含める。
 *   常に含めると、車両が複数あるとき全車両に同じ記録が重複表示・重複集計されるため。
 */
export function matchesSelectedVehicle(
  record: { vehicle_id?: string | null },
  selectedVehicleId: string | null | undefined,
  defaultVehicleId: string | null | undefined
): boolean {
  const unclassified = isUnclassifiedRecord(record);
  if (!selectedVehicleId || selectedVehicleId.startsWith("default-")) {
    return unclassified;
  }
  if (record.vehicle_id === selectedVehicleId) return true;
  return unclassified && isDefaultVehicleSelected(selectedVehicleId, defaultVehicleId);
}
