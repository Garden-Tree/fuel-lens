"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { getSupabaseClient, type GetToken } from "../supabaseClient";
import { CLOUD_LOAD_ERROR_MESSAGE } from "../supabase/errors";
import { clearOutage, getOutage, setOutage } from "../supabase/outage";
import { clearUserCaches, readCache, recordsCacheKey, vehiclesCacheKey, writeCache } from "../supabase/cache";
import { clearMigrationState } from "../migrateLocalData";
import { selectedVehicleStorageKey } from "../vehicleSelection";
import { deleteOwnData } from "./accountDeletion";
import { bootstrapCloud, forgetBootstrap, type BootstrapOptions, type CloudBootstrapResult } from "./cloudBootstrap";
import { createCloudStores, forgetUserRow } from "./cloudStore";
import { clearLocalData, createLocalStores } from "./localStore";
import { withPrimedVehicleList } from "./primedVehicles";
import { DataError, type RecordStore, type VehicleStore } from "./types";
import {
  runWithOutageHandling,
  withCache,
  withOutageHandling,
  type CachedRecordStore,
  type CacheIO,
  type CachedVehicleStore,
  type OutageHandlingOptions,
} from "./withOutage";

/** 未ログイン時のストア（localStorage。呼び出しのたびにブラウザの localStorage を読む） */
export type LocalDataStores = {
  kind: "local";
  records: RecordStore;
  vehicles: VehicleStore;
  /** この端末の記録と車両をすべて削除する（設定画面の「この端末のデータをすべて削除」。localStore.ts の clearLocalData） */
  clearAll: () => Promise<void>;
};

/** ログイン時のストア（Supabase。障害の扱い + キャッシュを被せ済み） */
export type CloudDataStores = {
  kind: "cloud";
  userId: string;
  records: CachedRecordStore;
  vehicles: CachedVehicleStore;
  /**
   * 移行と既定車両の確保（タブ内で userId ごとに 1 回）。失敗は DataError（障害なら閲覧専用に切り替わる）。
   * force: true は障害バナーの「再試行」用で、移行失敗の 30 秒の使い回しを飛ばす
   */
  bootstrap: (options?: BootstrapOptions) => Promise<CloudBootstrapResult>;
  /**
   * false の間はキャッシュを書かない。フックのアンマウント・ログアウト・ユーザー切り替えの後に届いた応答で、
   * syncCacheOwner が消した前のユーザーのキャッシュを書き戻さないようにする（useDataStores が切り替える）
   */
  setActive: (active: boolean) => void;
  /**
   * アカウント削除の 1 段目: このユーザーのクラウドのデータ（記録・車両・users 行）を削除し、残っていないことを確かめる
   * （accountDeletion.ts の deleteOwnData）。書き込みとして扱う（閲覧専用中は日本語の DataError で拒否、失敗も日本語の DataError）。
   * 成功したら、この端末に残るこのユーザーのキャッシュ・移行の途中状態・選択中の車両と、タブ内の users 行・初期化の使い回しも消す。冪等なので再試行できる
   */
  deleteAccountData: () => Promise<void>;
};

export type ActiveDataStores = LocalDataStores | CloudDataStores;

const LOCAL_STORES: LocalDataStores = {
  kind: "local",
  ...createLocalStores(),
  clearAll: async () => clearLocalData(),
};

/** 削除したアカウントについて、この端末に残る情報（キャッシュ・移行の途中状態・選択中の車両）を消す */
function forgetUserOnDevice(userId: string): void {
  clearUserCaches(userId);
  clearMigrationState(userId);
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(selectedVehicleStorageKey(userId));
  } catch {
    // ベストエフォート
  }
}

/** 障害状態は sessionStorage + window イベントで全フックと共有する（lib/supabase/outage.ts） */
const OUTAGE_OPTIONS: OutageHandlingOptions = {
  isReadOnly: getOutage,
  onFailure: setOutage,
  onRecover: clearOutage,
};

