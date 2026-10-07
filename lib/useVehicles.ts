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
  migrationErrorMessage,
  ensureDefaultVehicle,
  withStatus,
  CrossTabLockError,
  LOCAL_RECORDS_KEY,
  LOCAL_VEHICLES_KEY,
  LOCAL_DEFAULT_VEHICLE_ID,
  DEFAULT_VEHICLE_NAME,
} from "./migrateLocalData";
import { FUEL_RECORDS_CHANGED_EVENT, isUnclassifiedRecord, isUuid } from "./recordFilters";
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
  syncCacheOwner,
  toUserFacingWriteError,
  useSupabaseOutage,
  writeCache,
} from "./supabaseHealth";
import {
  isDistanceMode,
  isFuelType,
  normalizeVehicle,
  type DistanceMode,
  type FuelType,
} from "./fillChain";

export type { DistanceMode } from "./fillChain";
export { normalizeVehicle } from "./fillChain";

export type Vehicle = {
  id: string;
  user_id: string;
  name: string;
  type: "car" | "bike";
  created_at?: string;
  /**
   * 距離の入力方式（0004 で追加）。省略・不明は "trip"（トリップメーターの区間距離）。
   * "odometer" なら記録の odometer の差分から区間距離を出す（lib/fillChain.ts）。
   */
  distance_mode?: DistanceMode;
  /** 新規記録の燃料種別の初期値（0004 で追加）。null / 省略は未指定 */
  default_fuel_type?: FuelType | null;
};

/** 車両の設定（距離の入力方式・既定の燃料種別）。省略したキーは変更しない／既定値 */
export type VehicleSettings = {
  distance_mode?: DistanceMode;
  default_fuel_type?: FuelType | null;
};

/**
 * 呼び出し側から受け取った設定を検証し、既知の値だけを残す（不明な値のキーは捨てる）。
 * Supabase へは定義済みのキーだけを送る（未指定なら DB の既定値 / 変更なし）。
 */
export function sanitizeVehicleSettings(settings: VehicleSettings | null | undefined): VehicleSettings {
  const out: VehicleSettings = {};
  if (!settings) return out;
  if (isDistanceMode(settings.distance_mode)) out.distance_mode = settings.distance_mode;
  if (settings.default_fuel_type === null || isFuelType(settings.default_fuel_type)) {
    out.default_fuel_type = settings.default_fuel_type;
  }
  return out;
}

const DEFAULT_VEHICLE: Vehicle = normalizeVehicle({
  id: LOCAL_DEFAULT_VEHICLE_ID,
  user_id: "local",
  name: DEFAULT_VEHICLE_NAME,
  type: "car",
});

const SELECTED_VEHICLE_KEY = "fuel_lens_selected_vehicle_id";

/**
 * 選択中の車両 ID を保存する localStorage キー。
 * ログイン中はユーザーごとに分け、別アカウントの車両 ID を読まないようにする。
 * 未ログイン時は従来のキー（互換のため）。
 */
export function selectedVehicleStorageKey(userId: string | null | undefined): string {
  return userId ? `${SELECTED_VEHICLE_KEY}_${userId}` : SELECTED_VEHICLE_KEY;
}

const vehiclesCacheKey = (userId: string) => `fuel_lens_cache_vehicles_${userId}`;

function parseLocalVehicles(raw: string | null): Vehicle[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (v): v is Vehicle =>
          !!v && typeof v === "object" && typeof (v as Vehicle).id === "string" && typeof (v as Vehicle).name === "string"
      )
      .map(v => normalizeVehicle(v));
  } catch {
    return [];
  }
}

export function pickSelected(list: Vehicle[], cachedId: string | null): string {
  if (cachedId && list.some(v => v.id === cachedId)) return cachedId;
  return list[0]?.id ?? DEFAULT_VEHICLE.id;
}

