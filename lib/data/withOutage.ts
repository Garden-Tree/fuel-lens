/**
 * クラウドのストアに被せるデコレーター（障害の扱いとキャッシュ）。
 *
 * - withOutageHandling: 失敗の分類（classifySupabaseFailure。認証トークン欠落は障害にしない）→ 障害の記録（onFailure）→
 *   日本語メッセージの DataError への変換と、閲覧専用中の書き込みガードを 1 か所で行う。list の成功で障害を解除する（onRecover）。
 * - withCache: list に成功したら一覧を per-user キャッシュへ書き、成功した書き込み（add / update / remove）も反映する。
 *   読み込みに失敗したとき、フックは cached() で最後に同期した一覧を閲覧専用で表示する。
 *
 * 障害状態の記録先（sessionStorage・window イベント）やキャッシュの保存先は引数で受け取るので、node でテストできる。
 */

import { CrossTabLockError } from "../crossTabLock";
import {
  CLOUD_LOAD_ERROR_MESSAGE,
  PERMISSION_DENIED_MESSAGE,
  classifySupabaseFailure,
  isPermissionDeniedError,
  readOnlyError,
  toUserFacingWriteError,
  type SupabaseOutage,
} from "../supabase/errors";
import { readCache, writeCache } from "../supabase/cache";
import { AUTH_TOKEN_ERROR_CODE, AUTH_TOKEN_ERROR_MESSAGE, isAuthTokenError } from "../supabaseClient";
import type { FuelRecord, Vehicle } from "../types";
import { applyRecordPatch, applyVehiclePatch } from "./columns";
import { matchesRecordScope } from "./scope";
import {
  DataError,
  PartialWriteError,
  READ_ONLY_CODE,
  type RecordScope,
  type RecordStore,
  type VehicleStore,
} from "./types";

// ------------------------------------------------------------------
// 障害の扱い
// ------------------------------------------------------------------

export type OutageHandlingOptions = {
  /** 閲覧専用なら障害種別を返す（書き込みの前に呼ぶ）。null なら書き込める */
  isReadOnly: () => SupabaseOutage | null;
  /** 障害（停止・接続不可）に分類された失敗のたびに呼ぶ（setOutage） */
  onFailure: (kind: SupabaseOutage) => void;
  /** list に成功したときに呼ぶ（clearOutage） */
  onRecover?: () => void;
};

export type DataOperation = "read" | "write";

