/**
 * Supabase 失敗の分類とユーザー向けエラーメッセージ（純粋関数。React・ブラウザ API に依存しない）。
 *
 * Supabase Free プランのプロジェクトは 7 日間アイドルで PAUSED になり、
 * ゲートウェイが HTTP 540 を返す（ブラウザからは CORS/ネットワーク失敗として
 * status 0 に見えることもある）。ここで失敗を分類する。
 */

export type SupabaseOutage = "paused" | "unreachable";

type ErrorLike = {
  message?: unknown;
  code?: unknown;
  name?: unknown;
  status?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === "object") return error as ErrorLike;
  if (typeof error === "string") return { message: error };
  return {};
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const e = asErrorLike(error);
  const message = typeof e.message === "string" ? e.message : "";
  // postgrest-js は fetch 例外を { message: "TypeError: Failed to fetch", code: "" } に包む
  if (/TypeError|Failed to fetch|NetworkError|Load failed|ECONNREFUSED|ENOTFOUND|network/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * Supabase 呼び出しの失敗を分類する。
 *
 * @param status  PostgREST 応答の HTTP ステータス（fetch 自体が失敗した場合は 0 / undefined）
 * @param error   PostgrestError または投げられた例外
 * @returns 'paused' | 'unreachable' | null（null = 障害ではなく通常のアプリエラー: RLS 違反・バリデーション等）
 */
export function classifySupabaseFailure(
  status: number | null | undefined,
  error: unknown
): SupabaseOutage | null {
  const e = asErrorLike(error);
  const message = typeof e.message === "string" ? e.message : "";
  const effectiveStatus =
    typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;

  if (effectiveStatus === 540 || /paused/i.test(message)) return "paused";
  if (effectiveStatus === 0) return "unreachable";
  if (typeof effectiveStatus === "number" && effectiveStatus >= 500) return "unreachable";
  if (effectiveStatus == null && isNetworkFailure(error)) return "unreachable";
  return null;
}


export const CLOUD_LOAD_ERROR_MESSAGE = "クラウドの読み込みに失敗しました。時間をおいて再試行してください。";
export const PERMISSION_DENIED_MESSAGE = "アクセス権限がありません。ログインし直してください。";

/** PostgreSQL の権限エラー（42501: permission denied / RLS 違反）か */
export function isPermissionDeniedError(error: unknown): boolean {
  return asErrorLike(error).code === "42501";
}

/**
 * メッセージが日本語でそのまま画面に出せるアプリ側のエラー名
 * （SupabaseAuthTokenError / CrossTabLockError / readOnlyError）。
 * 名前で判定するのは、このモジュールを supabaseClient / migrateLocalData に依存させないため。
 */
const USER_FACING_ERROR_NAMES = new Set(["SupabaseAuthTokenError", "CrossTabLockError", "ReadOnlyError"]);

/**
 * 書き込み（追加・更新・削除）の失敗を、画面にそのまま出せる日本語メッセージの Error に変換する。
 * 生のエラーはここで console.error に出す（呼び出し側では出さない）。障害の記録（setOutage）は呼び出し側で行う。
 * 戻り値には元の HTTP ステータス（status）と元のエラー（cause）を付ける。
 */
export function toUserFacingWriteError(error: unknown, status?: number): Error {
  if (error instanceof Error && USER_FACING_ERROR_NAMES.has(error.name)) return error;

  console.error("クラウドへの書き込みに失敗しました:", error);
  const e = asErrorLike(error);
  const effectiveStatus = typeof status === "number" ? status : typeof e.status === "number" ? e.status : undefined;

  let message: string;
  if (e.code === "42501") message = PERMISSION_DENIED_MESSAGE;
  else if (e.code === "23505") message = "同じ記録が既に存在します";
  else if (e.code === "23503") message = "関連する車両が見つかりません。画面を再読み込みしてください";
  else if (classifySupabaseFailure(effectiveStatus, error)) message = "クラウドに接続できません。時間をおいて再試行してください。";
  else message = "保存に失敗しました。時間をおいて再試行してください。";

  const out = new Error(message, { cause: error }) as Error & { status?: number };
  if (typeof effectiveStatus === "number") out.status = effectiveStatus;
  return out;
}

/** 障害中にユーザーへ提示する日本語メッセージ */
export function outageMessage(kind: SupabaseOutage): string {
  return kind === "paused"
    ? "クラウドDBが一時停止中です。管理者が再開するまで、最後に同期したデータを閲覧専用で表示しています。"
    : "クラウドDBに接続できません。最後に同期したデータを閲覧専用で表示しています。";
}

/** 閲覧専用モードで書き込み操作が呼ばれたときに投げるエラーを生成する */
export function readOnlyError(kind: SupabaseOutage | null): Error {
  const error = new Error(
    kind === "paused"
      ? "クラウドDBが一時停止中のため、現在は閲覧専用です。再開後にもう一度お試しください。"
      : "クラウドDBに接続できないため、現在は閲覧専用です。接続が回復してからもう一度お試しください。"
  );
  error.name = "ReadOnlyError";
  return error;
}
