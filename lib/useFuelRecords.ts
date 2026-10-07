import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  getSupabaseClient,
  isAuthTokenError,
  SupabaseAuthTokenError,
  AUTH_TOKEN_ERROR_MESSAGE,
} from "./supabaseClient";
import {
  migrateLocalData,
  migrationFailedRecently,
  migrationErrorMessage,
  withStatus,
  CrossTabLockError,
  LOCAL_RECORDS_KEY,
  LOCAL_DEFAULT_VEHICLE_ID,
} from "./migrateLocalData";
import {
  FUEL_RECORDS_CHANGED_EVENT,
  isDefaultVehicleSelected,
  isUnclassifiedRecord,
  isUuid,
  matchesSelectedVehicle,
} from "./recordFilters";
import {
  CLOUD_LOAD_ERROR_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  SUPABASE_RETRY_EVENT,
  classifySupabaseFailure,
  clearOutage,
  isPermissionDeniedError,
  readCache,
  readOnlyError,
  setOutage,
  toUserFacingWriteError,
  useSupabaseOutage,
  writeCache,
} from "./supabaseHealth";
import { normalizeTimestamp } from "./backup";
import {
  applyFillChain,
  distanceModeOf,
  isFuelType,
  normalizeRecord,
  sanitizeMemo,
  sanitizeOdometer,
  type DistanceMode,
  type FuelType,
} from "./fillChain";
import type { Vehicle } from "./useVehicles";

export type { FuelType } from "./fillChain";
export { FUEL_TYPES, FUEL_TYPE_LABELS, MEMO_MAX_LENGTH, isFuelType, normalizeRecord } from "./fillChain";

export type FuelRecord = {
  id: string;
  date: string;
  /**
   * 区間距離 (km)。トリップモードの車両では入力値、オドメーターモードの車両では odometer の差分から
   * 導出した値（useFuelRecords が読み取り時に applyFillChain で上書きする）。
   */
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  /** 燃費 (km/L)。useFuelRecords が読み取り時に applyFillChain で再計算した値（部分給油は null） */
  fuel_efficiency: number | null;
  vehicle_id?: string | null;
  created_at?: string | null;
  /** 給油時の積算距離 (km)。オドメーターモードの車両では必須入力（0004 で追加） */
  odometer?: number | null;
  /** 満タン給油か。省略は true。false は部分給油（0004 で追加） */
  is_full?: boolean;
  /** この給油の前に記録し忘れた給油がある。省略は false。true なら連鎖を切る（0004 で追加） */
  missed_previous?: boolean;
  /** 燃料種別。null / 省略は未指定（0004 で追加） */
  fuel_type?: FuelType | null;
  /** メモ（200 文字まで）。null / 省略はなし（0004 で追加） */
  memo?: string | null;
};

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

/** addRecord / updateRecord / addRecords で保存する列（id・user_id 以外の FuelRecord の列） */
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

const recordsCacheKey = (userId: string, vehicleId: string | null) =>
  `fuel_lens_cache_records_${userId}_${vehicleId ?? "all"}`;

function sortRecordsByDateDesc(list: FuelRecord[]): FuelRecord[] {
  return [...list].sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    if (a.id === b.id) return 0;
    return b.id > a.id ? 1 : -1;
  });
}

function parseLocalRecords(raw: string | null): FuelRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is FuelRecord => !!r && typeof r === "object" && typeof (r as FuelRecord).id === "string"
    );
  } catch {
    return [];
  }
}

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

function readLocalRecords(): FuelRecord[] {
  if (typeof window === "undefined") return [];
  return parseLocalRecords(localStorage.getItem(LOCAL_RECORDS_KEY));
}

function writeLocalRecords(list: FuelRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(list));
}

/** 読み込み失敗時に画面へ出す日本語メッセージ（英語の生エラーは console.error のみに出す） */
function errorMessage(e: unknown): string {
  if (isAuthTokenError(e)) return AUTH_TOKEN_ERROR_MESSAGE;
  if (isPermissionDeniedError(e)) return PERMISSION_DENIED_MESSAGE;
  if (e instanceof CrossTabLockError) return e.message;
  return CLOUD_LOAD_ERROR_MESSAGE;
}

/** 認証トークン欠落は障害（outage）ではなくアプリエラーとして扱う */
function classify(status: number | null | undefined, e: unknown) {
  return isAuthTokenError(e) ? null : classifySupabaseFailure(status, e);
}

/** 呼び出し元（alert 等）に見せるエラーへ正規化する。認証トークン欠落は日本語メッセージに置き換える。 */
function normalizeError(e: unknown, status?: number): Error {
  if (isAuthTokenError(e)) return new SupabaseAuthTokenError();
  // 生エラーのログと日本語メッセージへの変換は toUserFacingWriteError に集約する
  return toUserFacingWriteError(e, status);
}

