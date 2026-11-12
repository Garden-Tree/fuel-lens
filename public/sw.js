/*
 * FuelLens Service Worker
 *
 * 役割は Web Share Target（manifest の share_target）の受け取りと、給油のお知らせ（Web Push）の表示だけ。
 * - ギャラリー等から共有された画像（POST /share の multipart/form-data）をここで横取りし、
 *   サーバーへは送らずに IndexedDB（DB "fuel-lens-share" / ストア "inbox" / キー "pending"）へ
 *   { blob, name, type, at, token } として一時保存し、/app?action=shared&t=<token> へリダイレクトする。
 *   画面側（lib/shareInbox.ts）は token が一致し 10 分以内のものだけ取り出して削除し、確認後にスキャンへ流す。
 * - 画像が無い・保存に失敗した場合は古い保留画像を消してから /app?action=share-unavailable へ遷移する
 *   （前回の共有画像が誤って読み込まれないようにする）。
 * - キャッシュは一切しない（precache なし、Cache Storage も使わない）。オフライン動作も提供しない。
 *   /share への POST 以外のリクエストには respondWith を呼ばず、ブラウザ既定のネットワーク処理に任せる。
 * - push: サーバー（/api/push/reminders。本文は lib/push/reminder.ts の ReminderPayload）から届いた JSON を通知として出す。
 *   読めない・欠けている値は既定の文言で補う（userVisibleOnly のため、届いたら必ず通知を出す）。
 * - notificationclick: 通知を閉じ、同じオリジンの URL（既定 /app?action=scan）を開く。開いているタブがあればそれを前面に出して移動する。
 *   別オリジンの URL は開かない。
 *
 * DB 名・ストア名・キーは lib/shareInbox.ts と揃えること。
 */

const DB_NAME = "fuel-lens-share";
const STORE_NAME = "inbox";
const PENDING_KEY = "pending";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePending(file, token) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(
        { blob: file, name: file.name, type: file.type, at: Date.now(), token },
        PENDING_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function deletePending() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function redirectToApp(query) {
  return Response.redirect(new URL("/app?" + query, self.location.origin).href, 303);
}

async function handleShare(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    if (file && typeof file !== "string" && file.size > 0) {
      // ワンタイムトークン。リダイレクト先の URL と IndexedDB の両方に置き、一致したときだけ画面側が取り出す
      const token = crypto.randomUUID();
      await savePending(file, token);
      return redirectToApp("action=shared&t=" + encodeURIComponent(token));
    }
  } catch (err) {
    // 保存に失敗しても画面へは遷移させる（画面側で「受け取れませんでした」と案内する）
    console.error("[sw] 共有された画像の保存に失敗しました", err);
  }
  // 画像が無い・失敗した: 前回の保留画像が残っていれば消す（古い画像を読み込ませない）
  try {
    await deletePending();
  } catch (err) {
    console.error("[sw] 保留中の共有画像の削除に失敗しました", err);
  }
  return redirectToApp("action=share-unavailable");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "POST") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== "/share") return;
  event.respondWith(handleShare(request));
});

// --- 給油のお知らせ（Web Push）---------------------------------------------
// 文言・URL・タグの既定は lib/push/reminder.ts と揃えること

const REMINDER_DEFAULT_TITLE = "給油のお知らせ";
const REMINDER_DEFAULT_BODY = "給油したらレシートとメーターを撮っておきましょう";
const REMINDER_DEFAULT_URL = "/app?action=scan";
const REMINDER_DEFAULT_TAG = "fuel-lens-refuel-reminder";
const REMINDER_ICON = "/icons/icon-192.png";

function readPushPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === "object") return data;
  } catch (err) {
    console.error("[sw] お知らせの内容を読めませんでした", err);
  }
  return {};
}

/** 同じオリジンの URL だけを許す（それ以外・不正な値は既定の URL） */
function safeAppUrl(url) {
  try {
    const parsed = new URL(typeof url === "string" ? url : REMINDER_DEFAULT_URL, self.location.origin);
    if (parsed.origin === self.location.origin) return parsed.href;
  } catch {
    // 既定へ
  }
  return new URL(REMINDER_DEFAULT_URL, self.location.origin).href;
}

self.addEventListener("push", (event) => {
  const data = readPushPayload(event);
  const title = typeof data.title === "string" && data.title ? data.title : REMINDER_DEFAULT_TITLE;
  const body = typeof data.body === "string" && data.body ? data.body : REMINDER_DEFAULT_BODY;
  const tag = typeof data.tag === "string" && data.tag ? data.tag : REMINDER_DEFAULT_TAG;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: REMINDER_ICON,
      badge: REMINDER_ICON,
      data: { url: safeAppUrl(data.url) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeAppUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          const focused = await client.focus();
          if (focused && "navigate" in focused) {
            await focused.navigate(url);
            return;
          }
        } catch (err) {
          console.error("[sw] 開いている画面へ移動できませんでした", err);
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
