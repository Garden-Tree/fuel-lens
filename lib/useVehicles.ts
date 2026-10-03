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
  ensureDefaultVehicle,
  withStatus,
  LOCAL_RECORDS_KEY,
  LOCAL_VEHICLES_KEY,
  LOCAL_DEFAULT_VEHICLE_ID,
  DEFAULT_VEHICLE_NAME,
} from "./migrateLocalData";
import {
  classifySupabaseFailure,
  clearOutage,
  readCache,
  readOnlyError,
  setOutage,
  useSupabaseOutage,
  writeCache,
} from "./supabaseHealth";

export type Vehicle = {
  id: string;
  user_id: string;
  name: string;
  type: "car" | "bike";
  created_at?: string;
};

const DEFAULT_VEHICLE: Vehicle = {
  id: LOCAL_DEFAULT_VEHICLE_ID,
  user_id: "local",
  name: DEFAULT_VEHICLE_NAME,
  type: "car",
};

const SELECTED_VEHICLE_KEY = "fuel_lens_selected_vehicle_id";
/** 給油記録が別経路（車両削除など）で変更されたことを useFuelRecords へ知らせるイベント */
export const FUEL_RECORDS_CHANGED_EVENT = "fuel_records_changed";

const vehiclesCacheKey = (userId: string) => `fuel_lens_cache_vehicles_${userId}`;

function parseLocalVehicles(raw: string | null): Vehicle[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is Vehicle =>
        !!v && typeof v === "object" && typeof (v as Vehicle).id === "string" && typeof (v as Vehicle).name === "string"
    );
  } catch {
    return [];
  }
}

function pickSelected(list: Vehicle[], cachedId: string | null): string {
  if (cachedId && list.some(v => v.id === cachedId)) return cachedId;
  return list[0]?.id ?? DEFAULT_VEHICLE.id;
}