export function useFuelRecords(
  selectedVehicleId?: string,
  defaultVehicleId?: string,
  options: UseFuelRecordsOptions = {}
) {
  const { enabled = true, vehicles } = options;
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  /**
   * 保存値のままの記録（新しい列は既定値で補完済み）。画面へは連鎖計算を適用した `records` を返す。
   * 連鎖計算を描画時に行うので、追加・更新・削除で隣の記録の燃費が変わっても、車両の方式を切り替えても即座に反映される。
   */
  const [rawRecords, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);
  /** クラウドから正常に読み込めた後、このキーへ records を書き戻す（障害時の閲覧専用表示用） */
  const cacheKeyRef = useRef<string | null>(null);

  const readOnly = !!isSignedIn && outage != null;

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

  useEffect(() => {
    if (cacheKeyRef.current) writeCache(cacheKeyRef.current, rawRecords);
  }, [rawRecords]);

  const loadData = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);

    if (!isSignedIn) {
      cacheKeyRef.current = null;
      try {
        const all = readLocalRecords();
        if (fetchId !== fetchCounter.current) return;
        const filtered = all.filter(r => matchesSelectedVehicle(r, selectedVehicleId, defaultVehicleId));
        setRecords(sortRecordsByDateDesc(normalizeAll(filtered)));
      } finally {
        if (fetchId === fetchCounter.current) setLoading(false);
      }
      return;
    }

    if (!userId) return;

    // 車両一覧の読み込み完了を待つ（呼び出し側が enabled=false を渡した場合は保留）
    if (!enabled) return;

    // 選択中の車両IDが UUID でない = 車両一覧が未確定（または読み込み失敗）。
    // この状態ではクエリを発行せず、空のまま loading を解除する。
    if (!isUuid(selectedVehicleId)) {
      cacheKeyRef.current = null;
      setRecords([]);
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient(userId, getToken);
    const includeUnclassified = isDefaultVehicleSelected(selectedVehicleId, defaultVehicleId);
    const cacheKey = recordsCacheKey(userId, selectedVehicleId);

    try {
      // ローカルデータの移行（useVehicles からも呼ばれるが、ロックにより 1 回しか走らない）。
      // useVehicles 側で直近に失敗していれば（RLS 違反など）、ここで同じ失敗を繰り返さない。
      if (!migrationFailedRecently(userId)) {
        try {
          await migrateLocalData(supabase, userId);
        } catch (e) {
          const kind = classify((e as { status?: number })?.status, e);
          if (kind) throw e;
          // 障害以外の移行失敗（ローカルデータは復元済み）。未アップロードであることを error で知らせる。
          if (!isAuthTokenError(e) && fetchId === fetchCounter.current) setError(migrationErrorMessage(e));
        }
      }
      if (fetchId !== fetchCounter.current) return;

      // クエリ構築: 選択中の車両UUIDに一致するものを取得。
      // vehicle_id が null の記録（未分類）は「既定（先頭）車両」を選択している場合のみ含める。
      // 常に含めると、車両が複数あるとき全車両に同じ記録が重複表示・重複集計されてしまう。
      // selectedVehicleId は上で UUID 形式を検証済みなので、フィルタ式に安全に埋め込める。
      let query = supabase.from("fuel_records").select("*").order("date", { ascending: false });
      query = includeUnclassified
        ? query.or(`vehicle_id.eq.${selectedVehicleId},vehicle_id.is.null`)
        : query.eq("vehicle_id", selectedVehicleId);

      const { data, error: queryError, status } = await query;
      if (fetchId !== fetchCounter.current) return;
      if (queryError) throw withStatus(queryError, status);

      clearOutage();
      cacheKeyRef.current = cacheKey;
      setRecords(sortRecordsByDateDesc(normalizeAll((data ?? []) as FuelRecord[])));
    } catch (e) {
      if (fetchId !== fetchCounter.current) return;
      console.error("給油データの取得失敗:", e);

      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      else setError(errorMessage(e));

      // 全車両の記録を読み込むフォールバックはしない。最後に同期した一覧があれば閲覧専用で表示する。
      cacheKeyRef.current = null;
      const cached = readCache<FuelRecord[]>(cacheKey);
      setRecords(Array.isArray(cached) ? sortRecordsByDateDesc(normalizeAll(cached)) : []);
    } finally {
      if (fetchId === fetchCounter.current) {
        setLoading(false);
      }
    }
  }, [isSignedIn, isLoaded, userId, getToken, selectedVehicleId, defaultVehicleId, enabled]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadData(currentFetchId);
  }, [loadData]);

  // 車両削除など、別経路で給油記録が変更されたら再読み込みする
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      const currentFetchId = ++fetchCounter.current;
      loadData(currentFetchId);
    };
    window.addEventListener(FUEL_RECORDS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FUEL_RECORDS_CHANGED_EVENT, handler);
  }, [loadData]);

  const requireWritable = () => {
    if (readOnly) throw readOnlyError(outage);
  };

  const applyLocalFilter = (list: FuelRecord[]) =>
    sortRecordsByDateDesc(list.filter(r => matchesSelectedVehicle(r, selectedVehicleId, defaultVehicleId)));

  /**
   * 選択中の車両に記録を追加する。0004 の列（odometer / is_full / missed_previous / fuel_type / memo）は省略可
   * （省略時は満タン・記録漏れなし・未指定）。戻り値は保存値のままの記録（連鎖計算の結果は records に反映される）。
   */
  const addRecord = async (record: Omit<FuelRecord, "id" | "vehicle_id">) => {
    // vehicle_id は選択中の車両、created_at はここで決める（呼び出し側の値は使わない）
    const columns = pickRecordColumns(record);
    delete columns.vehicle_id;
    delete columns.created_at;
    if (!isSignedIn) {
      const localTarget =
        selectedVehicleId && !selectedVehicleId.startsWith("default-") ? selectedVehicleId : LOCAL_DEFAULT_VEHICLE_ID;
      const newRecord: FuelRecord = normalizeRecord({
        date: record.date,
        total_distance: null,
        fuel_amount: null,
        gas_station: null,
        price_per_unit: null,
        total_cost: null,
        fuel_efficiency: null,
        ...columns,
        id: Date.now().toString(),
        vehicle_id: localTarget,
        created_at: new Date().toISOString(),
      });
      writeLocalRecords([newRecord, ...readLocalRecords()]);
      setRecords(prev => applyLocalFilter([newRecord, ...prev]));
      return newRecord;
    }

    requireWritable();
    if (!isUuid(selectedVehicleId)) {
      // 車両一覧が未確定のまま保存すると vehicle_id=null の「未分類」記録になってしまうため拒否する
      throw new Error("車両情報の読み込みが完了していないため保存できません。しばらく待ってから再度お試しください。");
    }

    const supabase = getSupabaseClient(userId, getToken);
    const { data, error: insertError, status } = await supabase
      .from("fuel_records")
      .insert({ ...columns, user_id: userId, vehicle_id: selectedVehicleId })
      .select()
      .single();

    if (insertError) {
      const kind = classify(status, insertError);
      if (kind) setOutage(kind);
      throw normalizeError(insertError, status);
    }

    const added = normalizeRecord(data as FuelRecord);
    setRecords(prev => sortRecordsByDateDesc([added, ...prev]));
    return added;
  };

  /**
   * 記録を更新する。既知の列だけを保存し（id・user_id などは無視）、0004 の列は pickRecordColumns で検証する。
   * 渡さなかった列は変更しない。
   */
  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    const columns = pickRecordColumns(updates);
    const merge = (r: FuelRecord) => (r.id === id ? normalizeRecord({ ...r, ...columns }) : r);
    if (!isSignedIn) {
      const all = readLocalRecords();
      if (all.length > 0) {
        writeLocalRecords(all.map(merge));
      }
      setRecords(prev => applyLocalFilter(prev.map(merge)));
      return;
    }

    requireWritable();
    if (Object.keys(columns).length === 0) return;
    const supabase = getSupabaseClient(userId, getToken);
    const { error: updateError, status } = await supabase.from("fuel_records").update(columns).eq("id", id);
    if (updateError) {
      const kind = classify(status, updateError);
      if (kind) setOutage(kind);
      throw normalizeError(updateError, status);
    }

    // 車両移動（vehicle_id 変更）で選択中車両に属さなくなった記録は一覧から外す。
    // 読み込み時と同じ判定（未分類は既定車両にのみ表示）を使う。
    setRecords(prev => applyLocalFilter(prev.map(merge)));
  };

  const deleteRecord = async (id: string) => {
    if (!isSignedIn) {
      const all = readLocalRecords();
      if (all.length > 0) {
        writeLocalRecords(all.filter(r => r.id !== id));
      }
      setRecords(prev => prev.filter(r => r.id !== id));
      return;
    }

    requireWritable();
    const supabase = getSupabaseClient(userId, getToken);
    const { error: deleteError, status } = await supabase.from("fuel_records").delete().eq("id", id);
    if (deleteError) {
      const kind = classify(status, deleteError);
      if (kind) setOutage(kind);
      throw normalizeError(deleteError, status);
    }

    setRecords(prev => prev.filter(r => r.id !== id));
  };

  /** 給油記録が別経路で変わったことを全フックインスタンスへ知らせる（自分も含めて再読み込みされる） */
  const notifyRecordsChanged = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FUEL_RECORDS_CHANGED_EVENT, { detail: { bulk: true } }));
    }
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
    const { onProgress } = options;
    if (items.length === 0) return 0;

    if (!isSignedIn) {
      const base = Date.now().toString(36);
      const nowIso = new Date().toISOString();
      const added: FuelRecord[] = items.map((item, i) =>
        normalizeRecord({
          id: `restored-${base}-${i}`,
          date: item.date,
          total_distance: item.total_distance,
          fuel_amount: item.fuel_amount,
          gas_station: item.gas_station,
          price_per_unit: item.price_per_unit,
          total_cost: item.total_cost,
          fuel_efficiency: item.fuel_efficiency,
          vehicle_id: item.vehicle_id ?? null,
          created_at: normalizeTimestamp(item.created_at) ?? nowIso,
          odometer: item.odometer,
          is_full: item.is_full,
          missed_previous: item.missed_previous,
          fuel_type: item.fuel_type,
          memo: item.memo,
        })
      );
      try {
        writeLocalRecords([...readLocalRecords(), ...added]);
      } catch (e) {
        console.error("ローカル給油記録の保存失敗:", e);
        throw new Error("ブラウザの保存容量が不足しているため、記録を追加できませんでした。");
      }
      onProgress?.(added.length, added.length);
      notifyRecordsChanged();
      return added.length;
    }

    requireWritable();
    if (!userId) throw new Error("ログイン情報を確認できませんでした。再読み込みしてください。");
    if (items.some(item => !isUuid(item.vehicle_id))) {
      // ログイン中に vehicle_id=null（未分類）で保存しない
      throw new Error("車両が決まっていない記録があるため追加できません。画面を再読み込みしてから再度お試しください。");
    }

    const supabase = getSupabaseClient(userId, getToken);
    const nowIso = new Date().toISOString();
    const payload = items.map(item => ({
      user_id: userId,
      vehicle_id: item.vehicle_id,
      date: item.date,
      total_distance: item.total_distance,
      fuel_amount: item.fuel_amount,
      gas_station: item.gas_station,
      price_per_unit: item.price_per_unit,
      total_cost: item.total_cost,
      fuel_efficiency: item.fuel_efficiency,
      // insert(配列) は全行のキーの和集合を送るため、created_at は全行に必ず入れる。
      // Postgres が拒否・誤読しない ISO 文字列に正規化し、無効なら現在時刻にする
      created_at: normalizeTimestamp(item.created_at) ?? nowIso,
      // 0004 の列は値があるものだけ送る。キーの無い行には defaultToNull: false により列の既定値
      // （満タン・記録漏れなし・null）が入る
      ...pickRecordColumns({
        odometer: item.odometer,
        is_full: item.is_full,
        missed_previous: item.missed_previous,
        fuel_type: item.fuel_type,
        memo: item.memo,
      }),
    }));

    const CHUNK = 100;
    let inserted = 0;
    try {
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error: insertError, status } = await supabase
          .from("fuel_records")
          .insert(chunk, { defaultToNull: false });
        if (insertError) throw withStatus(insertError, status);
        inserted += chunk.length;
        onProgress?.(inserted, payload.length);
      }
    } catch (e) {
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      const base = normalizeError(e);
      if (inserted > 0) {
        notifyRecordsChanged();
        throw new Error(`${inserted} 件を追加したところで中断しました。${base.message}`, { cause: e });
      }
      throw base;
    }

    notifyRecordsChanged();
    return inserted;
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
    if (!isSignedIn) return chainAll(readLocalRecords());
    if (!userId) throw new Error("ログイン情報を確認できませんでした。再読み込みしてください。");

    const supabase = getSupabaseClient(userId, getToken);
    const PAGE = 1000;
    const all: FuelRecord[] = [];
    try {
      let from = 0;
      for (;;) {
        const { data, error: queryError, status } = await supabase
          .from("fuel_records")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (queryError) throw withStatus(queryError, status);
        const page = (data ?? []) as FuelRecord[];
        // 空のページが返るまで読む。Supabase の max-rows が PAGE より小さく設定されていても、
        // 「PAGE 件未満 = 最終ページ」と誤認してバックアップが黙って欠けないように、
        // 実際に返った件数だけ読み進める
        if (page.length === 0) break;
        all.push(...page);
        from += page.length;
      }
    } catch (e) {
      console.error("全給油データの取得失敗:", e);
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      throw new Error(errorMessage(e), { cause: e });
    }
    return chainAll(all);
  }, [isLoaded, isSignedIn, userId, getToken, chainAll]);

  const refresh = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadData(currentFetchId);
  }, [loadData]);

  // 障害バナーの「再試行」・自動再試行で再読み込みする
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      void refresh();
    };
    window.addEventListener(SUPABASE_RETRY_EVENT, handler);
    return () => window.removeEventListener(SUPABASE_RETRY_EVENT, handler);
  }, [refresh]);

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
