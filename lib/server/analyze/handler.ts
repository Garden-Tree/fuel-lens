import * as Sentry from "@sentry/nextjs";
import {
  MAX_BODY_BYTES,
  derivePricePerUnit,
  hasAnyCoreValue,
  hostFromUrl,
  isAllowedOrigin,
  parseAnalyzeImages,
  plausibilityWarnings,
  sanitizeAIResponse,
  type AnalyzeErrorResponse,
  type AnalyzeSuccessResponse,
} from "@/lib/analyze";
import { TRIAL_COOKIE_NAME, TRIAL_EXHAUSTED_MESSAGE, TRIAL_MAX_SCANS, TRIAL_REMAINING_HEADER } from "@/lib/trial";
import { GeminiCallError } from "./errors";
// 型のみ。geminiClient は `server-only` を import するため、実体はここから読み込まない（テストで差し替え可能にする）
import type { callGemini } from "./geminiClient";
import { clientIpOf, type RateLimiter } from "./rateLimit";
import { decodeTrialCookie, readCookie, trialSetCookie } from "./trialCookie";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
/** 主モデルが一時的に失敗し続けたときの代替モデルの既定 */
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";

/** ハンドラ開始からの全体の時間予算（maxDuration 60 秒より少し手前） */
export const ANALYZE_TOTAL_BUDGET_MS = 55_000;
/** 新しい試行を始めるのに残っていてほしい時間（Gemini のタイムアウト 30 秒 + 余裕） */
export const ANALYZE_MIN_REMAINING_MS = 32_000;

/** 一時的な上流エラー（503 / 500 / 504 とネットワークエラー）か。429 の枠超過・タイムアウト・4xx は含めない */
export function isTransientGeminiError(error: unknown): boolean {
  if (!(error instanceof GeminiCallError)) return false;
  const { kind, status } = error;
  if (kind === "quota") return false;
  if (kind === "timeout") return status === 504;
  return status === undefined || status === 500 || status === 503 || status === 504;
}

const NOTHING_EXTRACTED_MESSAGE =
  "レシート/メーターを読み取れませんでした。文字がはっきり写るように撮り直すか、「手動で入力」から記録してください。";
/** 2 枚で送ったとき（役割の取り違えもありうるので、選び方の確認も促す） */
const NOTHING_EXTRACTED_PAIR_MESSAGE =
  "レシート/メーターを読み取れませんでした。1枚目にレシート、2枚目にメーターの写真を選んでいるか確認し、文字がはっきり写るように撮り直すか、「手動で入力」から記録してください。";

export type AnalyzeEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  /** 主モデルが一時的に失敗したときの代替モデル。空文字なら代替しない（未設定は既定の gemini-2.5-flash） */
  GEMINI_FALLBACK_MODEL?: string;
  /** 未ログインのお試し読み取りの Cookie の署名鍵。未設定ならお試しは無効（未ログインは 401 AUTH_REQUIRED） */
  TRIAL_COOKIE_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  /** "production" ならお試しの Cookie に Secure を付ける */
  NODE_ENV?: string;
};

