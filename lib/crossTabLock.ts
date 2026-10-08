/**
 * タブをまたぐ排他ロック（ユーザー単位）。
 *
 * `navigator.locks`（Web Locks API）が使える環境では `fuel_lens_migration_<userId>` を exclusive で取得する
 * （タブが閉じれば自動解放。取得待ちは約 30 秒で打ち切る）。使えない環境では localStorage のリース
 * `fuel_lens_migration_lock_<userId>`（タイムスタンプ付き・実行中は 20 秒ごとに更新・約 2 分で失効）で代替する。
 *
 * ローカル → クラウドの移行（lib/migrateLocalData.ts）と既定車両の自動作成（lib/data/cloudStore.ts の
 * ensureDefaultVehicle）が同じロックで直列化され、複数タブで同時にログインしても二重登録しない。
 * ロック名・リースのキーは移行の導入時から変えていない（古いタブと混在しても同じロックを取り合う）。
 */

const LEASE_TTL_MS = 2 * 60 * 1000;
const LEASE_REFRESH_MS = 20 * 1000;
const LEASE_POLL_MS = 250;
/** Web Locks の取得待ちの上限。別タブがロックを持ったまま固まっても無限に待たない */
const LOCK_WAIT_TIMEOUT_MS = 30 * 1000;

const lockName = (userId: string) => `fuel_lens_migration_${userId}`;
const leaseKey = (userId: string) => `fuel_lens_migration_lock_${userId}`;

/** クロスタブロックを取得できなかったときのエラー（メッセージは日本語でそのまま画面に出してよい） */
export class CrossTabLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossTabLockError";
  }
}

type Lease = { ts: number; token: string };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readLease(key: string): Lease | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const { ts, token } = parsed as { ts?: unknown; token?: unknown };
    if (typeof ts !== "number" || typeof token !== "string") return null;
    return { ts, token };
  } catch {
    return null;
  }
}

function leaseIsStale(lease: Lease | null): boolean {
  return !lease || Date.now() - lease.ts > LEASE_TTL_MS;
}

/**
 * Web Locks が使えない環境向けのリース方式ロック。
 * リースが無い／約 2 分より古い場合にだけ取得でき、実行中は定期的に更新する。
 */
async function withLease<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const giveUpAt = Date.now() + LEASE_TTL_MS + 10_000;

  for (;;) {
    if (leaseIsStale(readLease(key))) {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), token } satisfies Lease));
      // 同時に書き込んだ別タブに負けていないか確認する
      await sleep(30);
      if (readLease(key)?.token === token) break;
      continue;
    }
    if (Date.now() > giveUpAt) {
      throw new CrossTabLockError("他のタブでデータ移行が実行中のため、処理を開始できませんでした。しばらくしてから再読み込みしてください。");
    }
    await sleep(LEASE_POLL_MS);
  }

  const timer = setInterval(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), token } satisfies Lease));
    } catch {
      // ベストエフォート
    }
  }, LEASE_REFRESH_MS);

  try {
    return await fn();
  } finally {
    clearInterval(timer);
    try {
      if (readLease(key)?.token === token) localStorage.removeItem(key);
    } catch {
      // ベストエフォート
    }
  }
}

/**
 * userId 単位のクロスタブ排他ロックの下で fn を実行する。
 * Web Locks API があればそれを使い（タブ終了で自動解放）、無ければリース方式にフォールバックする。
 * Web Locks の取得待ちは約 30 秒で打ち切り、CrossTabLockError を投げる（取得後の fn の実行時間は制限しない）。
 */
export function withCrossTabLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks && typeof navigator.locks.request === "function") {
    // ロックはコールバックの Promise が解決するまで保持される（タブが閉じられれば自動解放）
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOCK_WAIT_TIMEOUT_MS);
      navigator.locks
        .request(lockName(userId), { mode: "exclusive", signal: controller.signal }, async () => {
          clearTimeout(timer);
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
          }
        })
        .catch((e: unknown) => {
          clearTimeout(timer);
          // fn の例外はコールバック内で処理済みなので、ここに来るのはロック取得自体の失敗だけ
          reject(
            controller.signal.aborted
              ? new CrossTabLockError("他のタブの処理が完了しないため移行を中断しました。再読み込みしてください。")
              : e
          );
        });
    });
  }
  return withLease(leaseKey(userId), fn);
}
