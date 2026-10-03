import { useState, useEffect, useCallback, useRef } from "react";
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
  withStatus,
  LOCAL_RECORDS_KEY,
  LOCAL_DEFAULT_VEHICLE_ID,
} from "./migrateLocalData";
import { isDefaultVehicleSelected, isUuid, matchesSelectedVehicle } from "./recordFilters";
import {
  classifySupabaseFailure,
  clearOutage,
  readCache,
  readOnlyError,
  setOutage,
  useSupabaseOutage,
  writeCache,
} from "./supabaseHealth";

export type FuelRecord = {
  id: string;
  date: string;
  total_distance: number | null;
  fuel_amount: number | null;
  gas_station: string | null;
  price_per_unit: number | null;
  total_cost: number | null;
  fuel_efficiency: number | null;
  vehicle_id?: string | null;
  created_at?: string | null;
};

export type UseFuelRecordsOptions = {
  /**
   * false の間はクラウドからの読み込みを保留する（loading は true のまま）。
   * 呼び出し側が車両一覧の読み込み完了を待ちたい場合に `!vehiclesLoading` を渡す。
   * 省略時は selectedVehicleId が UUID になった時点で読み込む。
   */
  enabled?: boolean;
};

/** 車両削除などで給油記録が別経路から変更されたときに発火するイベント名（useVehicles と共有） */
const FUEL_RECORDS_CHANGED_EVENT = "fuel_records_changed";

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

function readLocalRecords(): FuelRecord[] {
  if (typeof window === "undefined") return [];
  return parseLocalRecords(localStorage.getItem(LOCAL_RECORDS_KEY));
}

function writeLocalRecords(list: FuelRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(list));
}

function errorMessage(e: unknown): string {
  if (isAuthTokenError(e)) return AUTH_TOKEN_ERROR_MESSAGE;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "給油データの取得に失敗しました";
}

/** 認証トークン欠落は障害（outage）ではなくアプリエラーとして扱う */
function classify(status: number | null | undefined, e: unknown) {
  return isAuthTokenError(e) ? null : classifySupabaseFailure(status, e);
}

/** 呼び出し元（alert 等）に見せるエラーへ正規化する。認証トークン欠落は日本語メッセージに置き換える。 */
function normalizeError(e: unknown, status?: number): unknown {
  if (isAuthTokenError(e)) return new SupabaseAuthTokenError();
  return e && typeof e === "object" ? withStatus(e, status) : e;
}

export function useFuelRecords(
  selectedVehicleId?: string,
  defaultVehicleId?: string,
  options: UseFuelRecordsOptions = {}
) {
  const { enabled = true } = options;
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [records, setRecords] = useState<FuelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);
  /** クラウドから正常に読み込めた後、このキーへ records を書き戻す（障害時の閲覧専用表示用） */
  const cacheKeyRef = useRef<string | null>(null);

  const readOnly = !!isSignedIn && outage != null;

  useEffect(() => {
    if (cacheKeyRef.current) writeCache(cacheKeyRef.current, records);
  }, [records]);

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
        setRecords(sortRecordsByDateDesc(filtered));
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
          // 障害以外の移行失敗はログのみ（ローカルデータは復元済み）
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
      setRecords(sortRecordsByDateDesc((data ?? []) as FuelRecord[]));
    } catch (e) {
      if (fetchId !== fetchCounter.current) return;
      console.error("給油データの取得失敗:", e);

      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      else setError(errorMessage(e));

      // 全車両の記録を読み込むフォールバックはしない。最後に同期した一覧があれば閲覧専用で表示する。
      cacheKeyRef.current = null;
      const cached = readCache<FuelRecord[]>(cacheKey);
      setRecords(Array.isArray(cached) ? sortRecordsByDateDesc(cached) : []);
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

  const addRecord = async (record: Omit<FuelRecord, "id" | "vehicle_id">) => {
    if (!isSignedIn) {
      const localTarget =
        selectedVehicleId && !selectedVehicleId.startsWith("default-") ? selectedVehicleId : LOCAL_DEFAULT_VEHICLE_ID;
      const newRecord: FuelRecord = {
        ...record,
        id: Date.now().toString(),
        vehicle_id: localTarget,
        created_at: new Date().toISOString(),
      };
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
      .insert({ ...record, user_id: userId, vehicle_id: selectedVehicleId })
      .select()
      .single();

    if (insertError) {
      const kind = classify(status, insertError);
      if (kind) setOutage(kind);
      throw normalizeError(insertError, status);
    }

    const added = data as FuelRecord;
    setRecords(prev => sortRecordsByDateDesc([added, ...prev]));
    return added;
  };

  const updateRecord = async (id: string, updates: Partial<FuelRecord>) => {
    if (!isSignedIn) {
      const all = readLocalRecords();
      if (all.length > 0) {
        writeLocalRecords(all.map(r => (r.id === id ? { ...r, ...updates } : r)));
      }
      setRecords(prev => applyLocalFilter(prev.map(r => (r.id === id ? { ...r, ...updates } : r))));
      return;
    }

    requireWritable();
    const supabase = getSupabaseClient(userId, getToken);
    const { error: updateError, status } = await supabase.from("fuel_records").update(updates).eq("id", id);
    if (updateError) {
      const kind = classify(status, updateError);
      if (kind) setOutage(kind);
      throw normalizeError(updateError, status);
    }

    // 車両移動（vehicle_id 変更）で選択中車両に属さなくなった記録は一覧から外す。
    // 読み込み時と同じ判定（未分類は既定車両にのみ表示）を使う。
    setRecords(prev => applyLocalFilter(prev.map(r => (r.id === id ? { ...r, ...updates } : r))));
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

  const refresh = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadData(currentFetchId);
  }, [loadData]);

  return {
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
    refresh,
  };
}
