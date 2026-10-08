import { useCallback, useEffect, useRef } from "react";
import { useVehicles } from "./useVehicles";
import { useFuelRecords } from "./useFuelRecords";
import { distanceModeOf, formChainPosition, openRunBefore, previousOdometer, type OpenRun } from "./fillChain";
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

/** フォームの「前回のオドメーター」を、日付・オドメーターを変えたときに取り直す関数（useRecordForm の getPreviousOdometer） */
export type PreviousOdometerGetter = (date: string, excludeRecordId?: string, odometer?: number | null) => number | null;
/** フォームの「直前に開いている run」を取り直す関数（useRecordForm の getOpenRun） */
export type OpenRunGetter = (date: string, excludeRecordId?: string, odometer?: number | null) => OpenRun;

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
  /** 選択中の車両（と、既定車両なら未分類）の記録。連鎖計算済み・日付の降順 */
  records: RecordsHook["records"];
  /** vehiclesLoading || recordsLoading */
  loading: boolean;
  vehiclesLoading: boolean;
  recordsLoading: boolean;
  /** 障害以外の読み込みエラー（車両 → 記録の順に最初のもの） */
  error: string | null;
  /** ログイン中かつクラウド障害中。書き込みは日本語エラーを投げる */
  readOnly: boolean;
  outage: VehiclesHook["outage"];
  /** `${selectedVehicleId}:${distanceMode}`。変わったら開いているフォームを閉じる（レンダー中の state 調整に使う） */
  scopeKey: string;
  vehicleActions: Pick<VehiclesHook, "addVehicle" | "addVehicles" | "updateVehicle" | "deleteVehicle">;
  recordActions: Pick<
    RecordsHook,
    "addRecord" | "addRecords" | "updateRecord" | "deleteRecord" | "fetchAllRecords" | "refresh"
  >;
  /** 安定した参照（useCallback）。常に最新の records で計算する */
  getPreviousOdometer: PreviousOdometerGetter;
  /** 選択中の車両の方式が変わったときだけ参照が変わる。常に最新の records で計算する */
  getOpenRun: OpenRunGetter;
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

/**
 * useVehicles と useFuelRecords を組み合わせ、画面が共通で使う「選択中の車両とその記録」をまとめて返す。
 * - 記録は車両一覧の読み込み完了後に読み込む（`enabled: !vehiclesLoading`）。既定車両は vehicles[0]
 * - vehicles を渡し、連鎖計算が各車両の距離の入力方式を使えるようにする
 * - フォームの getPreviousOdometer / getOpenRun は開いたときに渡すため、最新の records を ref 経由で読む
 *   （フォームを開いている間に記録が再読み込みされても反映する）
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
    readOnly,
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
  } = useFuelRecords(selectedVehicleId, defaultVehicleId, { enabled: list && !vehiclesLoading, vehicles });

  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId) ?? null;
  const distanceMode = distanceModeOf(selectedVehicle);
  const recordsLoading = list && rawRecordsLoading;

  const recordsRef = useRef(records);
  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  // フォーム内で日付・オドメーターを変えたときの「前回のオドメーター」。
  // 編集中の記録は自身を除き、created_at・id は保存値のまま並べる（formChainPosition。同じ日付の記録の中の位置を連鎖計算と揃える）。
  // records は年・月フィルタなどをかける前の、この車両（と表示する未分類）の全記録
  const getPreviousOdometer = useCallback<PreviousOdometerGetter>((date, excludeRecordId, odometer) => {
    const current = recordsRef.current;
    return previousOdometer(current, formChainPosition(current, date, excludeRecordId, odometer));
  }, []);

  // フォーム内で日付・オドメーターを変えたときの「直前に開いている run」（部分給油の合算用。位置は getPreviousOdometer と同じ）
  const getOpenRun = useCallback<OpenRunGetter>(
    (date, excludeRecordId, odometer) => {
      const current = recordsRef.current;
      return openRunBefore(
        current,
        { distance_mode: distanceMode },
        formChainPosition(current, date, excludeRecordId, odometer)
      );
    },
    [distanceMode]
  );

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
    readOnly,
    outage,
    scopeKey: scopeKeyOf(selectedVehicleId, distanceMode),
    vehicleActions: { addVehicle, addVehicles, updateVehicle, deleteVehicle },
    recordActions: { addRecord, addRecords, updateRecord, deleteRecord, fetchAllRecords, refresh },
    getPreviousOdometer,
    getOpenRun,
  };
}
