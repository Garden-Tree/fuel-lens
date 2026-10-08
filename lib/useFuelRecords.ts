import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { isUnclassifiedRecord, isUuid, sortRecordsByDateDesc } from "./recordFilters";
import { FUEL_RECORDS_CHANGED_EVENT, notifyRecordsChanged, useWindowEvent } from "./events";
import { SUPABASE_RETRY_EVENT, useSupabaseOutage } from "./supabaseHealth";
import { applyFillChain, distanceModeOf, normalizeRecord } from "./fillChain";
import { applyRecordPatch } from "./data/columns";
import { matchesRecordScope, recordScopeOf } from "./data/scope";
import { DataError } from "./data/types";
import { loadErrorMessage, requireStores, useDataStores } from "./data/useDataStores";
import type { DistanceMode, FuelRecord, Vehicle } from "./types";

/** @deprecated lib/types.ts から import する（互換のための再エクスポート） */
export type { FuelRecord } from "./types";
/** @deprecated lib/data/columns.ts から import する（互換のための再エクスポート） */
export { pickRecordColumns } from "./data/columns";

export type UseFuelRecordsOptions = {
  /**
   * false の間はクラウドからの読み込みを保留する（loading は true のまま）。
   * 呼び出し側が車両一覧の読み込み完了を待ちたい場合に `!vehiclesLoading` を渡す。
   * 省略時は selectedVehicleId が UUID になった時点で読み込む。
   */
  enabled?: boolean;
  /**
   * 車両一覧（useVehicles の vehicles）。連鎖計算で各車両の distance_mode を知るために使う。
   * - records: selectedVehicleId の車両の方式で計算する（未分類の記録も同じ連鎖に入る）
   * - fetchAllRecords: 車両ごと（未分類は defaultVehicleId の車両）にまとめて、それぞれの方式で計算する
   * 省略時、または一覧に無い車両はトリップモードとして扱う（従来の動作）。
   */
  vehicles?: readonly Pick<Vehicle, "id" | "distance_mode">[];
};

/** 読み込んだ記録（ローカル・クラウド・キャッシュ）の新しい列に既定値を入れる */
function normalizeAll(list: readonly FuelRecord[]): FuelRecord[] {
  return list.map(r => normalizeRecord(r));
}

/**
 * 全車両の記録を車両ごとにまとめて連鎖計算を適用する（純粋関数。入力と同じ順序で返す）。
 * 未分類の記録（vehicle_id null / default-*）は既定車両 defaultVehicleId のグループに入れる
 * （画面で既定車両に表示されるのと同じ連鎖にする）。
 */
export function applyFillChainByVehicle(
  records: readonly FuelRecord[],
  modeOf: (vehicleId: string | null) => DistanceMode,
  defaultVehicleId: string | null | undefined
): FuelRecord[] {
  const groups = new Map<string, number[]>();
  records.forEach((r, i) => {
    const key = isUnclassifiedRecord(r) ? (defaultVehicleId ?? "") : (r.vehicle_id ?? "");
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });
  const out: FuelRecord[] = new Array(records.length);
  for (const [key, indexes] of groups) {
    const chained = applyFillChain(
      indexes.map(i => records[i]),
      { distance_mode: modeOf(key || null) }
    );
    indexes.forEach((recordIndex, j) => {
      out[recordIndex] = chained[j];
    });
  }
  return out;
}

/**
 * 選択中の車両の給油記録（連鎖計算済み）と、その追加・更新・削除。
 * 保存先（localStorage / Supabase）の違いは lib/data/ のストアが吸収し、このフックは状態と通知だけを持つ。
 */
