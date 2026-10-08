import { clearOutage } from "./outage";

/** per-user キャッシュの読み書き（障害時の閲覧専用表示に使用） */
export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 容量超過等は無視（キャッシュはベストエフォート）
  }
}

/** 車両一覧のキャッシュキー（useVehicles のストアに被せた withCache が書く。lib/data/withOutage.ts） */
export function vehiclesCacheKey(userId: string): string {
  return `fuel_lens_cache_vehicles_${userId}`;
}

/** userId の記録キャッシュのキーの接頭辞（clearUserCaches が前方一致で消す） */
function recordsCachePrefix(userId: string): string {
  return `fuel_lens_cache_records_${userId}_`;
}

/** 車両ごとの記録一覧のキャッシュキー（useFuelRecords のストアに被せた withCache が書く）。vehicleId が null なら "all" */
export function recordsCacheKey(userId: string, vehicleId: string | null): string {
  return `${recordsCachePrefix(userId)}${vehicleId ?? "all"}`;
}

/**
 * userId のキャッシュ（vehiclesCacheKey と recordsCacheKey のすべて）を削除する。
 * ログアウト・ユーザー切り替え時に、前のユーザーのデータを端末に残さないために使う。
 */
export function clearUserCaches(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    const vehiclesKey = vehiclesCacheKey(userId);
    const recordsPrefix = recordsCachePrefix(userId);
    const targets: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === vehiclesKey || key.startsWith(recordsPrefix))) targets.push(key);
    }
    for (const key of targets) localStorage.removeItem(key);
  } catch {
    // ベストエフォート
  }
}

/** 最後にキャッシュを書いたログインユーザー（リロードをまたいでもログアウトを検知するため永続化する） */
const CACHE_OWNER_KEY = "fuel_lens_cache_owner";

/**
 * 現在のログインユーザー（未ログインなら null）を記録し、前回と異なれば
 * 前のユーザーのキャッシュと障害フラグを消す（ログアウト・ユーザー切り替え時のクリーンアップ）。
 */
export function syncCacheOwner(currentUserId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const previous = localStorage.getItem(CACHE_OWNER_KEY);
    if (previous && previous !== currentUserId) {
      clearUserCaches(previous);
      clearOutage();
    }
    if (currentUserId) localStorage.setItem(CACHE_OWNER_KEY, currentUserId);
    else localStorage.removeItem(CACHE_OWNER_KEY);
  } catch {
    // ベストエフォート
  }
}
