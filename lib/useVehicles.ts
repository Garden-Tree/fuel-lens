import { useState, useEffect, useCallback, useRef } from "react";
import { notifyRecordsChanged, useWindowEvent } from "./events";
import { SUPABASE_RETRY_EVENT, syncCacheOwner, useSupabaseOutage } from "./supabaseHealth";
import { normalizeVehicle } from "./fillChain";
import { pickSelected, selectedVehicleStorageKey, shouldPersistSelection } from "./vehicleSelection";
import { applyVehiclePatch, sanitizeVehicleSettings } from "./data/columns";
import { LOCAL_DEFAULT_VEHICLE, removeVehicleWithRecords } from "./data/localStore";
import { DataError } from "./data/types";
import { loadErrorMessage, requireStores, useDataStores } from "./data/useDataStores";
import type { Vehicle, VehicleSettings, VehicleType } from "./types";

/** @deprecated lib/types.ts から import する（互換のための再エクスポート） */
export type { Vehicle, VehicleSettings } from "./types";
/** @deprecated lib/data/columns.ts から import する（互換のための再エクスポート） */
export { sanitizeVehicleSettings } from "./data/columns";

const DEFAULT_VEHICLE = LOCAL_DEFAULT_VEHICLE;

function readSelectedId(key: string): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(key) : null;
}

function persistSelectedId(key: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, id);
  } catch (e) {
    console.error("選択車両の保存失敗:", e);
  }
}

/**
 * 車両一覧と選択中の車両、その追加・更新・削除。
 * 保存先（localStorage / Supabase）の違いは lib/data/ のストアが吸収し、このフックは状態・選択・通知だけを持つ。
 */