/** フォールバックなどで保存値と実際の選択がずれたときだけ、実際の選択を保存し直すべきか */
export function shouldPersistSelection(effectiveId: string, storedId: string | null): boolean {
  return effectiveId !== storedId;
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

  // ログアウト・ユーザー切り替え時に前のユーザーのキャッシュと障害フラグを消す
  // （SupabaseStatusBanner からも呼ばれる。処理は冪等）
  useEffect(() => {
    if (!isLoaded) return;
    syncCacheOwner(isSignedIn ? userId ?? null : null);
  }, [isLoaded, isSignedIn, userId]);

  const selectedKey = selectedVehicleStorageKey(isSignedIn ? userId : null);

  const setSelectedVehicleId = useCallback((id: string) => {
    setSelectedVehicleIdState(id);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(selectedKey, id);
      } catch (e) {
        console.error("選択車両の保存失敗:", e);
      }
    }
  }, [selectedKey]);

  const loadVehicles = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);

    const cachedSelectedId = typeof window !== "undefined" ? localStorage.getItem(selectedKey) : null;
    // 保存値が一覧に無くフォールバックした場合は、実際の選択を保存し直す（古い ID を残さない）
    const applySelection = (list: Vehicle[]) => {
      const effective = pickSelected(list, cachedSelectedId);
      setSelectedVehicleIdState(effective);
      if (typeof window !== "undefined" && shouldPersistSelection(effective, cachedSelectedId)) {
        try {
          localStorage.setItem(selectedKey, effective);
        } catch (e) {
          console.error("選択車両の保存失敗:", e);
        }
      }
    };

    if (!isSignedIn) {
      cacheOwnerRef.current = null;
      try {
        const localSaved = typeof window !== "undefined" ? localStorage.getItem(LOCAL_VEHICLES_KEY) : null;
        if (fetchId !== fetchCounter.current) return;
        const parsed = parseLocalVehicles(localSaved);
        const loadedVehicles = parsed.length > 0 ? parsed : [DEFAULT_VEHICLE];
        setVehicles(loadedVehicles);
        applySelection(loadedVehicles);
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
        // 障害以外（RLS 等）の移行失敗。ローカルデータは復元済みで次回再試行される。
        // アップロードされていないことが利用者に伝わるよう error に表示する
        // （認証トークン欠落は直後の読み込みでも失敗し、再ログイン案内が表示される）。
        if (!isAuthTokenError(e) && fetchId === fetchCounter.current) setError(migrationErrorMessage(e));
      }

      if (fetchId !== fetchCounter.current) return;

      // クラウドから車両一覧を取得（1 台もなければ既定車両を自動生成）
      // 0004 適用前の DB でも新しい列は既定値で補う
      const fetchedVehicles = (await ensureDefaultVehicle(supabase, userId)).map(v => normalizeVehicle(v));
      if (fetchId !== fetchCounter.current) return;

      clearOutage();
      cacheOwnerRef.current = userId;
      setVehicles(fetchedVehicles);
      applySelection(fetchedVehicles);
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
      const list = Array.isArray(cached) ? cached.map(v => normalizeVehicle(v)) : [];
      setVehicles(list);
      if (list.length > 0) applySelection(list);
      else setSelectedVehicleIdState(DEFAULT_VEHICLE.id);
    } finally {
      if (fetchId === fetchCounter.current) {
        setLoading(false);
      }
    }
  }, [isLoaded, isSignedIn, userId, getToken, selectedKey]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadVehicles(currentFetchId);
  }, [loadVehicles]);

  const refreshVehicles = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadVehicles(currentFetchId);
  }, [loadVehicles]);

  // 障害バナーの「再試行」・自動再試行で再読み込みする
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      void refreshVehicles();
    };
    window.addEventListener(SUPABASE_RETRY_EVENT, handler);
    return () => window.removeEventListener(SUPABASE_RETRY_EVENT, handler);
  }, [refreshVehicles]);

  const requireWritable = () => {
    if (readOnly) throw readOnlyError(outage);
  };

  /**
   * 車両を追加して選択する。settings（距離の入力方式・既定の燃料種別）は省略可（トリップ / 未指定）。
   */
  const addVehicle = async (name: string, type: "car" | "bike", settings?: VehicleSettings) => {
    const extra = sanitizeVehicleSettings(settings);
    if (!isSignedIn) {
      const newVehicle: Vehicle = normalizeVehicle({
        id: `local-vehicle-${Date.now()}`,
        user_id: "local",
        name,
        type,
        ...extra,
      });
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
      .insert({ user_id: userId, name, type, ...extra })
      .select()
      .single();

    if (insertError) {
      const kind = classify(status, insertError);
      if (kind) setOutage(kind);
      throw normalizeError(insertError, status);
    }

    const added = normalizeVehicle(data as Vehicle);
    setVehicles(prev => [...prev, added]);
    setSelectedVehicleId(added.id);
    return added;
  };

  /**
   * 車両をまとめて追加する（バックアップの復元用）。選択中の車両は変更しない。
   * 戻り値は items と同じ順序の作成済み車両。
   */
  const addVehicles = async (
    items: ({ name: string; type: "car" | "bike" } & VehicleSettings)[]
  ): Promise<Vehicle[]> => {
    if (items.length === 0) return [];

    if (!isSignedIn) {
      const base = Date.now();
      const created: Vehicle[] = items.map((item, i) =>
        normalizeVehicle({
          id: `local-vehicle-${base}-${i}`,
          user_id: "local",
          name: item.name,
          type: item.type,
          ...sanitizeVehicleSettings(item),
        })
      );
      const updated = [...vehicles, ...created];
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));
        } catch (e) {
          console.error("ローカル車両の保存失敗:", e);
          throw new Error("ブラウザの保存容量が不足しているため、車両を追加できませんでした。");
        }
      }
      setVehicles(updated);
      return created;
    }

    requireWritable();
    const supabase = getSupabaseClient(userId, getToken);
    // 1 台ずつ入力順に挿入する。1 文でまとめて挿入すると created_at が同じになり、
    // 再読み込み後の並び（created_at → id 順）がバックアップの順序とずれるため。
    const created: Vehicle[] = [];
    try {
      for (const item of items) {
        const { data, error: insertError, status } = await supabase
          .from("vehicles")
          .insert({ user_id: userId, name: item.name, type: item.type, ...sanitizeVehicleSettings(item) })
          .select()
          .single();
        if (insertError) throw withStatus(insertError, status);
        created.push(normalizeVehicle(data as Vehicle));
      }
    } catch (e) {
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      // 途中まで作成できた車両は一覧に反映しておく
      if (created.length > 0) setVehicles(prev => [...prev, ...created]);
      throw normalizeError(e);
    }

    setVehicles(prev => [...prev, ...created]);
    return created;
  };

  const deleteVehicle = async (id: string) => {
    if (vehicles.length <= 1) {
      // データフック内では UI（alert/toast）を出さず、呼び出し元に判断を委ねる
      throw new Error("最低1台の車両は残す必要があります。");
    }

    // 既定車両（vehicles[0]）には未分類の記録（vehicle_id が null など）も表示されているため、
    // 確認ダイアログの文言どおり、既定車両を削除するときはそれらも一緒に削除する
    const isDefault = vehicles[0]?.id === id;

    if (!isSignedIn) {
      const updated = vehicles.filter(v => v.id !== id);
      setVehicles(updated);
      if (selectedVehicleId === id && updated.length > 0) {
        setSelectedVehicleId(updated[0].id);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(updated));

        // 関連するローカルの給油レコードも削除（既定車両なら未分類の記録も。判定は useFuelRecords の表示と同じ）
        const localRecords = localStorage.getItem(LOCAL_RECORDS_KEY);
        if (localRecords) {
          try {
            const parsedRecords: unknown = JSON.parse(localRecords);
            if (Array.isArray(parsedRecords)) {
              const filteredRecords = parsedRecords.filter((r: { vehicle_id?: unknown } | null) => {
                if (!r || typeof r !== "object") return true;
                const vid = r.vehicle_id;
                if (vid === id) return false;
                const unclassified = isUnclassifiedRecord({ vehicle_id: typeof vid === "string" ? vid : null });
                return !(isDefault && unclassified);
              });
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

      // 確認ダイアログの文言どおり、関連する給油記録を先に削除してから車両を削除する。
      // 既定車両なら、そこに表示されている未分類（vehicle_id が null）の記録も削除する。
      // id は UUID 形式を検証してからフィルタ式に埋め込む。
      const recDelete = supabase.from("fuel_records").delete().eq("user_id", userId);
      const recRes = await (isDefault && isUuid(id)
        ? recDelete.or(`vehicle_id.eq.${id},vehicle_id.is.null`)
        : recDelete.eq("vehicle_id", id));
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
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      throw normalizeError(e);
    }
  };

  /**
   * 車両の名前・種別を更新する。settings を渡すと距離の入力方式・既定の燃料種別も同じ 1 回の更新で保存する
   * （省略したキーは変更しない）。方式を切り替えても既存の記録は変更しない（表示は読み取り時に再計算される）。
   */
  const updateVehicle = async (id: string, name: string, type: "car" | "bike", settings?: VehicleSettings) => {
    const extra = sanitizeVehicleSettings(settings);
    if (!isSignedIn) {
      const updated = vehicles.map(v => (v.id === id ? normalizeVehicle({ ...v, name, type, ...extra }) : v));
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
        .update({ name, type, ...extra })
        .eq("id", id);

      if (updateError) throw withStatus(updateError, status);

      setVehicles(prev => prev.map(v => (v.id === id ? normalizeVehicle({ ...v, name, type, ...extra }) : v)));
    } catch (e) {
      const kind = classify((e as { status?: number })?.status, e);
      if (kind) setOutage(kind);
      throw normalizeError(e);
    }
  };

  return {
    vehicles,
    selectedVehicleId,
    loading,
    /** 障害以外の読み込みエラー（RLS 違反など）。障害は `outage` で通知する。 */
    error,
    /** クラウドDBの障害種別。null なら正常。 */
    outage,
    /** ログイン中かつ障害中。true のとき add/update/delete は日本語エラーを投げる。 */
    readOnly,
    setSelectedVehicleId,
    addVehicle,
    /** 車両をまとめて追加する（復元用。選択中の車両は変えない） */
    addVehicles,
    deleteVehicle,
    updateVehicle,
    refreshVehicles,
  };
}
