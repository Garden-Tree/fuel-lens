"use client";

import { useSyncExternalStore } from "react";

/**
 * Supabase の障害検知。
 *
 * Supabase Free プランのプロジェクトは 7 日間アイドルで PAUSED になり、
 * ゲートウェイが HTTP 540 を返す（ブラウザからは CORS/ネットワーク失敗として
 * status 0 に見えることもある）。このモジュールで失敗を分類し、
 * アプリ全体に「閲覧専用モード」を通知する。
 */

export type SupabaseOutage = "paused" | "unreachable";

export const SUPABASE_OUTAGE_EVENT = "supabase_outage";
const OUTAGE_STORAGE_KEY = "fuel_lens_supabase_outage";

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  if (typeof error === "string") return { message: error };
  return {};
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const e = asErrorLike(error);
  const message = typeof e.message === "string" ? e.message : "";
  // postgrest-js は fetch 例外を { message: "TypeError: Failed to fetch", code: "" } に包む
  if (/TypeError|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ENOTFOUND|network/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * Supabase 呼び出しの失敗を分類する。
 *
 * @param status  PostgREST 応答の HTTP ステータス（fetch 自体が失敗した場合は 0 / undefined）
 * @param error   PostgrestError または投げられた例外
 * @returns 'paused' | 'unreachable' | null（null = 障害ではなく通常のアプリエラー: RLS 違反・バリデーション等）
 */
export function classifySupabaseFailure(
  status: number | null | undefined,
  error: unknown
): SupabaseOutage | null {
  const e = asErrorLike(error);
  const message = typeof e.message === "string" ? e.message : "";
  const effectiveStatus =
    typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;

  if (effectiveStatus === 540 || /paused/i.test(message)) return "paused";
  if (effectiveStatus === 0) return "unreachable";
  if (typeof effectiveStatus === "number" && effectiveStatus >= 500) return "unreachable";
  if (effectiveStatus == null && isNetworkFailure(error)) return "unreachable";
  return null;
}

function dispatchOutage(kind: SupabaseOutage | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SupabaseOutage | null>(SUPABASE_OUTAGE_EVENT, { detail: kind }));
}

/** 現在記録されている障害種別を返す（なければ null） */
export function getOutage(): SupabaseOutage | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(OUTAGE_STORAGE_KEY);
    return v === "paused" || v === "unreachable" ? v : null;
  } catch {
    return null;
  }
}

/** 障害を記録し、window の 'supabase_outage' イベントで全コンポーネントに通知する */
export function setOutage(kind: SupabaseOutage): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(OUTAGE_STORAGE_KEY, kind);
  } catch {
    // sessionStorage が使えない環境ではイベント通知のみ
  }
  dispatchOutage(kind);
}

/** 障害状態を解除する（Supabase への呼び出しが成功したときに呼ぶ） */
export function clearOutage(): void {
  if (typeof window === "undefined") return;
  let hadOutage = false;
  try {
    hadOutage = sessionStorage.getItem(OUTAGE_STORAGE_KEY) != null;
    sessionStorage.removeItem(OUTAGE_STORAGE_KEY);
  } catch {
    hadOutage = true;
  }
  if (hadOutage) dispatchOutage(null);
}

/**
 * 失敗を分類し、障害であれば記録・通知する。戻り値は分類結果。
 * 呼び出し側は null 以外のときに「キャッシュ表示・閲覧専用」へ切り替える。
 */
export function reportSupabaseFailure(status: number | null | undefined, error: unknown): SupabaseOutage | null {
  const kind = classifySupabaseFailure(status, error);
  if (kind) setOutage(kind);
  return kind;
}

// ------------------------------------------------------------------
// 障害からの復旧（再試行）
// ------------------------------------------------------------------

/** useVehicles / useFuelRecords に再読み込みを依頼する window イベント */
export const SUPABASE_RETRY_EVENT = "fuel_lens_retry";
/** online / visibilitychange による自動再試行の最小間隔 */
const AUTO_RETRY_MIN_INTERVAL_MS = 30 * 1000;
let lastAutoRetryAt = 0;

/** クラウドデータの再読み込みを依頼する（バナーの「再試行」ボタン・自動再試行から呼ぶ） */
export function requestSupabaseRetry(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPABASE_RETRY_EVENT));
}

/**
 * 障害中、ネットワーク復帰（online）とタブの再表示（visibilitychange → visible）で
 * 自動的に再試行する。間隔は 30 秒に 1 回まで。戻り値は購読解除関数。
 */
