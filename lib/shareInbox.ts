/**
 * Web Share Target の受け取り箱（クライアント側）。
 *
 * `public/sw.js` が POST /share を横取りし、共有された画像を IndexedDB に一時保存してから
 * `/app?action=shared&t=<token>` へリダイレクトする。ここではそれを取り出して削除する。
 * SW が有効なら画像はサーバーへ送られず、端末内（IndexedDB）にだけ一時的に置かれる。
 * 取り出すのはトークンが一致し、保存から {@link SHARE_TTL_MS} 以内のものだけ（古い・別の共有の画像は削除して捨てる）。
 *
 * DB 名・ストア名・キーは public/sw.js と揃えること。
 */

const DB_NAME = "fuel-lens-share";
const STORE_NAME = "inbox";
const PENDING_KEY = "pending";

/** 共有画像の有効期限。これより古い保留画像は使わずに削除する */
export const SHARE_TTL_MS = 10 * 60 * 1000;

interface PendingShare {
  blob: Blob;
  name?: string;
  type?: string;
  at?: number;
  token?: string;
}

function openDb(): Promise<IDBDatabase> {
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

function isPendingShare(value: unknown): value is PendingShare {
  return typeof value === "object" && value !== null && (value as PendingShare).blob instanceof Blob;
}

/**
 * 取り出してよい保留画像か。`token` を渡したときはそれと一致すること、
 * 保存時刻 `at` があり、現在から {@link SHARE_TTL_MS} 以内であること。
 */
export function isUsablePendingShare(
  value: { at?: unknown; token?: unknown },
  token: string | undefined,
  now: number = Date.now()
): boolean {
  if (token !== undefined && value.token !== token) return false;
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return false;
  return now - value.at < SHARE_TTL_MS;
}

/**
 * 保留中の共有画像を取り出して削除する。
 * `token` を渡したときは一致するものだけ返す。無い・不一致・期限切れ・読めない場合は null（保留画像は常に削除する）。
 * エラーは握りつぶして console にだけ出す。
 */
export async function takeSharedImage(token?: string): Promise<File | null> {
  if (typeof indexedDB === "undefined") return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const conn = db;
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      let result: unknown = undefined;
      const getReq = store.get(PENDING_KEY);
      getReq.onsuccess = () => {
        result = getReq.result;
        store.delete(PENDING_KEY);
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (!isPendingShare(value)) return null;
    if (!isUsablePendingShare(value, token)) return null;
    const type = value.type || value.blob.type;
    const name = value.name || "shared-image";
    return new File([value.blob], name, { type });
  } catch (err) {
    console.error("共有された画像の読み込みに失敗しました", err);
    return null;
  } finally {
    db?.close();
  }
}

/** 保留中の共有画像を破棄する。エラーは握りつぶして console にだけ出す。 */
export async function clearSharedImage(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const conn = db;
    await new Promise<void>((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(PENDING_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch (err) {
    console.error("共有された画像の削除に失敗しました", err);
  } finally {
    db?.close();
  }
}
