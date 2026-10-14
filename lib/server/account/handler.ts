import { hostFromUrl, isAllowedOrigin } from "@/lib/analyze";
import type { RateLimiter } from "@/lib/server/analyze/rateLimit";

/**
 * DELETE /api/account の本体（アカウント削除の 2 段目: Clerk のユーザーを削除する）。
 * 1 段目のクラウドのデータの削除は、ブラウザが利用者自身の JWT（RLS）で先に済ませる（lib/data/accountDeletion.ts）。
 * 仕様は docs/api-account.md。依存は注入できる（tests/accountHandler.test.ts）。
 *
 * 検査の順序: Origin → 認証（401）→ expectedUserId の照合（409）→ レートリミット（429）→ Clerk のユーザー削除（成功・既に無い = 204、失敗 = 500）。
 * Clerk のエラー本文はクライアントに返さず、requestId 付きの汎用メッセージにする（ログにだけ出す）。
 */

export type AccountErrorResponse = { error: string; code: string; requestId: string };

export type AccountDeleteDeps = {
  auth: () => Promise<{ userId: string | null }>;
  /** Clerk のユーザーを削除する（route.ts では clerkClient().users.deleteUser） */
  deleteUser: (userId: string) => Promise<unknown>;
  limiter: RateLimiter;
  env: { NEXT_PUBLIC_APP_URL?: string };
  /** 第 1 引数は `[account <requestId>]` 接頭辞 */
  log: (level: "log" | "warn" | "error", ...args: unknown[]) => void;
  /** リクエスト ID の生成（省略時は UUID の先頭 8 文字） */
  newRequestId?: () => string;
};

/** 1 分あたりの上限（キー = userId。削除は 1 回で済むので低めにする） */
export const ACCOUNT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const ACCOUNT_MAX_REQUESTS_PER_WINDOW = 3;

export const ACCOUNT_DELETE_FAILED_MESSAGE =
  "アカウントを削除できませんでした。時間をおいて、もう一度お試しください。";

export const USER_MISMATCH_MESSAGE =
  "ログイン中のアカウントが変わったため中止しました。もう一度やり直してください。";

/** 本文 JSON の expectedUserId（文字列のときだけ。本文が無い・不正なら null） */
async function readExpectedUserId(req: Request): Promise<string | null> {
  try {
    const body: unknown = await req.json();
    const id = (body as { expectedUserId?: unknown } | null)?.expectedUserId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

function defaultRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function errorResponse(status: number, body: AccountErrorResponse, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

/** Clerk の API エラーの HTTP ステータス（ClerkAPIResponseError.status） */
function statusOf(e: unknown): number | undefined {
  const status = (e as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

export async function handleDeleteAccount(req: Request, deps: AccountDeleteDeps): Promise<Response> {
  const requestId = (deps.newRequestId ?? defaultRequestId)();
  const log = (level: "log" | "warn" | "error", ...args: unknown[]) =>
    deps.log(level, `[account ${requestId}]`, ...args);

  try {
    const origin = req.headers.get("origin");
    const allowedHosts = [req.headers.get("host"), req.headers.get("x-forwarded-host"), hostFromUrl(deps.env.NEXT_PUBLIC_APP_URL)];
    if (!isAllowedOrigin(origin, allowedHosts)) {
      log("warn", "Origin mismatch:", origin);
      return errorResponse(403, { error: "不正なリクエスト元です。", code: "ORIGIN_MISMATCH", requestId });
    }

    const { userId } = await deps.auth();
    if (!userId) {
      return errorResponse(401, { error: "ログインが必要です。", code: "UNAUTHENTICATED", requestId });
    }

    // 確認を取ったアカウントと今ログインしているアカウントが違うなら中止する（別タブでの切り替え対策）。
    // 削除するのは常に auth() のユーザーだけ。本文が無い・読めない場合は照合しない（後方互換）
    const expectedUserId = await readExpectedUserId(req);
    if (expectedUserId !== null && expectedUserId !== userId) {
      log("warn", "User mismatch: expected", expectedUserId, "actual", userId);
      return errorResponse(409, { error: USER_MISMATCH_MESSAGE, code: "USER_MISMATCH", requestId });
    }

    const rate = deps.limiter.consume(userId);
    if (!rate.allowed) {
      return errorResponse(
        429,
        { error: "リクエストが多すぎます。しばらく待ってから再度お試しください。", code: "RATE_LIMITED", requestId },
        { "Retry-After": String(rate.retryAfterSec) }
      );
    }

    try {
      await deps.deleteUser(userId);
    } catch (e) {
      // 既に削除済み（再試行・別タブ）なら目的は達成している
      if (statusOf(e) === 404) {
        log("warn", "Clerk user already deleted:", userId);
        return new Response(null, { status: 204 });
      }
      throw e;
    }
    log("log", "Deleted Clerk user:", userId);
    return new Response(null, { status: 204 });
  } catch (e) {
    log("error", "Account deletion failed:", e);
    return errorResponse(500, { error: ACCOUNT_DELETE_FAILED_MESSAGE, code: "DELETE_FAILED", requestId });
  }
}
