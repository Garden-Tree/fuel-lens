/**
 * サーバーが知っているログイン状態（初期認証状態）と、それを使った「Clerk の読み込み前」の判定（純粋関数）。
 *
 * アプリ画面のレイアウト（app/(app)/layout.tsx）がサーバーで Clerk の auth() を読み、`InitialAuth` をクライアントへ渡す
 * （lib/data/initialAuthContext.tsx）。クライアントの Clerk（clerk-js）が読み込まれるまでの間だけ使い、読み込み後は Clerk の値が常に優先する。
 *
 * - サーバーが未ログインと言い、Clerk のクライアント Cookie（`__client_uat`）も未ログイン（無い・0）: Clerk を待たずにローカルのストア
 *   （localStorage）で読み込む（resolveAuth の isLoaded: true）。サーバーの「未ログイン」は、ページ遷移（RSC）でセッショントークンが
 *   期限切れだったとき（handshake はドキュメントの読み込みでしか起きない）にも返るので、それだけでは信用しない
 * - サーバーがログイン中と言った: ネットワーク（Supabase はトークンが要る）は Clerk を待つ。ただし、その userId が
 *   この端末のキャッシュの持ち主（syncCacheOwner が記録）と一致すれば、キャッシュを閲覧専用で先に表示してよい（previewUserId）
 * - 不明（プロバイダが無い・auth() の失敗）: 従来どおり Clerk を待つ
 */

import { readCache, readCacheOwner, recordsCacheKey, vehiclesCacheKey } from "../supabase/cache";
import type { FuelRecord, Vehicle } from "../types";
import type { RecordScope } from "./types";

/** サーバー（auth()）が知っているログイン状態。null は不明 */
export type InitialAuth = { signedIn: boolean; userId: string | null };

/**
 * Clerk のクライアント Cookie（`__client_uat`、サフィックス付きの `__client_uat_<suffix>` も）が「ログイン中かもしれない」を示すか。
 * 値は最後にログインした時刻（秒）で、未ログインなら 0 か Cookie 自体が無い。読めない値は安全側（ログイン中かもしれない）に倒す
 */
export function clientUatIndicatesSignedIn(cookie: string): boolean {
  return cookie.split(";").some(part => {
    const eq = part.indexOf("=");
    const name = (eq < 0 ? part : part.slice(0, eq)).trim();
    if (name !== "__client_uat" && !name.startsWith("__client_uat_")) return false;
    const value = Number(decodeURIComponentSafe(eq < 0 ? "" : part.slice(eq + 1).trim()));
    return !Number.isFinite(value) || value > 0;
  });
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Clerk の useAuth() のうち判定に使う値 */
export type ClerkAuthState = { isLoaded: boolean; isSignedIn: boolean; userId: string | null };

export type ResolvedAuth = {
  /** ストアを選べる（Clerk の読み込み済み、またはサーバーが未ログインと言った） */
  isLoaded: boolean;
  /** ログイン中（Clerk の読み込み後だけ true になる。サーバーの値だけではクラウドを使わない） */
  isSignedIn: boolean;
  userId: string | null;
  /** Clerk の読み込み前に、このユーザーのキャッシュを先に表示してよい（サーバーがログイン中と言った）。それ以外は null */
  previewUserId: string | null;
};

/**
 * Clerk の状態とサーバーの初期認証状態から、データの読み込みに使うログイン状態を決める。
 * Clerk の読み込み後は Clerk の値だけを使う（サーバーの値は古い可能性がある）。
 * clientMaybeSignedIn は clientUatIndicatesSignedIn の結果（読めない = SSR・ハイドレーション中は null）。
 * サーバーの「未ログイン」は、これが false のときだけ信用する（true・null なら不明として Clerk を待つ）。
 */
export function resolveAuth(
  clerk: ClerkAuthState,
  initial: InitialAuth | null,
  clientMaybeSignedIn: boolean | null
): ResolvedAuth {
  if (clerk.isLoaded) {
    return { isLoaded: true, isSignedIn: clerk.isSignedIn, userId: clerk.userId, previewUserId: null };
  }
  if (initial && !initial.signedIn && clientMaybeSignedIn === false) {
    return { isLoaded: true, isSignedIn: false, userId: null, previewUserId: null };
  }
  return {
    isLoaded: false,
    isSignedIn: false,
    userId: null,
    previewUserId: initial?.signedIn && initial.userId ? initial.userId : null,
  };
}

/** キャッシュの持ち主と中身の読み出し（既定は lib/supabase/cache.ts の localStorage。テストでは差し替える） */
export type CachePreviewIO = { owner: () => string | null; read: (key: string) => unknown };

const defaultPreviewIO: CachePreviewIO = { owner: readCacheOwner, read: key => readCache<unknown>(key) };

/**
 * Clerk の読み込み前に表示する、最後に同期した一覧（per-user キャッシュ）。閲覧専用の表示にだけ使い、書き込みには使わない。
 * 読むたびにキャッシュの持ち主を確かめ、userId と違えば（ログアウト・ユーザー切り替えの後など）null を返す。
 */
export type CachePreview = {
  userId: string;
  vehicles(): Vehicle[] | null;
  records(scope: RecordScope): FuelRecord[] | null;
};

export function createCachePreview(userId: string, io: CachePreviewIO = defaultPreviewIO): CachePreview {
  const readOwned = <T>(key: string): T[] | null => {
    if (!userId || io.owner() !== userId) return null;
    const value = io.read(key);
    return Array.isArray(value) ? (value as T[]) : null;
  };
  return {
    userId,
    vehicles: () => readOwned<Vehicle>(vehiclesCacheKey(userId)),
    records: scope => readOwned<FuelRecord>(recordsCacheKey(userId, scope.vehicleId)),
  };
}