function createCloudDataStores(userId: string, getToken: GetToken): CloudDataStores {
  const supabase = getSupabaseClient(userId, getToken);
  const raw = createCloudStores(supabase, userId);
  const primed = withPrimedVehicleList(raw.vehicles);
  let active = true;
  const io: CacheIO = {
    read: key => readCache<unknown>(key),
    write: (key, value) => {
      if (active) writeCache(key, value);
    },
  };
  return {
    kind: "cloud",
    userId,
    records: withCache(withOutageHandling(raw.records, OUTAGE_OPTIONS), {
      key: scope => recordsCacheKey(userId, scope.vehicleId),
      io,
    }),
    vehicles: withCache(withOutageHandling(primed.store, OUTAGE_OPTIONS), { key: vehiclesCacheKey(userId), io }),
    bootstrap: async options => {
      // 初期化は既定車両の確保で車両一覧を取得済み。このストアの次の vehicles.list() はそれを使い回し、同じ GET を重ねて発行しない。
      // 一覧を使い回すのは 1 回だけで、bootstrap を呼ぶたびに先に捨てる（古い一覧を残さない）。
      // useFuelRecords は別のストアインスタンスで vehicles.list() を呼ばないので、そちらの一覧は次の bootstrap で置き換わるだけ
      primed.prime(null);
      const result = await runWithOutageHandling(
        () => bootstrapCloud(supabase, userId, undefined, options),
        OUTAGE_OPTIONS,
        "read"
      );
      primed.prime(result.vehicles ?? null);
      return result;
    },
    setActive: value => {
      active = value;
    },
    deleteAccountData: async () => {
      await runWithOutageHandling(() => deleteOwnData(supabase, userId), OUTAGE_OPTIONS, "write");
      // 削除の後に届いた一覧の応答で、このユーザーのキャッシュを書き戻さない
      active = false;
      forgetUserOnDevice(userId);
      // タブ内の users 行・初期化の使い回しも忘れる（部分的な失敗の後に挿入しても外部キー違反にならないように）
      forgetUserRow(userId);
      forgetBootstrap(userId);
    },
  };
}

/**
 * ログイン状態に応じたデータストアを返す（未ログイン = localStorage、ログイン = Supabase）。
 * クラウドのストアは userId・getToken ごとにメモ化する（フックのインスタンスごと）。
 * stores が null なのはログイン中なのに userId が無いとき（通常は起きない）。
 */
export function useDataStores(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  stores: ActiveDataStores | null;
} {
  const { getToken, userId, isSignedIn, isLoaded } = useAuth();
  const cloud = useMemo(
    () => (isSignedIn && userId ? createCloudDataStores(userId, getToken) : null),
    [isSignedIn, userId, getToken]
  );
  useEffect(() => {
    if (!cloud) return;
    cloud.setActive(true);
    return () => cloud.setActive(false);
  }, [cloud]);
  return {
    isLoaded: !!isLoaded,
    isSignedIn: !!isSignedIn,
    userId: userId ?? null,
    stores: isSignedIn ? cloud : LOCAL_STORES,
  };
}

/** stores が無い（ログイン中なのに userId が無い）ときに操作から投げるエラー */
export function requireStores<S extends ActiveDataStores>(stores: S | null): S {
  if (!stores) throw new Error("ログイン情報を確認できませんでした。再読み込みしてください。");
  return stores;
}

/**
 * 一覧の読み込み（初期化を含む）の失敗をフックの error に出す日本語にする。
 * 障害は outage で通知する（ストアが記録済み）ので null。DataError 以外（想定外）は console に出して汎用メッセージ。
 */
export function loadErrorMessage(e: unknown): string | null {
  if (e instanceof DataError) return e.outage ? null : e.message;
  console.error("クラウドの読み込みに失敗しました:", e);
  return CLOUD_LOAD_ERROR_MESSAGE;
}
