"use client";

import { useSyncExternalStore } from "react";
import { classifySupabaseFailure, type SupabaseOutage } from "./errors";

/** 障害状態の記録（sessionStorage）・通知（window イベント）・購読フック。 */

export const SUPABASE_OUTAGE_EVENT = "supabase_outage";
const OUTAGE_STORAGE_KEY = "fuel_lens_supabase_outage";

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
