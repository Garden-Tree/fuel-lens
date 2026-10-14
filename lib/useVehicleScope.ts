import { useVehicles } from "./useVehicles";
import { useFuelRecords } from "./useFuelRecords";
import { distanceModeOf } from "./fillChain";
import type { DistanceMode, Vehicle } from "./types";

type VehiclesHook = ReturnType<typeof useVehicles>;
type RecordsHook = ReturnType<typeof useFuelRecords>;

export type UseVehicleScopeOptions = {
  /**
   * 選択中の車両の記録一覧を読み込むか（既定 true）。
   * false なら useFuelRecords に `enabled: false` を渡し、一覧の読み込みを保留する（全件取得・一括追加などの操作だけ使う画面用）。
   * このとき `recordsLoading` は false、`loading` は車両の読み込みだけを表す。
   * 未ログイン時は useFuelRecords が enabled に関係なくローカルの記録を読むため、`records` が空とは限らない。
   */
  list?: boolean;
};

export type VehicleScope = {
  vehicles: VehiclesHook["vehicles"];
  selectedVehicleId: string;
  setSelectedVehicleId: VehiclesHook["setSelectedVehicleId"];
  /** 選択中の車両。一覧に無ければ null */
  selectedVehicle: Vehicle | null;
  /** 選択中の車両の距離の入力方式 */
  distanceMode: DistanceMode;
  /** 既定車両（vehicles[0] = 最も古い車両）の ID。未分類の記録はこの車両に表示する */
  defaultVehicleId: string | undefined;
  /**
   * 選択中の車両（と、既定車両なら未分類）の記録。連鎖計算済み・日付の降順。
   * フォーム（useRecordForm の reset・ScanReviewSheet）には `{ vehicle: selectedVehicle, records }` をそのまま渡す（プレビューの連鎖計算に使う）
   */
  records: RecordsHook["records"];
  /** vehiclesLoading || recordsLoading */
  loading: boolean;
  vehiclesLoading: boolean;
  recordsLoading: boolean;
  /** 障害以外の読み込みエラー（車両 → 記録の順に最初のもの） */
  error: string | null;
  /**
   * 書き込みできない（ログイン中かつクラウド障害中、または previewing）。書き込みは日本語エラーを投げる。
   * 書き込みのボタンを無効にするのに使う。「閲覧専用（クラウド接続待ち）」の注記は障害のときだけ出す（`readOnly && !previewing`）
   */
  readOnly: boolean;
  /**
   * Clerk の読み込み前に、最後に同期した一覧（per-user キャッシュ）を表示している（ログイン中・キャッシュの持ち主が一致するときだけ）。
   * ストアの準備前なので書き込みはできない。撮影・手動入力の可否は読み込み中と同じに扱う。最新の一覧が届いたら false になる
   */
  previewing: boolean;
  outage: VehiclesHook["outage"];
  /** `${selectedVehicleId}:${distanceMode}`。変わったら開いているフォームを閉じる（レンダー中の state 調整に使う） */
  scopeKey: string;
  vehicleActions: Pick<VehiclesHook, "addVehicle" | "addVehicles" | "updateVehicle" | "deleteVehicle">;
  recordActions: Pick<
    RecordsHook,
    "addRecord" | "addRecords" | "updateRecord" | "deleteRecord" | "fetchAllRecords" | "refresh"
  >;
};

/** 画面の状態をリセットするキー（車両または距離の入力方式が変わったら変わる） */
export function scopeKeyOf(selectedVehicleId: string, distanceMode: DistanceMode): string {
  return `${selectedVehicleId}:${distanceMode}`;
}

/** 画面に出す読み込みエラー。車両のエラーを優先し、空文字は無いものとして扱う */
export function composeScopeError(
  vehiclesError: string | null | undefined,
  recordsError: string | null | undefined
): string | null {
  return vehiclesError || recordsError || null;
}

/** 全体の読み込み中フラグ。一覧を読まない（list: false）なら記録の読み込みは待たない */
export function combineScopeLoading(vehiclesLoading: boolean, recordsLoading: boolean, list: boolean): boolean {
  return vehiclesLoading || (list && recordsLoading);
}

/** キャッシュを先に表示しているか。一覧を読まない（list: false）なら記録のほうは見ない */
export function combinePreviewing(vehiclesPreviewing: boolean, recordsPreviewing: boolean, list: boolean): boolean {
  return vehiclesPreviewing || (list && recordsPreviewing);
}

/**
 * useVehicles と useFuelRecords を組み合わせ、画面が共通で使う「選択中の車両とその記録」をまとめて返す。
 * - 記録は車両一覧の読み込み完了後に読み込む（`enabled: !vehiclesLoading`）。既定車両は vehicles[0]
 * - vehicles を渡し、連鎖計算が各車両の距離の入力方式を使えるようにする
 * - フォームの燃費プレビューは、画面が `{ vehicle: selectedVehicle, records }` を useRecordForm に渡して previewInChain で計算する
 * 下のフックはそのまま使うので、データ更新の 2 経路（localStorage / Supabase）と閲覧専用の扱いは変わらない。
 */
export function useVehicleScope(options: UseVehicleScopeOptions = {}): VehicleScope {
  const { list = true } = options;
  const {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    addVehicle,
    addVehicles,
    updateVehicle,
    deleteVehicle,
    loading: vehiclesLoading,
    error: vehiclesError,
    outage,
    readOnly: outageReadOnly,
    previewing: vehiclesPreviewing,
  } = useVehicles();
  const defaultVehicleId = vehicles[0]?.id;
  const {
    records,
    addRecord,
    addRecords,
    updateRecord,
    deleteRecord,
    fetchAllRecords,
    refresh,
    loading: rawRecordsLoading,
    error: recordsError,
    previewing: recordsPreviewing,
  } = useFuelRecords(selectedVehicleId, defaultVehicleId, { enabled: list && !vehiclesLoading, vehicles });

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) ?? null;
  const distanceMode = distanceModeOf(selectedVehicle);
  const recordsLoading = list && rawRecordsLoading;
  const previewing = combinePreviewing(vehiclesPreviewing, recordsPreviewing, list);

  return {
    vehicles,
    selectedVehicleId,
    setSelectedVehicleId,
    selectedVehicle,
    distanceMode,
    defaultVehicleId,
    records,
    loading: combineScopeLoading(vehiclesLoading, rawRecordsLoading, list),
    vehiclesLoading,
    recordsLoading,
    error: composeScopeError(vehiclesError, recordsError),
    readOnly: outageReadOnly || previewing,
    previewing,
    outage,
    scopeKey: scopeKeyOf(selectedVehicleId, distanceMode),
    vehicleActions: { addVehicle, addVehicles, updateVehicle, deleteVehicle },
    recordActions: { addRecord, addRecords, updateRecord, deleteRecord, fetchAllRecords, refresh },
  };
}