function errorMessage(e: unknown): string {
  if (isAuthTokenError(e)) return AUTH_TOKEN_ERROR_MESSAGE;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "車両データの読み込みに失敗しました";
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

export function useVehicles() {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([DEFAULT_VEHICLE]);
  // localStorage は SSR と初回描画で一致させるため、初期化子では読まず loadVehicles 内で読む
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<string>(DEFAULT_VEHICLE.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);
  /** クラウドから正常に読み込めた後、この userId のキャッシュへ vehicles を書き戻す */
  const cacheOwnerRef = useRef<string | null>(null);

  const readOnly = !!isSignedIn && outage != null;

  useEffect(() => {
    if (cacheOwnerRef.current) writeCache(vehiclesCacheKey(cacheOwnerRef.current), vehicles);
  }, [vehicles]);

  const setSelectedVehicleId = useCallback((id: string) => {
    setSelectedVehicleIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(SELECTED_VEHICLE_KEY, id);
    }
  }, []);

  const loadVehicles = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);

    const cachedSelectedId = typeof window !== "undefined" ? localStorage.getItem(SELECTED_VEHICLE_KEY) : null;

    if (!isSignedIn) {
      cacheOwnerRef.current = null;
      try {
        const localSaved = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
        if (fetchId !== fetchCounter.current) return;
        const parsed = parseLocalVehicles(localSaved);
        const loadedVehicles = parsed.length > 0 ? parsed : [DEFAULT_VEHICLE];
        setVehicles(loadedVehicles);
        setSelectedVehicleIdState(pickSelected(loadedVehicles, cachedSelectedId));
      } finally {
        if (fetchId === fetchCounter.current) setLoading(false);
      }
      return;
    }

    if (!userId) return;
    const supabase = getSupabaseClient(userId, getToken);

    try {
      // ローカルデータの移行（useFuelRecords からも呼ばれるが、ロックにより 1 回しか走らない）
      try {
        await migrateLocalData(supabase, userId);
      } catch (e) {
        const kind = classify((e as { status?: number })?.status, e);
        if (kind) throw e; // 障害なら以降の読み込みも失敗するので下の catch へ
        // 障害以外（RLS 等）の移行失敗はログのみ。ローカルデータは復元済みで次回再試行される。
      }

      if (fetchId !== fetchCounter.current) return;

      // クラウドから車両一覧を取得（1 台もなければ既定車両を自動生成）
      const fetchedVehicles = await ensureDefaultVehicle(supabase, userId);
      if (fetchId !== fetchCounter.current) return;

      clearOutage();
      cacheOwnerRef.current = userId;
      setVehicles(fetchedVehicles);
      setSelectedVehicleIdState(pickSelected(fetchedVehicles, cachedSelectedId));
    } catch (e) {
      if (fetchId !== fetchCounter.current) return;
      console.error("車両データの読み込み失敗:", e);

      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      else setError(errorMessage(e));

      // ログイン中は DEFAULT_VEHICLE へフォールバックしない（vehicle_id=null の保存を防ぐ）。
      // 最後に同期した一覧があればそれを閲覧専用で表示する（キャッシュは上書きしない）。
      cacheOwnerRef.current = null;
      const cached = readCache<Vehicle[]>(vehiclesCacheKey(userId));
      const list = Array.isArray(cached) ? cached : [];
      setVehicles(list);
      setSelectedVehicleIdState(list.length > 0 ? pickSelected(list, cachedSelectedId) : DEFAULT_VEHICLE.id);
    } finally {
      if (fetchId === fetchCounter.current) {
        setLoading(false);
      }
    }
  }, [isLoaded, isSignedIn, userId, getToken]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadVehicles(currentFetchId);
  }, [loadVehicles]);

  const refreshVehicles = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadVehicles(currentFetchId);
  }, [loadVehicles]);

  const requireWritable = () => {
    if (readOnly) throw readOnlyError(outage);
  };

  const addVehicle = async (name: string, type: "car" | "bike") => {
    if (!isSignedIn) {
      const newVehicle: Vehicle = {
        id: `local-vehicle-${Date.now()}`,
        user_id: "local",
        name,
        type,
      };
      const updated = [...vehicles, newVehicle];
      setVehicles(updated);
      setSelectedVehicleId(newVehicle.id);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
      }
      return newVehicle;
    }

    requireWritable();
    const supabase = getSupabaseClient(userId, getToken);
    const { data, error: insertError, status } = await supabase
      .from("vehicles")
      .insert({ user_id: userId, name, type })
      .select()
      .single();

    if (insertError) {
      const kind = classify(status, insertError);
      if (kind) setOutage(kind);
      throw normalizeError(insertError, status);
    }

    const added = data as Vehicle;
    setVehicles(prev => [...prev, added]);
    setSelectedVehicleId(added.id);
    return added;
  };

  const deleteVehicle = async (id: string) => {
    if (vehicles.length <= 1) {
      // データフック内では UI（alert/toast）を出さず、呼び出し元に判断を委ねる
      throw new Error("最低1台の車両は残す必要があります。");
    }

    if (!isSignedIn) {
      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      if (selectedVehicleId === id && updated.length > 0) {
        setSelectedVehicleId(updated[0].id);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));

        // 関連するローカルの給油レコードも削除
        const localRecords = localStorage.getItem(LOCAL_RECORDS_KEY);
        if (localRecords) {
          try {
            const parsedRecords: unknown = JSON.parse(localRecords);
            if (Array.isArray(parsedRecords)) {
              const filteredRecords = parsedRecords.filter(
                (r: { vehicle_id?: unknown }) => r?.vehicle_id !== id
              );
              localStorage.setItem(LOCAL_RECORDS_KEY, JSON.stringify(filteredRecords));
            }
          } catch (e) {
            console.error("ローカル給油レコードの削除失敗:", e);
          }
        }
        window.dispatchEvent(new CustomEvent(FUEL_RECORDS_CHANGED_EVENT, { detail: { vehicleId: id } }));
      }
      return;
    }

    requireWritable();
    try {
      const supabase = getSupabaseClient(userId, getToken);

      // 確認ダイアログの文言どおり、関連する給油記録を先に削除してから車両を削除する
      const recRes = await supabase.from("fuel_records").delete().eq("vehicle_id", id);
      if (recRes.error) throw withStatus(recRes.error, recRes.status);

      const vehRes = await supabase.from("vehicles").delete().eq("id", id);
      if (vehRes.error) throw withStatus(vehRes.error, vehRes.status);

      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      if (selectedVehicleId === id && updated.length > 0) {
        setSelectedVehicleId(updated[0].id);
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(FUEL_RECORDS_CHANGED_EVENT, { detail: { vehicleId: id } }));
      }
    } catch (e) {
      console.error("車両の削除失敗:", e);
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      throw normalizeError(e);
    }
  };

  const updateVehicle = async (id: string, name: string, type: "car" | "bike") => {
    if (!isSignedIn) {
      const updated = vehicles.map(v => v.id === id ? { ...v, name, type } : v);
      setVehicles(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
      }
      return;
    }

    requireWritable();
    try {
      const supabase = getSupabaseClient(userId, getToken);
      const { error: updateError, status } = await supabase
        .from("vehicles")
        .update({ name, type })
        .eq("id", id);

      if (updateError) throw withStatus(updateError, status);

      setVehicles(prev => prev.map(v => v.id === id ? { ...v, name, type } : v));
    } catch (e) {
      console.error("車両の更新失敗:", e);
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      throw normalizeError(e);
    }
  };

  return {
    vehicles,
    selectedVehicleId,
    selectedVehicle: vehicles.find(v => v.id === selectedVehicleId) || vehicles[0],
    loading,
    /** 障害以外の読み込みエラー（RLS 違反など）。障害は `outage` で通知する。 */
    error,
    /** クラウドDBの障害種別。null なら正常。 */
    outage,
    /** ログイン中かつ障害中。true のとき add/update/delete は日本語エラーを投げる。 */
    readOnly,
    setSelectedVehicleId,
    addVehicle,
    deleteVehicle,
    updateVehicle,
    refreshVehicles,
  };
}
