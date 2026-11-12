/**
 * 給油のお知らせ（Web Push）がこの環境で使えるかの判定。純粋関数（ブラウザの値は呼び出し側が渡す）。
 * 使えないときは、設定画面でスイッチを無効にして reason（日本語）を出す。
 */

import { isIosDevice } from "@/lib/iosViewport";

export type PushEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** 'serviceWorker' in navigator */
  hasServiceWorker: boolean;
  /** 'PushManager' in window */
  hasPushManager: boolean;
  /** 'Notification' in window */
  hasNotification: boolean;
  /** ホーム画面から開いている（display-mode: standalone / navigator.standalone） */
  standalone: boolean;
  /** Notification.permission（hasNotification が false なら null） */
  permission: NotificationPermission | null;
};

export type PushSupport = { ok: true } | { ok: false; reason: string };

/** iOS の案内（設定画面に常に出す） */
export const IOS_PUSH_NOTE = "iPhone・iPad では、ホーム画面に追加したアプリ（iOS 16.4 以上）でだけ使えます。";

export const IOS_NOT_STANDALONE_REASON =
  "iPhone・iPad では、Safari の共有ボタン →「ホーム画面に追加」で追加したアプリから開くと使えます（iOS 16.4 以上）。";
export const IOS_TOO_OLD_REASON = "iOS 16.4 以上に更新すると使えます。";
export const UNSUPPORTED_REASON = "このブラウザは通知に対応していません。";
export const DENIED_REASON = "通知がブロックされています。端末（ブラウザ）の設定で FuelLens の通知を許可してから、もう一度お試しください。";

export function detectPushSupport(env: PushEnv): PushSupport {
  const ios = isIosDevice(env.userAgent, env.platform, env.maxTouchPoints);
  const apisReady = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (ios) {
    // iOS は 16.4 以上のホーム画面の PWA でだけ PushManager が使える。Safari のタブではまず追加を案内する
    if (!env.standalone) return { ok: false, reason: IOS_NOT_STANDALONE_REASON };
    if (!apisReady) return { ok: false, reason: IOS_TOO_OLD_REASON };
  } else if (!apisReady) {
    return { ok: false, reason: UNSUPPORTED_REASON };
  }
  if (env.permission === "denied") return { ok: false, reason: DENIED_REASON };
  return { ok: true };
}

/** VAPID の公開鍵（base64url）を pushManager.subscribe の applicationServerKey にする */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
