/*
 * FuelLens Service Worker
 *
 * 役割は Web Share Target（manifest の share_target）の受け取り、給油のお知らせ（Web Push）の表示、
 * 静的ファイル（/_next/static/）のキャッシュの 3 つ。
 * - ギャラリー等から共有された画像（POST /share の multipart/form-data）をここで横取りし、
 *   サーバーへは送らずに IndexedDB（DB "fuel-lens-share" / ストア "inbox" / キー "pending"）へ
 *   { blob, name, type, at, token } として一時保存し、/app?action=shared&t=<token> へリダイレクトする。
 *   画面側（lib/shareInbox.ts）は token が一致し 10 分以内のものだけ取り出して削除し、確認後にスキャンへ流す。
 * - 画像が無い・保存に失敗した場合は古い保留画像を消してから /app?action=share-unavailable へ遷移する
 *   （前回の共有画像が誤って読み込まれないようにする）。
 * - キャッシュするのは同じオリジンの GET /_next/static/ だけ（ファイル名に内容のハッシュが入り、中身が変わらない）。
 *   キャッシュにあればそれを返し、無ければネットワークから取って ok かつ basic の応答だけを保存する（cache-first）。
 *   HTML・RSC・/api・別オリジン（Clerk・Google Analytics など）はキャッシュしない。precache もオフライン動作も提供しない。
 *   キャッシュ名は STATIC_CACHE（版を上げると activate で古いキャッシュを消す）。デプロイをまたいで増えすぎないよう
 *   STATIC_CACHE_MAX_ENTRIES 件を超えたら古いものから消す。
 *   それ以外のリクエスト（/share への POST を除く）には respondWith を呼ばず、ブラウザ既定のネットワーク処理に任せる。
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

// 静的ファイルのキャッシュ。キャッシュの持ち方を変えたら版（-v1）を上げる。activate で同じ接頭辞の古い版を消す
const STATIC_CACHE_PREFIX = "fuel-lens-static-";
const STATIC_CACHE = STATIC_CACHE_PREFIX + "v1";
const STATIC_CACHE_MAX_ENTRIES = 150;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith(STATIC_CACHE_PREFIX) && name !== STATIC_CACHE)
            .map((name) => caches.delete(name))
        );
      } catch (err) {
        console.error("[sw] 古いキャッシュを削除できませんでした", err);
      }
      await self.clients.claim();
    })()
  );
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

// --- 静的ファイルのキャッシュ（/_next/static/）------------------------------

/** キャッシュしてよいリクエストか（同じオリジンの GET /_next/static/ だけ） */
function isCacheableStatic(request, url) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  );
}

/** 件数が上限を超えたら古いもの（keys() の先頭 = 先に入れたもの）から消す */
async function trimStaticCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - STATIC_CACHE_MAX_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(event) {
  const request = event.request;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  // ネットワークの失敗はそのまま伝える（代わりの応答は作らない）
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    // 保存と整理は応答を待たせずに行う
    event.waitUntil(
      (async () => {
        try {
          await cache.put(request, copy);
          await trimStaticCache(cache);
        } catch (err) {
          console.error("[sw] 静的ファイルをキャッシュできませんでした", err);
        }
      })()
    );
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (isCacheableStatic(request, url)) {
    event.respondWith(cacheFirst(event));
    return;
  }
  if (request.method !== "POST") return;
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