export function useFuelRecords(
  selectedVehicleId?: string,
  defaultVehicleId?: string,
  options: UseFuelRecordsOptions = {}
) {
  const { enabled = true, vehicles } = options;
  const { isLoaded, isSignedIn, stores } = useDataStores();
  /**
   * 保存値のままの記録（新しい列は既定値で補完済み）。画面へは連鎖計算を適用した `records` を返す。
   * 連鎖計算を描画時に行うので、追加・更新・削除で隣の記録の燃費が変わっても、車両の方式を切り替えても即座に反映される。
   */
  const [rawRecords, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);

  const readOnly = isSignedIn && outage != null;
  const scope = useMemo(() => recordScopeOf(selectedVehicleId, defaultVehicleId), [selectedVehicleId, defaultVehicleId]);

  // 車両ごとの距離の入力方式。vehicles 配列の参照が変わっても、方式が同じなら同じ Map を保つ
  const modesKey = JSON.stringify((vehicles ?? []).map(v => [v.id, distanceModeOf(v)]));
  const modeById = useMemo(
    () => new Map<string, DistanceMode>(JSON.parse(modesKey) as [string, DistanceMode][]),
    [modesKey]
  );
  const selectedMode: DistanceMode = (selectedVehicleId ? modeById.get(selectedVehicleId) : undefined) ?? "trip";

  /** 連鎖計算を適用した記録（日付の降順）。UI・統計・CSV はこちらを使う */
  const records = useMemo(
    () => applyFillChain(rawRecords, { distance_mode: selectedMode }),
    [rawRecords, selectedMode]
  );

  const loadData = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    const isCurrent = () => fetchId === fetchCounter.current;
    if (!stores) return;

    if (stores.kind === "local") {
      try {
        const list = await stores.records.list(scope);
        if (!isCurrent()) return;
        setRecords(sortRecordsByDateDesc(list));
      } finally {
        if (isCurrent()) setLoading(false);
      }
      return;
    }

    // 車両一覧の読み込み完了を待つ（呼び出し側が enabled=false を渡した場合は保留）
    if (!enabled) return;

    // 選択中の車両IDが UUID でない = 車両一覧が未確定（または読み込み失敗）。
    // この状態ではクエリを発行せず、空のまま loading を解除する。
    if (!isUuid(scope.vehicleId)) {
      setRecords([]);
      setLoading(false);
      return;
    }

    try {
      // ローカルデータの移行と既定車両の確保（タブ内で 1 回。useVehicles と共有）
      const { migrationError } = await stores.bootstrap();
      if (!isCurrent()) return;
      // 障害以外の移行失敗（ローカルデータは復元済み）。未アップロードであることを error で知らせる
      if (migrationError) setError(migrationError);

      const list = await stores.records.list(scope);
      if (!isCurrent()) return;
      setRecords(sortRecordsByDateDesc(list));
    } catch (e) {
      if (!isCurrent()) return;
      // 障害は outage で通知する（ストアが記録済み）。それ以外は日本語メッセージを error に出す
      const message = loadErrorMessage(e);
      if (message) setError(message);
      // 全車両の記録を読み込むフォールバックはしない。最後に同期した一覧があれば閲覧専用で表示する。
      setRecords(sortRecordsByDateDesc(normalizeAll(stores.records.cached(scope) ?? [])));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isLoaded, stores, scope, enabled]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  }, [loadData]);

  // 車両削除など、別経路で給油記録が変更されたら再読み込みする
  useWindowEvent(FUEL_RECORDS_CHANGED_EVENT, () => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  });

  /** 選択中の車両（と、既定車両なら未分類）の記録だけを日付の降順で残す。読み込み時と同じ判定 */
  const inScope = (list: FuelRecord[]) => sortRecordsByDateDesc(list.filter(r => matchesRecordScope(r, scope)));

  /**
   * 選択中の車両に記録を追加する。0004 の列（odometer / is_full / missed_previous / fuel_type / memo）は省略可
   * （省略時は満タン・記録漏れなし・未指定）。戻り値は保存値のままの記録（連鎖計算の結果は records に反映される）。
   * ログイン中は選択中の車両が UUID でなければ（車両一覧が未確定）日本語エラーを投げる（未分類で保存しない）。
   */
  const addRecord = async (record: Omit<FuelRecord, "id" | "vehicle_id">) => {
    // vehicle_id は選択中の車両、created_at はストアが決める（呼び出し側の値は使わない）
    const added = await requireStores(stores).records.add({ ...record, vehicle_id: selectedVehicleId ?? null });
    setRecords(prev => inScope([added, ...prev]));
    return added;
  };

  /**
   * 記録を更新する。既知の列だけを保存し（id・user_id などは無視）、0004 の列は pickRecordColumns で検証する。
   * 渡さなかった列は変更しない。車両移動（vehicle_id 変更）で選択中の車両に属さなくなった記録は一覧から外す。
   */
  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    await requireStores(stores).records.update(id, updates);
    setRecords(prev => inScope(prev.map(r => (r.id === id ? applyRecordPatch(r, updates) : r))));
  };

  const deleteRecord = async (id: string) => {
    await requireStores(stores).records.remove(id);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  /**
   * 給油記録をまとめて追加する（バックアップの復元用）。
   * 各記録は自分の vehicle_id を持ち、選択中の車両では絞り込まない。
   * ログイン中は 100 件ずつ挿入し、vehicle_id は自分の車両の UUID でなければならない（未分類 null は不可）。
   * 追加後に FUEL_RECORDS_CHANGED_EVENT を発火し、表示中の一覧を再読み込みさせる。
   *
   * @returns 追加した件数
   * @throws 日本語メッセージの Error。途中で失敗した場合は、それまでに追加した件数をメッセージに含める
   */
  const addRecords = async (
    items: Omit<FuelRecord, "id">[],
    options: { onProgress?: (done: number, total: number) => void } = {}
  ): Promise<number> => {
    if (items.length === 0) return 0;
    let added: number;
    try {
      added = await requireStores(stores).records.addMany(items, options.onProgress);
    } catch (e) {
      const done = e instanceof DataError ? e.done : 0;
      if (done > 0) {
        notifyRecordsChanged();
        throw new Error(`${done} 件を追加したところで中断しました。${(e as Error).message}`, { cause: e });
      }
      throw e;
    }
    notifyRecordsChanged();
    return added;
  };

  /** 全車両の記録へ車両ごとの連鎖計算を適用する（未分類は既定車両の連鎖に入れる） */
  const chainAll = useCallback(
    (list: FuelRecord[]) =>
      sortRecordsByDateDesc(
        applyFillChainByVehicle(
          normalizeAll(list),
          id => (id ? modeById.get(id) : undefined) ?? "trip",
          defaultVehicleId
        )
      ),
    [modeById, defaultVehicleId]
  );

  /**
   * 全車両の給油記録を取得する（バックアップ・全車両 CSV・復元の重複判定用）。
   * 選択中の車両では絞り込まない。日付の新しい順。車両ごと（未分類は既定車両）に連鎖計算を適用済み。
   * ログイン中は 1,000 件ずつページングして全件を読む（PostgREST の既定上限を超えても欠けないように）。
   */
  const fetchAllRecords = useCallback(async (): Promise<FuelRecord[]> => {
    if (!isLoaded) throw new Error("読み込み中です。しばらく待ってから再度お試しください。");
    return chainAll(await requireStores(stores).records.listAll());
  }, [isLoaded, stores, chainAll]);

  const refresh = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadData(currentFetchId);
  }, [loadData]);

  // 障害バナーの「再試行」・自動再試行で再読み込みする
  useWindowEvent(SUPABASE_RETRY_EVENT, () => {
    void refresh();
  });

  return {
    /** 連鎖計算（lib/fillChain.ts）を適用済みの記録。日付の降順 */
    records,
    loading,
    /** 障害以外の読み込みエラー（RLS 違反など）。障害は `outage` で通知する。 */
    error,
    /** クラウドDBの障害種別。null なら正常。 */
    outage,
    /** ログイン中かつ障害中。true のとき add/update/delete は日本語エラーを投げる。 */
    readOnly,
    addRecord,
    updateRecord,
    deleteRecord,
    /** 記録をまとめて追加する（復元用。各記録の vehicle_id をそのまま使う） */
    addRecords,
    /** 全車両の記録を取得する（選択中の車両で絞り込まない） */
    fetchAllRecords,
    refresh,
  };
}
