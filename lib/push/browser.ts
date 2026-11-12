"use client";

/**
 * 給油のお知らせ（Web Push）のブラウザ側の操作。設定画面の components/PushReminderPanel.tsx だけが使う。
 * - 購読は public/sw.js（ServiceWorkerRegister が登録）の pushManager で作る
 * - 保存先は Supabase の push_subscriptions（supabase/migrations/0006_push_subscriptions.sql）。
 *   利用者自身の Clerk JWT（RLS）で、自分の行の読み取り・追加・削除だけを行う（更新はサーバーだけ）
 *
 * 失敗は日本語の PushSetupError にする（英語の生エラーは console にだけ出す）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { urlBase64ToUint8Array } from "./support";

export class PushSetupError extends Error {}

const TABLE = "push_subscriptions";
const SW_READY_TIMEOUT_MS = 4000;

export const SW_NOT_READY_MESSAGE = "通知の準備ができませんでした。ページを再読み込みしてから、もう一度お試しください。";
export const PERMISSION_NOT_GRANTED_MESSAGE = "通知が許可されませんでした。オンにするには、通知を許可してください。";
export const SUBSCRIBE_FAILED_MESSAGE = "通知の登録に失敗しました。時間をおいて、もう一度お試しください。";
export const SAVE_FAILED_MESSAGE = "お知らせの設定を保存できませんでした。時間をおいて、もう一度お試しください。";
export const UNSUBSCRIBE_FAILED_MESSAGE = "お知らせをオフにできませんでした。時間をおいて、もう一度お試しください。";

/** 登録済みの Service Worker。開発中（SW を登録しない設定）などで無ければ null */
async function getRegistration(wait: boolean): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (reg?.active || !wait) return reg ?? null;
  // 登録直後で有効化を待っている場合
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** この端末でお知らせがオンか（ブラウザの購読があり、通知が許可され、DB に有効な行がある） */
export async function readPushEnabled(supabase: SupabaseClient, userId: string): Promise<boolean> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const reg = await getRegistration(false);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return false;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("endpoint", sub.endpoint)
    .eq("enabled", true)
    .range(0, 0);
  if (error) {
    console.error("お知らせの設定を読み込めませんでした:", error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function deleteRow(supabase: SupabaseClient, userId: string, endpoint: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("endpoint", endpoint);
  if (error) throw error;
}

/**
 * お知らせをオンにする。通知の許可を求め（ユーザーの操作の中で最初に呼ぶ）、新しい購読を作って保存する。
 * 既存の購読（前にログインしていた別のアカウントの分を含む）は解除して作り直す（エンドポイントが変わり、古い行には届かなくなる）。
 */
export async function enablePush(supabase: SupabaseClient, userId: string, vapidPublicKey: string): Promise<void> {
  // iOS はユーザーの操作の直後でないと許可のダイアログを出さないので、ほかの await より先に呼ぶ
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    console.error("通知の許可を求められませんでした:", e);
    throw new PushSetupError(PERMISSION_NOT_GRANTED_MESSAGE);
  }
  if (permission !== "granted") throw new PushSetupError(PERMISSION_NOT_GRANTED_MESSAGE);

  const reg = await getRegistration(true);
  if (!reg) throw new PushSetupError(SW_NOT_READY_MESSAGE);

  let sub: PushSubscription;
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // 自分の行が残っていれば消す（他人の行は RLS で消せないが、解除でエンドポイントが無効になる）
      await deleteRow(supabase, userId, existing.endpoint).catch(e => console.error("古い購読の行を削除できませんでした:", e));
      await existing.unsubscribe();
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  } catch (e) {
    console.error("プッシュ通知の購読に失敗しました:", e);
    throw new PushSetupError(SUBSCRIBE_FAILED_MESSAGE);
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    console.error("購読に鍵がありません");
    await sub.unsubscribe().catch(() => undefined);
    throw new PushSetupError(SUBSCRIBE_FAILED_MESSAGE);
  }

  const { error } = await supabase.from(TABLE).insert({ user_id: userId, endpoint: json.endpoint, p256dh, auth });
  if (error) {
    console.error("購読の保存に失敗しました:", error);
    // 保存できなかった購読は残さない（オンに見えて届かない状態を作らない）
    await sub.unsubscribe().catch(() => undefined);
    throw new PushSetupError(SAVE_FAILED_MESSAGE);
  }
}

/**
 * お知らせをオフにする。DB の行を消し、ブラウザの購読を解除する。
 * 行を消せなくても購読の解除で以後は届かない（サーバーは 404 / 410 で行を無効にする）ので、解除まで進める。
 */
export async function disablePush(supabase: SupabaseClient, userId: string): Promise<void> {
  const reg = await getRegistration(false);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await deleteRow(supabase, userId, sub.endpoint);
  } catch (e) {
    console.error("購読の行を削除できませんでした（購読の解除は続けます）:", e);
  }
  try {
    await sub.unsubscribe();
  } catch (e) {
    console.error("プッシュ通知の購読の解除に失敗しました:", e);
    throw new PushSetupError(UNSUBSCRIBE_FAILED_MESSAGE);
  }
}
