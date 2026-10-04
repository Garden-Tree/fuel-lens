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

/** 障害中にユーザーへ提示する日本語メッセージ */
export function outageMessage(kind: SupabaseOutage): string {
  return kind === "paused"
    ? "クラウドDBが一時停止中です。管理者が再開するまで、最後に同期したデータを閲覧専用で表示しています。"
    : "クラウドDBに接続できません。最後に同期したデータを閲覧専用で表示しています。";
}

/** 閲覧専用モードで書き込み操作が呼ばれたときに投げるエラーを生成する */
export function readOnlyError(kind: SupabaseOutage | null): Error {
  return new Error(
    kind === "paused"
      ? "クラウドDBが一時停止中のため、現在は閲覧専用です。再開後にもう一度お試しください。"
      : "クラウドDBに接続できないため、現在は閲覧専用です。接続が回復してからもう一度お試しください。"
  );
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