export function subscribeOutageAutoRetry(): () => void {
  if (typeof window === "undefined") return () => {};
  const tryRetry = () => {
    if (!getOutage()) return;
    const now = Date.now();
    if (now - lastAutoRetryAt < AUTO_RETRY_MIN_INTERVAL_MS) return;
    lastAutoRetryAt = now;
    requestSupabaseRetry();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") tryRetry();
  };
  window.addEventListener("online", tryRetry);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("online", tryRetry);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

// ------------------------------------------------------------------
// ユーザー向けエラーメッセージ
// ------------------------------------------------------------------

export const CLOUD_LOAD_ERROR_MESSAGE = "クラウドの読み込みに失敗しました。時間をおいて再試行してください。";
export const PERMISSION_DENIED_MESSAGE = "アクセス権限がありません。ログインし直してください。";

/** PostgreSQL の権限エラー（42501: permission denied / RLS 違反）か */
export function isPermissionDeniedError(error: unknown): boolean {
  return asErrorLike(error).code === "42501";
}

/**
 * メッセージが日本語でそのまま画面に出せるアプリ側のエラー名
 * （SupabaseAuthTokenError / CrossTabLockError / readOnlyError）。
 * 名前で判定するのは、このモジュールを supabaseClient / migrateLocalData に依存させないため。
 */
const USER_FACING_ERROR_NAMES = new Set(["SupabaseAuthTokenError", "CrossTabLockError", "ReadOnlyError"]);

/**
 * 書き込み（追加・更新・削除）の失敗を、画面にそのまま出せる日本語メッセージの Error に変換する。
 * 生のエラーはここで console.error に出す（呼び出し側では出さない）。障害の記録（setOutage）は呼び出し側で行う。
 * 戻り値には元の HTTP ステータス（status）と元のエラー（cause）を付ける。
 */
export function toUserFacingWriteError(error: unknown, status?: number): Error {
  if (error instanceof Error && USER_FACING_ERROR_NAMES.has(error.name)) return error;

  console.error("クラウドへの書き込みに失敗しました:", error);
  const e = asErrorLike(error);
  const effectiveStatus = typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;

  let message: string;
  if (e.code === "42501") message = PERMISSION_DENIED_MESSAGE;
  else if (e.code === "23505") message = "同じ記録が既に存在します";
  else if (e.code === "23503") message = "関連する車両が見つかりません。画面を再読み込みしてください";
  else if (classifySupabaseFailure(effectiveStatus, error)) message = "クラウドに接続できません。時間をおいて再試行してください。";
  else message = "保存に失敗しました。時間をおいて再試行してください。";

  const out = new Error(message, { cause: error }) as Error & { status?: number };
  if (typeof effectiveStatus === "number") out.status = effectiveStatus;
  return out;
}

/** 障害中にユーザーへ提示する日本語メッセージ */
export function outageMessage(kind: SupabaseOutage): string {
  return kind === "paused"
    ? "クラウドDBが一時停止中です。管理者が再開するまで、最後に同期したデータを閲覧専用で表示しています。"
    : "クラウドDBに接続できません。最後に同期したデータを閲覧専用で表示しています。";
}

/** 閲覧専用モードで書き込み操作が呼ばれたときに投げるエラーを生成する */
export function readOnlyError(kind: SupabaseOutage | null): Error {
  const error = new Error(
    kind === "paused"
      ? "クラウドDBが一時停止中のため、現在は閲覧専用です。再開後にもう一度お試しください。"
      : "クラウドDBに接続できないため、現在は閲覧専用です。接続が回復してからもう一度お試しください。"
  );
  error.name = "ReadOnlyError";
  return error;
}

function subscribeOutage(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SUPABASE_OUTAGE_EVENT, onChange);
  return () => window.removeEventListener(SUPABASE_OUTAGE_EVENT, onChange);
}

const getServerOutage = (): SupabaseOutage | null => null;

/** 障害状態を購読する React フック（SSR 時は常に null） */
export function useSupabaseOutage(): SupabaseOutage | null {
  return useSyncExternalStore(subscribeOutage, getOutage, getServerOutage);
}

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

/** 車両一覧のキャッシュキー（useVehicles が書く） */
export function vehiclesCacheKey(userId: string): string {
  return `fuel_lens_cache_vehicles_${userId}`;
}

/** userId の記録キャッシュのキーの接頭辞（clearUserCaches が前方一致で消す） */
function recordsCachePrefix(userId: string): string {
  return `fuel_lens_cache_records_${userId}_`;
}

/** 車両ごとの記録一覧のキャッシュキー（useFuelRecords が書く）。vehicleId が null なら "all" */
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