export function useVehicles() {
  const { isLoaded, isSignedIn, userId, stores } = useDataStores();
  const [vehicles, setVehicles] = useState<Vehicle[]>([DEFAULT_VEHICLE]);
  // localStorage は SSR と初回描画で一致させるため、初期化子では読まず loadVehicles 内で読む
  const [selectedVehicleId, setSelectedVehicleIdState] = useState<string>(DEFAULT_VEHICLE.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const outage = useSupabaseOutage();
  const fetchCounter = useRef(0);
  // 「再試行」イベントの再読み込みだけ、クラウドの初期化の失敗メモ（30 秒）を飛ばす
  const forceBootstrap = useRef(false);

  const readOnly = isSignedIn && outage != null;

  // ログアウト・ユーザー切り替え時に前のユーザーのキャッシュと障害フラグを消す
  // （SupabaseStatusBanner からも呼ばれる。処理は冪等）
  useEffect(() => {
    if (!isLoaded) return;
    syncCacheOwner(isSignedIn ? userId : null);
  }, [isLoaded, isSignedIn, userId]);

  const selectedKey = selectedVehicleStorageKey(isSignedIn ? userId : null);

  const setSelectedVehicleId = useCallback((id: string) => {
    setSelectedVehicleIdState(id);
    persistSelectedId(selectedKey, id);
  }, [selectedKey]);

  const loadVehicles = useCallback(async (fetchId: number) => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    const isCurrent = () => fetchId === fetchCounter.current;
    const force = forceBootstrap.current;
    forceBootstrap.current = false;

    const cachedSelectedId = readSelectedId(selectedKey);
    // 保存値が一覧に無くフォールバックした場合は、実際の選択を保存し直す（古い ID を残さない）
    const applySelection = (list: Vehicle[]) => {
      const effective = pickSelected(list, cachedSelectedId, DEFAULT_VEHICLE.id);
      setSelectedVehicleIdState(effective);
      if (shouldPersistSelection(effective, cachedSelectedId)) persistSelectedId(selectedKey, effective);
    };

    if (!stores) return;

    if (stores.kind === "local") {
      try {
        const list = await stores.vehicles.list();
        if (!isCurrent()) return;
        setVehicles(list);
        applySelection(list);
      } finally {
        if (isCurrent()) setLoading(false);
      }
      return;
    }

    try {
      // ローカルデータの移行と既定車両の確保（タブ内で 1 回。useFuelRecords と共有）
      const { migrationError } = await stores.bootstrap({ force });
      if (!isCurrent()) return;
      // 障害以外の移行失敗。ローカルデータは復元済みで次回再試行される。
      // アップロードされていないことが利用者に伝わるよう error に表示する
      if (migrationError) setError(migrationError);

      // 車両一覧を取得（初期化で取得済みならそれを使い回して再取得しない。1 台もなければ既定車両を自動生成済み。新しい列は既定値で補完済み）
      const list = await stores.vehicles.list();
      if (!isCurrent()) return;
      setVehicles(list);
      applySelection(list);
    } catch (e) {
      if (!isCurrent()) return;
      const message = loadErrorMessage(e);
      if (message) setError(message);

      // ログイン中は DEFAULT_VEHICLE へフォールバックしない（vehicle_id=null の保存を防ぐ）。
      // 最後に同期した一覧があればそれを閲覧専用で表示する（キャッシュは上書きしない）。
      const list = (stores.vehicles.cached() ?? []).map(v => normalizeVehicle(v));
      setVehicles(list);
      if (list.length > 0) applySelection(list);
      else setSelectedVehicleIdState(DEFAULT_VEHICLE.id);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [isLoaded, stores, selectedKey]);

  useEffect(() => {
    const currentFetchId = ++fetchCounter.current;
    loadVehicles(currentFetchId);
  }, [loadVehicles]);

  const refreshVehicles = useCallback(() => {
    const currentFetchId = ++fetchCounter.current;
    return loadVehicles(currentFetchId);
  }, [loadVehicles]);

  // 障害バナーの「再試行」・自動再試行で再読み込みする
  useWindowEvent(SUPABASE_RETRY_EVENT, () => {
    forceBootstrap.current = true;
    void refreshVehicles();
  });

  /**
   * 車両を追加して選択する。settings（距離の入力方式・既定の燃料種別）は省略可（トリップ / 未指定）。
   * 未ログイン時は先に保存し、容量超過なら日本語の Error を投げて画面の一覧は変えない。
   */
  const addVehicle = async (name: string, type: VehicleType, settings?: VehicleSettings) => {
    const added = await requireStores(stores).vehicles.add({ ...sanitizeVehicleSettings(settings), name, type });
    setVehicles(prev => [...prev, added]);
    setSelectedVehicleId(added.id);
    return added;
  };

  /**
   * 車両をまとめて追加する（バックアップの復元用）。選択中の車両は変更しない。
   * 戻り値は items と同じ順序の作成済み車両。途中で失敗しても作成済みの車両は一覧に反映する。
   */
  const addVehicles = async (
    items: ({ name: string; type: VehicleType } & VehicleSettings)[]
  ): Promise<Vehicle[]> => {
    if (items.length === 0) return [];
    try {
      const created = await requireStores(stores).vehicles.addMany(items);
      setVehicles(prev => [...prev, ...created]);
      return created;
    } catch (e) {
      const created = e instanceof DataError ? (e.created as readonly Vehicle[]) : [];
      if (created.length > 0) setVehicles(prev => [...prev, ...created]);
      throw e;
    }
  };

  /**
   * 車両を削除する。確認ダイアログの文言どおり、関連する給油記録も削除する
   * （ログイン中は記録 → 車両の順。未ログインは車両の一覧を先に書き、容量超過なら何も変えない）。
   * 既定車両（vehicles[0]）には未分類の記録（vehicle_id が null など）も表示されているため、それらも一緒に削除する。
   */
  const deleteVehicle = async (id: string) => {
    if (vehicles.length <= 1) {
      // データフック内では UI（alert/toast）を出さず、呼び出し元に判断を委ねる
      throw new Error("最低1台の車両は残す必要があります。");
    }
    const isDefault = vehicles[0]?.id === id;
    const s = requireStores(stores);
    // 順序は保存先で異なる（local: 車両の一覧を先に書く / cloud: 記録を先に削除）
    await removeVehicleWithRecords(s, s.kind, id, { includeUnclassified: isDefault });

    const updated = vehicles.filter(v => v.id !== id);
    setVehicles(updated);
    if (selectedVehicleId === id && updated.length > 0) {
      setSelectedVehicleId(updated[0].id);
    }
    notifyRecordsChanged({ vehicleId: id });
  };

  /**
   * 車両の名前・種別を更新する。settings を渡すと距離の入力方式・既定の燃料種別も同じ 1 回の更新で保存する
   * （省略したキーは変更しない）。方式を切り替えても既存の記録は変更しない（表示は読み取り時に再計算される）。
   */
  const updateVehicle = async (id: string, name: string, type: VehicleType, settings?: VehicleSettings) => {
    const patch = { ...sanitizeVehicleSettings(settings), name, type };
    await requireStores(stores).vehicles.update(id, patch);
    setVehicles(prev => prev.map(v => (v.id === id ? applyVehiclePatch(v, patch) : v)));
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