function statusOf(e: unknown): number | undefined {
  const status = e && typeof e === "object" ? (e as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : undefined;
}

function codeOf(e: unknown): string | undefined {
  const code = e && typeof e === "object" ? (e as { code?: unknown }).code : undefined;
  return typeof code === "string" && code ? code : undefined;
}

/** 読み込みの失敗を画面に出す日本語メッセージにする（英語の生エラーは console.error のみに出す） */
function readErrorMessage(e: unknown): string {
  if (isAuthTokenError(e)) return AUTH_TOKEN_ERROR_MESSAGE;
  if (isPermissionDeniedError(e)) return PERMISSION_DENIED_MESSAGE;
  if (e instanceof CrossTabLockError) return e.message;
  return CLOUD_LOAD_ERROR_MESSAGE;
}

/**
 * 失敗を DataError に変換する。障害なら onFailure を呼ぶ。既に DataError（検証エラーなど）ならそのまま返す。
 * - read: 認証トークン欠落・権限エラー・ロック取得失敗はそれぞれの日本語メッセージ、それ以外は「クラウドの読み込みに失敗しました。…」
 * - write: 認証トークン欠落は再ログインの案内、それ以外は toUserFacingWriteError（42501 / 23505 / 23503 / 障害 / その他）
 * PartialWriteError は元の失敗（cause）で分類し、書き込み済みの件数・要素を DataError に引き継ぐ。
 */
export function toDataError(e: unknown, op: DataOperation, onFailure?: (kind: SupabaseOutage) => void): DataError {
  if (e instanceof DataError) return e;
  const partial = e instanceof PartialWriteError ? e : null;
  const raw = partial ? partial.cause : e;
  const status = statusOf(raw);
  const auth = isAuthTokenError(raw);
  const outage = auth ? null : classifySupabaseFailure(status, raw);
  if (outage) onFailure?.(outage);

  let message: string;
  let outStatus = status;
  if (op === "read") {
    console.error("クラウドの読み込みに失敗しました:", raw);
    message = readErrorMessage(raw);
  } else if (auth) {
    message = AUTH_TOKEN_ERROR_MESSAGE;
  } else {
    // 生エラーのログと日本語メッセージへの変換は toUserFacingWriteError に集約する
    const userFacing = toUserFacingWriteError(raw, status) as Error & { status?: number };
    message = userFacing.message;
    outStatus = userFacing.status ?? status;
  }
  return new DataError(message, {
    status: outStatus,
    code: auth ? AUTH_TOKEN_ERROR_CODE : codeOf(raw),
    outage,
    done: partial?.done ?? 0,
    created: partial?.created ?? [],
    cause: raw,
  });
}

/**
 * fn を障害の扱いの下で実行する。write なら先に閲覧専用を確認し、閲覧専用なら日本語の DataError（READ_ONLY_CODE）を投げる。
 * 失敗は toDataError で変換して投げる。recover なら成功時に onRecover を呼ぶ。
 * デコレーター以外（クラウドの初期化 cloudBootstrap など）もこれを通す。
 */
export async function runWithOutageHandling<T>(
  fn: () => Promise<T>,
  options: OutageHandlingOptions,
  op: DataOperation,
  { recover = false }: { recover?: boolean } = {}
): Promise<T> {
  if (op === "write") {
    const kind = options.isReadOnly();
    if (kind) throw new DataError(readOnlyError(kind).message, { code: READ_ONLY_CODE, outage: kind });
  }
  let result: T;
  try {
    result = await fn();
  } catch (e) {
    throw toDataError(e, op, options.onFailure);
  }
  if (recover) options.onRecover?.();
  return result;
}

/** 読み込みのメソッド（閲覧専用中も呼べる）。それ以外はすべて書き込み */
const READ_METHODS: ReadonlySet<string> = new Set(["list", "listAll"]);

/**
 * ストアの全メソッドを runWithOutageHandling で包む。list / listAll は読み込み（list の成功で障害を解除）、
 * それ以外は書き込み（閲覧専用中は呼ばずに日本語エラー）。
 */
export function withOutageHandling<S extends RecordStore | VehicleStore>(store: S, options: OutageHandlingOptions): S {
  const wrapped: Record<string, unknown> = {};
  for (const [name, method] of Object.entries(store)) {
    if (typeof method !== "function") {
      wrapped[name] = method;
      continue;
    }
    const op: DataOperation = READ_METHODS.has(name) ? "read" : "write";
    wrapped[name] = (...args: unknown[]) =>
      runWithOutageHandling(() => (method as (...a: unknown[]) => Promise<unknown>).apply(store, args), options, op, {
        recover: name === "list",
      });
  }
  return wrapped as S;
}

// ------------------------------------------------------------------
// キャッシュ
// ------------------------------------------------------------------

/** キャッシュの読み書き（既定は lib/supabase/cache.ts の per-user キャッシュ = localStorage） */
export type CacheIO = { read: (key: string) => unknown; write: (key: string, value: unknown) => void };

const defaultCacheIO: CacheIO = { read: key => readCache<unknown>(key), write: writeCache };

export type RecordCacheOptions = { key: (scope: RecordScope) => string; io?: CacheIO };
export type VehicleCacheOptions = { key: string; io?: CacheIO };

export type CachedRecordStore = RecordStore & {
  /** 範囲の最後に同期した一覧（無ければ null）。読み込み失敗時の閲覧専用表示に使う */
  cached(scope: RecordScope): FuelRecord[] | null;
};
export type CachedVehicleStore = VehicleStore & {
  /** 最後に同期した車両一覧（無ければ null） */
  cached(): Vehicle[] | null;
};

/**
 * 最新の list の結果（キーと範囲）を覚え、成功した書き込みをその一覧へ反映してキャッシュへ書き直す。
 * list を呼ぶたびに忘れ、その呼び出しが最新のまま成功したときだけキャッシュへ書いて覚える（古い応答で上書きしない）。
 * 失敗した読み込みの後は書き込みを反映しない（最後に同期した一覧を残す）。
 */
function createCacheTracker<T, S>(io: CacheIO) {
  let seq = 0;
  let current: { key: string; scope: S; items: T[] } | null = null;
  return {
    async list(key: string, scope: S, load: () => Promise<T[]>): Promise<T[]> {
      const mine = ++seq;
      current = null;
      const items = await load();
      // 古い応答はキャッシュも覚える一覧も更新しない（後から始まった list や、その間の書き込みの結果を壊さない）
      if (mine === seq) {
        io.write(key, items);
        current = { key, scope, items };
      }
      return items;
    },
    apply(update: (items: T[], scope: S) => T[]) {
      if (!current) return;
      current.items = update(current.items, current.scope);
      io.write(current.key, current.items);
    },
    peek(key: string): T[] | null {
      const value = io.read(key);
      return Array.isArray(value) ? (value as T[]) : null;
    },
  };
}

function withRecordCache(store: RecordStore, options: RecordCacheOptions): CachedRecordStore {
  const tracker = createCacheTracker<FuelRecord, RecordScope>(options.io ?? defaultCacheIO);
  return {
    list: scope => tracker.list(options.key(scope), scope, () => store.list(scope)),
    listAll: () => store.listAll(),
    async add(input) {
      const added = await store.add(input);
      tracker.apply((items, scope) => (matchesRecordScope(added, scope) ? [added, ...items] : items));
      return added;
    },
    addMany: (inputs, onProgress) => store.addMany(inputs, onProgress),
    async update(id, patch) {
      await store.update(id, patch);
      // 車両の移動で範囲から外れた記録は一覧から外す
      tracker.apply((items, scope) =>
        items.map(r => (r.id === id ? applyRecordPatch(r, patch) : r)).filter(r => matchesRecordScope(r, scope))
      );
    },
    async remove(id) {
      await store.remove(id);
      tracker.apply(items => items.filter(r => r.id !== id));
    },
    removeByVehicle: (vehicleId, opts) => store.removeByVehicle(vehicleId, opts),
    cached: scope => tracker.peek(options.key(scope)),
  };
}

function withVehicleCache(store: VehicleStore, options: VehicleCacheOptions): CachedVehicleStore {
  const tracker = createCacheTracker<Vehicle, null>(options.io ?? defaultCacheIO);
  return {
    list: () => tracker.list(options.key, null, () => store.list()),
    async add(input) {
      const added = await store.add(input);
      tracker.apply(items => [...items, added]);
      return added;
    },
    async addMany(inputs) {
      try {
        const created = await store.addMany(inputs);
        tracker.apply(items => [...items, ...created]);
        return created;
      } catch (e) {
        // 途中まで作成できた車両も反映する
        const created = e instanceof DataError ? (e.created as readonly Vehicle[]) : [];
        if (created.length > 0) tracker.apply(items => [...items, ...created]);
        throw e;
      }
    },
    async update(id, patch) {
      await store.update(id, patch);
      tracker.apply(items => items.map(v => (v.id === id ? applyVehiclePatch(v, patch) : v)));
    },
    async remove(id) {
      await store.remove(id);
      tracker.apply(items => items.filter(v => v.id !== id));
    },
    cached: () => tracker.peek(options.key),
  };
}

/**
 * ストアにキャッシュを被せる。記録は範囲ごとのキー（key が関数）、車両は 1 つのキー（key が文字列）。
 * withOutageHandling の外側に被せる（失敗は DataError のまま素通しし、一覧は書き換えない）。
 */
export function withCache(store: RecordStore, options: RecordCacheOptions): CachedRecordStore;
export function withCache(store: VehicleStore, options: VehicleCacheOptions): CachedVehicleStore;
export function withCache(
  store: RecordStore | VehicleStore,
  options: RecordCacheOptions | VehicleCacheOptions
): CachedRecordStore | CachedVehicleStore {
  return typeof options.key === "function"
    ? withRecordCache(store as RecordStore, options as RecordCacheOptions)
    : withVehicleCache(store as VehicleStore, options as VehicleCacheOptions);
}
