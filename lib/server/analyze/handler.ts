import {
  MAX_BODY_BYTES,
  derivePricePerUnit,
  hasAnyCoreValue,
  hostFromUrl,
  isAllowedOrigin,
  parseImagePayload,
  plausibilityWarnings,
  sanitizeAIResponse,
  type AnalyzeErrorResponse,
  type AnalyzeSuccessResponse,
} from "@/lib/analyze";
import { GeminiCallError } from "./errors";
// 型のみ。geminiClient は `server-only` を import するため、実体はここから読み込まない（テストで差し替え可能にする）
import type { callGemini } from "./geminiClient";
import type { AnonymousQuota, RateLimiter } from "./rateLimit";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

export type AnalyzeEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  ALLOW_ANONYMOUS_SCAN?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

export type AnalyzeDeps = {
  auth: () => Promise<{ userId: string | null }>;
  gemini: typeof callGemini;
  env: AnalyzeEnv;
  limiter: RateLimiter;
  anonQuota: AnonymousQuota;
  now: () => number;
  /** 第 1 引数は `[analyze <requestId>]` 接頭辞 */
  log: (level: "log" | "warn" | "error", ...args: unknown[]) => void;
  /** リクエスト ID の生成（省略時は UUID の先頭 8 文字） */
  newRequestId?: () => string;
};

function defaultRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

function errorResponse(status: number, body: AnalyzeErrorResponse, headers?: Record<string, string>): Response {
  return Response.json(body, { status, headers });
}

/**
 * POST /api/analyze の本体。検査の順序は
 * Origin → 認証 → レートリミット → サーバー設定 → Content-Length → JSON → 画像 → Gemini → 検証 → 単価 → 422 → 警告。
 * （仕様は docs/api-analyze.md）
 */