export type AnalyzeDeps = {
  auth: () => Promise<{ userId: string | null }>;
  gemini: typeof callGemini;
  env: AnalyzeEnv;
  /** 1 分間の上限（キー = `user:<id>`、未ログインは `ip:<IP>`） */
  limiter: RateLimiter;
  /** 未ログインのお試しの IP ごとの 1 日の上限（キー = `ip:<IP>`） */
  trialLimiter: RateLimiter;
  now: () => number;
  /** リトライ前の待機（省略時は setTimeout。テストで差し替える） */
  sleep?: (ms: number) => Promise<void>;
  /** 0 以上 1 未満の乱数（待機時間のゆらぎ用。省略時は Math.random） */
  random?: () => number;
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

/**
 * POST /api/analyze の本体。検査の順序は
 * Origin → 認証（未ログインはお試しの判定）→ レートリミット（未ログインは IP の 1 日の上限も）→ サーバー設定 →
 * Content-Length → JSON → 画像 → Gemini → 検証 → 単価 → 422 → 警告。
 * （仕様は docs/api-analyze.md）
 */
export async function handleAnalyze(req: Request, deps: AnalyzeDeps): Promise<Response> {
  const { env, limiter, trialLimiter } = deps;
  const requestId = (deps.newRequestId ?? defaultRequestId)();
  const log = (level: "log" | "warn" | "error", ...args: unknown[]) =>
    deps.log(level, `[analyze ${requestId}]`, ...args);

  // 未ログインのお試しとして受け付けたとき、そのリクエスト時点の使用回数（Cookie の値。クライアントの申告は使わない）。
  // 決まった後のレスポンスにはすべて残り回数のヘッダーを付ける
  let trial: { count: number; secret: string } | null = null;
  const errorResponse = (status: number, body: AnalyzeErrorResponse, headers?: Record<string, string>): Response =>
    Response.json(body, {
      status,
      headers: {
        ...headers,
        ...(trial ? { [TRIAL_REMAINING_HEADER]: String(TRIAL_MAX_SCANS - trial.count) } : {}),
      },
    });

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
    const ip = clientIpOf(req.headers);

    if (!userId) {
      // ---- 未ログイン: お試し読み取り（TRIAL_COOKIE_SECRET が設定されているときだけ） ----
      const secret = env.TRIAL_COOKIE_SECRET;
      if (!secret) {
        return errorResponse(401, { error: "AI解析にはログインが必要です", code: "AUTH_REQUIRED", requestId });
      }
      // 使用回数は署名付き Cookie だけから読む（不正・欠落は 0 回 = 新しい端末）
      const count = decodeTrialCookie(readCookie(req.headers.get("cookie"), TRIAL_COOKIE_NAME), secret);
      trial = { count, secret };
      if (count >= TRIAL_MAX_SCANS) {
        return errorResponse(401, { error: TRIAL_EXHAUSTED_MESSAGE, code: "TRIAL_EXHAUSTED", requestId });
      }
    }

    // ---- レートリミット（ユーザーID単位。未ログインは IP 単位。インスタンス内ベストエフォート） ----
    // IP はリミッタのメモリにだけ置き、ログには出さない
    const rateKey = userId ? `user:${userId}` : `ip:${ip}`;
    const rate = limiter.consume(rateKey, deps.now());
    if (!rate.allowed) {
      log("warn", userId ? `Rate limit exceeded for user:${userId}` : "Rate limit exceeded (trial)");
      return errorResponse(
        429,
        { error: "リクエストが多すぎます。しばらく時間をおいて再度お試しください。", code: "RATE_LIMITED", requestId },
        { "Retry-After": String(rate.retryAfterSec) }
      );
    }
    if (trial) {
      // お試しは IP ごとに 1 日の上限も掛ける（Cookie は消せば数え直せるため）
      const daily = trialLimiter.consume(`ip:${ip}`, deps.now());
      if (!daily.allowed) {
        log("warn", "Trial daily limit exceeded");
        return errorResponse(
          429,
          {
            error: "この接続からのお試しの読み取りが1日の上限に達しました。ログインすると続けて使えます。",
            code: "TRIAL_IP_LIMITED",
            requestId,
          },
          { "Retry-After": String(daily.retryAfterSec) }
        );
      }
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

    // 1 枚（`image`。旧クライアント互換で `imageBase64` も）か、2 枚（`images`: レシート + メーター）。
    // 2 枚でも Gemini 呼び出しは 1 回（レートリミットも 1 回分。上で消費済み）
    const parsed = parseAnalyzeImages(body as Record<string, unknown>);
    if (!parsed.ok) {
      return errorResponse(parsed.status, { error: parsed.error, code: parsed.code, requestId });
    }
    const { mode, images } = parsed;
    log(
      "log",
      `${mode} ${images.map((img) => `${img.role}:${img.mimeType} ~${Math.round(img.approxBytes / 1024)} KB`).join(" ")} user=${userId ? "yes" : "trial"}`
    );
    // 再試行・代替モデルでも同じ画像（1 枚または 2 枚）を送る
    const promptImages = images.map(({ role, base64, mimeType }) => ({ role, base64, mimeType }));

    // ---- Gemini 呼び出し ----
    const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

    // 一時的な失敗（503 など）は主モデルを 1 回だけ再試行 → 代替モデルを 1 回だけ試す。
    // 429・タイムアウト・4xx は再試行しない。時間予算が足りなければ新しい試行は始めない。
    // レートリミットは 1 リクエスト 1 回（内部の再試行では数えない）
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const random = deps.random ?? Math.random;
    const fallbackRaw = env.GEMINI_FALLBACK_MODEL ?? DEFAULT_GEMINI_FALLBACK_MODEL;
    const fallbackModel = fallbackRaw && fallbackRaw !== model ? fallbackRaw : null;
    const plan = fallbackModel ? [model, model, fallbackModel] : [model, model];
    const startedAt = deps.now();
    const hasBudget = () => ANALYZE_TOTAL_BUDGET_MS - (deps.now() - startedAt) >= ANALYZE_MIN_REMAINING_MS;

    let responseText: string | undefined;
    let usedModel = model;
    try {
      let result: Awaited<ReturnType<AnalyzeDeps["gemini"]>> | undefined;
      let lastError: unknown;
      for (let i = 0; i < plan.length; i++) {
        if (i > 0) {
          if (!isTransientGeminiError(lastError)) break;
          if (i === 1) {
            await sleep(800 + Math.floor(random() * 700));
          }
          if (!hasBudget()) {
            log("warn", `skip attempt ${i + 1}: not enough time budget left`);
            break;
          }
        }
        usedModel = plan[i];
        try {
          result = await deps.gemini({
            apiKey,
            model: usedModel,
            images: promptImages,
          });
          break;
        } catch (error) {
          lastError = error;
          if (error instanceof GeminiCallError) {
            log("warn", `attempt ${i + 1} failed (${error.kind}, status=${error.status ?? "n/a"}, model=${usedModel})`);
          }
        }
      }
      if (!result) throw lastError;
      if (usedModel !== model) log("log", `succeeded with fallback model ${usedModel}`);
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
        `Gemini call failed (${kind}, status=${status ?? "n/a"}, model=${usedModel}):`,
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
        error:
          status === 503
            ? "AIが混み合っています。少し時間をおいてもう一度お試しください。"
            : "AI解析サービスでエラーが発生しました。しばらくしてから再度お試しください。",
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
        error: mode === "pair" ? NOTHING_EXTRACTED_PAIR_MESSAGE : NOTHING_EXTRACTED_MESSAGE,
        code: "NOTHING_EXTRACTED",
        requestId,
      });
    }

    const warnings = plausibilityWarnings(data);
    if (warnings.length > 0) {
      log("warn", "Plausibility warnings:", warnings);
    }

    const payload: AnalyzeSuccessResponse = {
      ...data,
      ...(warnings.length > 0 ? { warnings } : {}),
      requestId,
    };
    if (trial) {
      // お試しの回数は読み取りに成功したときだけ数え、署名し直した Cookie を返す
      const used = trial.count + 1;
      return Response.json(payload, {
        headers: {
          "Set-Cookie": trialSetCookie(used, trial.secret, { secure: env.NODE_ENV === "production" }),
          [TRIAL_REMAINING_HEADER]: String(TRIAL_MAX_SCANS - used),
        },
      });
    }
    return Response.json(payload);
  } catch (error) {
    // ここに来るのは想定外の例外のみ（auth() の失敗など）。詳細はログにのみ残す
    log("error", "Unexpected error:", error);
    // Sentry にも送る（requestId で Vercel のログと突き合わせられる。DSN 未設定なら何もしない）
    Sentry.captureException(error, { tags: { requestId } });
    return errorResponse(500, {
      error: "解析中に予期しないエラーが発生しました。しばらくしてから再度お試しください。",
      code: "INTERNAL_ERROR",
      requestId,
    });
  }
}
