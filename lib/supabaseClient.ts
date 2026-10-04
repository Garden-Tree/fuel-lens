"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@clerk/nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase環境変数（NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY）が設定されていません。");
}

/**
 * Clerk の getToken と互換の関数型。
 * `useAuth().getToken` をそのまま渡せる（引数の全プロパティが optional のため代入可能）。
 */
export type GetToken = (options?: { template?: string }) => Promise<string | null>;

/**
 * Clerk → Supabase の JWT テンプレート名。
 *
 * NOTE: 現在は Clerk ダッシュボードで作成した "supabase" JWT テンプレート
 * （Supabase の JWT secret で署名）を使っている。Clerk の「Supabase ネイティブ連携
 * （サードパーティ認証）」へ切り替えると、テンプレート指定なしの `getToken()` で
 * 取得したセッショントークンをそのまま渡せる。切り替えには Clerk / Supabase 両方の
 * ダッシュボード設定が必要なため、コードだけでは移行できない。移行後は
 * `getToken({ template: SUPABASE_JWT_TEMPLATE })` を `getToken()` に変えるだけでよい。
 */
export const SUPABASE_JWT_TEMPLATE = "supabase";

/**
 * Clerk からトークンを取得できなかったときに accessToken コールバックから投げるエラー。
 *
 * supabase-js は accessToken が null を返すと anon キーを Bearer として黙って送ってしまい、
 * RLS/権限エラー（英語の "permission denied"）として表面化する。それを避けるため null では
 * なく例外にする。postgrest-js は fetch 段階の例外を
 * `{ message: "<error.name>: <error.message>", code: "", status: 0 }` に包んで返す
 * （code は error.cause がある場合にしか引き継がれない）ので、判別は message 内の
 * エラー名で行う。呼び出し側は `isAuthTokenError()` を使い、障害（outage）ではなく
 * 認証エラーとして扱うこと。
 */
export const AUTH_TOKEN_ERROR_CODE = "AUTH_TOKEN_MISSING";
export const AUTH_TOKEN_ERROR_NAME = "SupabaseAuthTokenError";
export const AUTH_TOKEN_ERROR_MESSAGE = "認証トークンを取得できませんでした。再ログインしてください。";

export class SupabaseAuthTokenError extends Error {
  readonly code = AUTH_TOKEN_ERROR_CODE;
  constructor(message: string = AUTH_TOKEN_ERROR_MESSAGE) {
    super(message);
    this.name = AUTH_TOKEN_ERROR_NAME;
  }
}

/** 直接投げられた SupabaseAuthTokenError と、postgrest-js に包まれた後の両方を判別する */
export function isAuthTokenError(error: unknown): boolean {
  if (error instanceof SupabaseAuthTokenError) return true;
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; name?: unknown; message?: unknown };
  if (e.code === AUTH_TOKEN_ERROR_CODE || e.name === AUTH_TOKEN_ERROR_NAME) return true;
  return typeof e.message === "string" && e.message.includes(AUTH_TOKEN_ERROR_NAME);
}

/** getToken の例外がオフライン / ネットワーク障害によるものか（認証エラーと区別する） */
function isNetworkLikeError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (e instanceof TypeError) return true;
  const message = e && typeof e === "object" ? (e as { message?: unknown }).message : undefined;
  return typeof message === "string" && /fetch|network|Failed to/i.test(message);
}

type CacheEntry = {
  client: SupabaseClient;
  /** 最新の getToken を保持する。Clerk が getToken の参照を更新しても同じクライアントを使い回せる。 */
  tokenRef: { current: GetToken | null };
};

const ANON_KEY = "__anon__";
const clientCache = new Map<string, CacheEntry>();

function buildClient(tokenRef: { current: GetToken | null }, withAccessToken: boolean): SupabaseClient {
  return createClient(supabaseUrl || "", supabaseAnonKey || "", {
    ...(withAccessToken
      ? {
          // supabase-js の accessToken オプション: リクエストごとに呼ばれ、Authorization ヘッダーに使われる。
          // Clerk 側でトークンが自動更新されるため、クライアントを作り直す必要がない。
          // null を返すと supabase-js が anon キーで送信してしまうため、取得できない場合は例外にする。
          // NOTE: postgrest-js は GET の fetch 例外を最大 3 回（1s/2s/4s）再試行するため、
          // トークン取得失敗が確定するまで最長 7 秒ほどかかる。その間に Clerk が復帰すれば成功する。
          accessToken: async () => {
            const getToken = tokenRef.current;
            if (!getToken) throw new SupabaseAuthTokenError();
            let token: string | null = null;
            try {
              token = await getToken({ template: SUPABASE_JWT_TEMPLATE });
            } catch (e) {
              console.error("Clerk トークンの取得に失敗しました:", e);
              // オフライン / ネットワーク障害による失敗は認証エラーではない。元の例外をそのまま投げ、
              // postgrest-js に status 0 として包ませる（→ "unreachable" に分類され閲覧専用になる）。
              if (isNetworkLikeError(e)) throw e;
              throw new SupabaseAuthTokenError();
            }
            if (!token) {
              // Clerk はオフライン時に例外ではなく null を返すことがある。その場合も障害として扱う。
              if (typeof navigator !== "undefined" && navigator.onLine === false) {
                throw new TypeError("Failed to fetch: offline (Clerk token unavailable)");
              }
              throw new SupabaseAuthTokenError();
            }
            return token;
          },
        }
      : {}),
    auth: {
      // 認証は Clerk が担うため、Supabase Auth のセッション永続化は行わない
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * ユーザーごとにメモ化された Supabase クライアントを返す。
 *
 * - 同じ userId には常に同じインスタンスを返す（毎回 createClient しない）
 * - getToken は呼び出しのたびに最新のものへ差し替える
 * - userId が null（未ログイン）の場合は anon クライアント
 */
export function getSupabaseClient(userId: string | null | undefined, getToken: GetToken | null | undefined): SupabaseClient {
  const key = userId ?? ANON_KEY;
  let entry = clientCache.get(key);
  if (!entry) {
    const tokenRef = { current: getToken ?? null };
    entry = { client: buildClient(tokenRef, key !== ANON_KEY), tokenRef };
    clientCache.set(key, entry);
  } else if (getToken) {
    entry.tokenRef.current = getToken;
  }
  return entry.client;
}

/**
 * React フック版。コンポーネント / フック内では基本的にこちらを使う。
 * 戻り値は userId が変わらない限り同一参照。
 */
export function useSupabase(): SupabaseClient {
  const { getToken, userId } = useAuth();
  return getSupabaseClient(userId, getToken);
}