export async function handleAnalyze(req: Request, deps: AnalyzeDeps): Promise<Response> {
  const { env, limiter, anonQuota } = deps;
  const requestId = (deps.newRequestId ?? defaultRequestId)();
  const log = (level: "log" | "warn" | "error", ...args: unknown[]) =>
    deps.log(level, `[analyze ${requestId}]`, ...args);

  try {
    // ---- Origin チェック（CSRF 的な他サイトからの直接叩きを弾く） ----
    const origin = req.headers.get("origin");
    const allowedHosts = [
      req.headers.get("host"),
      req.headers.get("x-forwarded-host"),
      hostFromUrl(env.NEXT_PUBLIC_APP_URL),
    ];
    if (!isAllowedOrigin(origin, allowedHosts)) {
      log("warn", "Origin mismatch:", origin, "allowed:", allowedHosts.filter(Boolean));
      return errorResponse(403, { error: "不正なリクエスト元です。", code: "ORIGIN_MISMATCH", requestId });
    }

    // ---- 認証 ----
    const { userId } = await deps.auth();
    // x-forwarded-for は "client, proxy1, proxy2" と複数IPが列挙されるため先頭（クライアントIP）を使う
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown_ip";
    const allowAnonymous = env.ALLOW_ANONYMOUS_SCAN === "true";

    if (!userId) {
      if (!allowAnonymous) {
        return errorResponse(401, { error: "AI解析にはログインが必要です", code: "AUTH_REQUIRED", requestId });
      }
      // ベストエフォートの匿名お試し: IPごとに上限回数まで。
      // メモリ上のカウンタなのでインスタンスが変われば／再起動すればリセットされる（抜け道あり）。
      if (anonQuota.isExceeded(ip)) {
        return errorResponse(403, {
          error: `お試し解析の上限（${anonQuota.max}回）に達しました。引き続き解析機能を利用するには、ログインして無料ユーザー登録を行ってください。`,
          code: "ANONYMOUS_LIMIT_EXCEEDED",
          requestId,
        });
      }
    }

    // ---- レートリミット（ユーザーID単位。匿名時はIP単位。インスタンス内ベストエフォート） ----
    const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
    const rate = limiter.consume(rateKey, deps.now());
    if (!rate.allowed) {
      log("warn", "Rate limit exceeded for", rateKey);
      return errorResponse(
        429,
        { error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。", code: "RATE_LIMITED", requestId },
        { "Retry-After": String(rate.retryAfterSec) }
      );
    }

    // ---- サーバー設定チェック（API キー未設定なら即 500） ----
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      log("error", "GEMINI_API_KEY is not set");
      return errorResponse(500, {
        error: "サーバーの設定に問題があります。管理者にお問い合わせください。",
        code: "SERVER_MISCONFIGURED",
        requestId,
      });
    }

    // ---- ボディサイズ（Content-Length がある場合は読む前に弾く） ----
    const contentLength = Number(req.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return errorResponse(413, {
        error: "画像サイズが大きすぎます。4MB以下の画像を使用してください。",
        code: "PAYLOAD_TOO_LARGE",
        requestId,
      });
    }

    // ---- JSON パース ----
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, { error: "リクエスト本文が不正です（JSON を解釈できません）。", code: "INVALID_JSON", requestId });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return errorResponse(400, { error: "リクエスト本文が不正です。", code: "INVALID_BODY", requestId });
    }

    // `image` が正。旧クライアント互換のため `imageBase64` も受け付ける
    const { image, imageBase64 } = body as { image?: unknown; imageBase64?: unknown };
    const parsed = parseImagePayload(image ?? imageBase64);
    if (!parsed.ok) {
      return errorResponse(parsed.status, { error: parsed.error, code: "INVALID_IMAGE", requestId });
    }
    log("log", `image ${parsed.mimeType} ~${Math.round(parsed.approxBytes / 1024)} KB user=${userId ? "yes" : "anon"}`);

    // ---- Gemini 呼び出し ----
    const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    let responseText: string | undefined;
    try {
      const result = await deps.gemini({
        apiKey,
        model,
        base64: parsed.base64,
        mimeType: parsed.mimeType,
      });
      responseText = result.text;

      if (!responseText) {
        const { blockReason, finishReason } = result;
        log("warn", "Empty response from Gemini", { blockReason, finishReason });
        if (blockReason) {
          return errorResponse(422, {
            error: "この画像は解析できませんでした（安全性フィルタによりブロックされました）。別の画像でお試しください。",
            code: "BLOCKED",
            requestId,
          });
        }
        return errorResponse(502, {
          error: "AIから有効な応答が得られませんでした。しばらくしてから再度お試しください。",
          code: "UPSTREAM_EMPTY",
          requestId,
        });
      }
    } catch (error) {
      const kind = error instanceof GeminiCallError ? error.kind : "upstream";
      const status = error instanceof GeminiCallError ? error.status : undefined;
      log(
        "error",
        `Gemini call failed (${kind}, status=${status ?? "n/a"}, model=${model}):`,
        error instanceof GeminiCallError ? error.cause : error
      );

      if (kind === "quota") {
        return errorResponse(
          429,
          { error: "AI解析の利用枠が一時的に上限に達しています。しばらく時間をおいて再度お試しください。", code: "UPSTREAM_QUOTA", requestId },
          { "Retry-After": "30" }
        );
      }
      if (kind === "timeout") {
        return errorResponse(504, {
          error: "AI解析がタイムアウトしました。画像を小さくするか、しばらくしてから再度お試しください。",
          code: "UPSTREAM_TIMEOUT",
          requestId,
        });
      }
      return errorResponse(502, {
        error: "AI解析サービスでエラーが発生しました。しばらくしてから再度お試しください。",
        code: "UPSTREAM_ERROR",
        requestId,
      });
    }

    // ---- 応答の検証 ----
    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch {
      log("error", "Gemini response is not JSON:", responseText.slice(0, 300));
      return errorResponse(502, {
        error: "AIの応答を解釈できませんでした。しばらくしてから再度お試しください。",
        code: "UPSTREAM_INVALID_JSON",
        requestId,
      });
    }

    const data = sanitizeAIResponse(rawData);
    if (!data) {
      log("error", "Gemini response is not an object:", responseText.slice(0, 300));
      return errorResponse(502, {
        error: "AIの応答を解釈できませんでした。しばらくしてから再度お試しください。",
        code: "UPSTREAM_INVALID_SHAPE",
        requestId,
      });
    }

    // 単価は総額÷給油量で再計算（lib/calculations.ts と同じ 0.1 円単位の丸め）。計算できないときは AI の読み取り値を残す
    data.price_per_unit = derivePricePerUnit(data.total_cost, data.fuel_amount) ?? data.price_per_unit;

    if (!hasAnyCoreValue(data)) {
      log("warn", "No core values extracted", data);
      return errorResponse(422, {
        error: "レシート/メーターを読み取れませんでした。文字がはっきり写るように撮り直すか、「手動で入力」から記録してください。",
        code: "NOTHING_EXTRACTED",
        requestId,
      });
    }

    const warnings = plausibilityWarnings(data);
    if (warnings.length > 0) {
      log("warn", "Plausibility warnings:", warnings);
    }

    // 匿名お試しカウント（解析成功時のみ加算）
    if (!userId) {
      anonQuota.record(ip);
    }

    const payload: AnalyzeSuccessResponse = {
      ...data,
      ...(warnings.length > 0 ? { warnings } : {}),
      requestId,
    };
    return Response.json(payload);
  } catch (error) {
    // ここに来るのは想定外の例外のみ（auth() の失敗など）。詳細はログにのみ残す
    log("error", "Unexpected error:", error);
    return errorResponse(500, {
      error: "解析中に予期しないエラーが発生しました。しばらくしてから再度お試しください。",
      code: "INTERNAL_ERROR",
      requestId,
    });
  }
}
