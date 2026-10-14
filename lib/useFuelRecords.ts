import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { isUnclassifiedRecord, isUuid, sortRecordsByDateDesc } from "./recordFilters";
import { FUEL_RECORDS_CHANGED_EVENT, notifyRecordsChanged, notifyVehiclesChanged, useWindowEvent } from "./events";
import { getOutage, SUPABASE_RETRY_EVENT, useSupabaseOutage } from "./supabaseHealth";
import { useReturnRefresh } from "./useReturnRefresh";
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
  const { isLoaded, isSignedIn, userId, stores, cachePreview } = useDataStores();
  /**
   * 保存値のままの記録（新しい列は既定値で補完済み）。画面へは連鎖計算を適用した `records` を返す。
   * 連鎖計算を描画時に行うので、追加・更新・削除で隣の記録の燃費が変わっても、車両の方式を切り替えても即座に反映される。
   */
  const [rawRecords, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Clerk の読み込み前に、最後に同期した一覧（キャッシュ）を表示している範囲（書き込みはできない）。
  // 同じ範囲の次の通常の読み込みは loading を立てずに置き換える（スケルトンに戻さない）
  const [previewing, setPreviewing] = useState(false);
  const previewScopeRef = useRef<string | null>(null);
  // 先行表示しているキャッシュの持ち主（Clerk の確定値と違えば、そのキャッシュは見せ続けない）
  const previewUserRef = useRef<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);
  // 実行中の一覧の読み込みの数。書き込みの完了時に読み込みが実行中なら、その応答は書き込み前の一覧の可能性があるので読み直す
  const inFlightLoads = useRef(0);
  // inFlightLoads のうち、画面復帰時の裏の読み込み（loading を立てない）の数
  const inFlightBackground = useRef(0);
  // 「再試行」イベントの再読み込みだけ、クラウドの初期化の失敗メモ（30 秒）を飛ばす
  const forceBootstrap = useRef(false);

  const readOnly = isSignedIn && outage != null;
  const scope = useMemo(() => recordScopeOf(selectedVehicleId, defaultVehicleId), [selectedVehicleId, defaultVehicleId]);
  // 最新の描画の scope。書き込みの完了後の絞り込みは、書き込みを始めた描画の scope ではなくこちらを使う
  // （書き込み中に車両を切り替えると、古い scope で新しい車両の一覧を絞り込んで空にしたり、前の車両の記録を混ぜたりするため）
  const scopeRef = useRef(scope);
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

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

  /**
   * 選択中の範囲の記録を読み込む。
   * background: true は画面復帰時の再取得（クラウドのみ）。loading を立てず表示中の一覧を残し、成功したときだけ置き換える。
   * 失敗しても一覧とエラー表示は変えない（console にだけ出す。障害ならストアが outage を記録する）。
   * どちらも fetchCounter で新しい読み込みに無効化される。
   */
  const loadData = useCallback(async (fetchId: number, { background = false }: { background?: boolean } = {}) => {
    const scopeKey = `${scope.vehicleId ?? ""}:${scope.includeUnclassified}`;
    // キャッシュの先行表示をやめ、一覧を空に戻して読み込み中にする
    const dropPreview = () => {
      if (previewScopeRef.current === null) return;
      previewScopeRef.current = null;
      previewUserRef.current = null;
      setPreviewing(false);
      setRecords([]);
      setLoading(true);
    };
    if (!isLoaded) {
      // サーバーがログイン中と言い、キャッシュの持ち主も同じユーザーなら、最後に同期した一覧を先に表示する（閲覧専用）。
      // 車両一覧（キャッシュを含む）が決まってから（enabled）、UUID の車両だけ
      if (background) return;
      const cached = cachePreview && enabled && isUuid(scope.vehicleId) ? cachePreview.records(scope) : null;
      if (!cachePreview || !cached) {
        // 別の範囲（車両）のキャッシュを表示していたら、それを見せ続けない
        dropPreview();
        return;
      }
      setRecords(sortRecordsByDateDesc(normalizeAll(cached)));
      setError(null);
      previewScopeRef.current = scopeKey;
      previewUserRef.current = cachePreview.userId;
      setPreviewing(true);
      setLoading(false);
      return;
    }
    const isCurrent = () => fetchId === fetchCounter.current;
    // 読み込みが最新のまま終わったら loading とキャッシュの先行表示を解除する
    const finish = () => {
      if (!isCurrent()) return;
      setLoading(false);
      previewScopeRef.current = null;
      previewUserRef.current = null;
      setPreviewing(false);
    };
    if (background) {
      if (stores?.kind !== "cloud" || !enabled || !isUuid(scope.vehicleId)) return;
      inFlightLoads.current++;
      inFlightBackground.current++;
      try {
        const { migrationError, migrated } = await stores.bootstrap();
        if (migrated) notifyVehiclesChanged();
        if (!isCurrent()) return;
        const list = await stores.records.list(scope);
        if (!isCurrent()) return;
        setError(migrationError ?? null);
        setRecords(sortRecordsByDateDesc(list));
      } catch (e) {
        console.error("給油記録の再取得に失敗（表示中の一覧を残す）:", e);
      } finally {
        inFlightLoads.current--;
        inFlightBackground.current--;
        // この読み込みが通常の読み込みを無効化していた場合に備えて解除する（既に false なら何も変わらない）
        finish();
      }
      return;
    }
    // Clerk の確定したユーザーが先行表示の持ち主と違う（別のユーザー・未ログイン）なら、先にキャッシュを消す
    if (previewScopeRef.current !== null && previewUserRef.current !== (isSignedIn ? userId : null)) dropPreview();
    // 同じ範囲のキャッシュを表示中なら loading を立てずに置き換える（失敗時の扱いは通常の読み込みと同じ）。
    // 範囲が変わっていれば（車両一覧の更新で選択が変わったなど）別の車両の記録を見せ続けないよう、通常どおりスケルトンにする
    if (previewScopeRef.current !== scopeKey) setLoading(true);
    setError(null);
    const force = forceBootstrap.current;
    forceBootstrap.current = false;
    if (!stores) return;

    if (stores.kind === "local") {
      inFlightLoads.current++;
      try {
        const list = await stores.records.list(scope);
        if (!isCurrent()) return;
        setRecords(sortRecordsByDateDesc(list));
      } finally {
        inFlightLoads.current--;
        finish();
      }
      return;
    }

    // 車両一覧の読み込み完了を待つ（呼び出し側が enabled=false を渡した場合は保留）
    if (!enabled) return;

    // 選択中の車両IDが UUID でない = 車両一覧が未確定（または読み込み失敗）。
    // この状態ではクエリを発行せず、空のまま loading を解除する。
    if (!isUuid(scope.vehicleId)) {
      setRecords([]);
      finish();
      return;
    }

    inFlightLoads.current++;
    try {
      // ローカルデータの移行と既定車両の確保（タブ内で 1 回。useVehicles と共有）
      const { migrationError, migrated } = await stores.bootstrap({ force });
      // 移行の再実行（車両切り替え・FUEL_RECORDS_CHANGED など）で車両が増えたら useVehicles に読み直させる。
      // 初回の読み込みで移行した場合は useVehicles も migrated: true を受け取り、もう 1 回読み直すことになるが許容する。
      // この読み込みが古くなっていても、書き込みが起きた事実は変わらないので isCurrent より先に通知する
      if (migrated) notifyVehiclesChanged();
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
      inFlightLoads.current--;
      finish();
    }
  }, [isLoaded, isSignedIn, userId, stores, scope, enabled, cachePreview]);

  // 最新の描画の loadData（書き込みの完了後に読み直すときに、書き込みを始めた描画の古い scope で読まないように）
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  }, [loadData]);

  // 車両削除など、別経路で給油記録が変更されたら再読み込みする
  useWindowEvent(FUEL_RECORDS_CHANGED_EVENT, () => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  });

  /**
   * 選択中の車両（と、既定車両なら未分類）の記録だけを日付の降順で残す。読み込み時と同じ判定。
   * 書き込みの完了後に呼ぶので、関数を作った描画の scope ではなく最新の scope（scopeRef）で絞り込む
   */
  const inScope = (list: FuelRecord[]) =>
    sortRecordsByDateDesc(list.filter(r => matchesRecordScope(r, scopeRef.current)));

  /**
   * 書き込みの完了時に一覧の読み込みが実行中なら、読み込みをやり直す。
   * 実行中の GET が書き込み前の一覧を返すと、書き込みを反映した state とキャッシュをその古い一覧で上書きしてしまうため
   * （fetchCounter を進めて古い読み込みの結果を捨てる）。読み込みが実行中でなければ何もしない（通常は余計な GET を出さない）
   */
  const reloadIfLoadInFlight = () => {
    if (inFlightLoads.current === 0) return;
    // 実行中が画面復帰時の裏の読み込みだけなら、読み直しも裏で行う（スケルトンを出さない）
    const background = inFlightLoads.current === inFlightBackground.current;
    const currentFetchId = ++fetchCounter.current;
    void loadDataRef.current(currentFetchId, { background });
  };

  /**
   * 選択中の車両に記録を追加する。0004 の列（odometer / is_full / missed_previous / fuel_type / memo）は省略可
   * （省略時は満タン・記録漏れなし・未指定）。戻り値は保存値のままの記録（連鎖計算の結果は records に反映される）。
   * ログイン中は選択中の車両が UUID でなければ（車両一覧が未確定）日本語エラーを投げる（未分類で保存しない）。
   */
  const addRecord = async (record: Omit<FuelRecord, "id" | "vehicle_id">) => {
    // vehicle_id は選択中の車両、created_at はストアが決める（呼び出し側の値は使わない）
    const added = await requireStores(stores).records.add({ ...record, vehicle_id: selectedVehicleId ?? null });
    setRecords(prev => inScope([added, ...prev]));
    reloadIfLoadInFlight();
    return added;
  };

  /**
   * 記録を更新する。既知の列だけを保存し（id・user_id などは無視）、0004 の列は pickRecordColumns で検証する。
   * 渡さなかった列は変更しない。車両移動（vehicle_id 変更）で選択中の車両に属さなくなった記録は一覧から外す。
   */
  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    await requireStores(stores).records.update(id, updates);
    setRecords(prev => inScope(prev.map(r => (r.id === id ? applyRecordPatch(r, updates) : r))));
    reloadIfLoadInFlight();
  };

  const deleteRecord = async (id: string) => {
    await requireStores(stores).records.remove(id);
    setRecords(prev => prev.filter(r => r.id !== id));
    reloadIfLoadInFlight();
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
    forceBootstrap.current = true;
    void refresh();
  });

  // しばらく離れた画面に戻ったら、他の端末・タブでの変更を裏で読み直す（ログイン中・障害なしのときだけ。
  // 障害中は再試行の仕組みが読み直す）。読み込みが実行中なら、その結果が新しいので何もしない
  useReturnRefresh(() => {
    if (getOutage() || inFlightLoads.current > 0) return;
    const currentFetchId = ++fetchCounter.current;
    void loadDataRef.current(currentFetchId, { background: true });
  }, { enabled: stores?.kind === "cloud" && outage == null });

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
    /** Clerk の読み込み前に、最後に同期した一覧（キャッシュ）を表示している（書き込みはできない。useVehicles の previewing と同じ） */
    previewing,
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
