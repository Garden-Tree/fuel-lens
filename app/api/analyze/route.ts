import { auth } from "@clerk/nextjs/server";
import { handleAnalyze } from "@/lib/server/analyze/handler";
import { callGemini } from "@/lib/server/analyze/geminiClient";
import { createAnalyzeLimiters } from "@/lib/server/analyze/redisRateLimit";

/**
 * Gemini 呼び出し（1 回最大30秒。一時的な失敗の再試行・代替モデルは残り時間が足りるときだけ。全体の予算は 55 秒）＋前後処理の余裕を見て関数全体の上限を60秒にする。
 * （Vercel の Serverless Function 上限。Hobby プランでも 60 秒まで指定可能）
 */
export const maxDuration = 60;

// 1分間に5回まで（キー = ログインユーザーID、未ログインはIP）／未ログインのお試しは IP ごとに 1 日 10 回まで。
// Upstash Redis（UPSTASH_REDIS_REST_* または KV_REST_API_*）と HMAC の鍵がそろえば外部ストアで数え、
// 未設定・障害時はモジュールレベルのメモリ（= サーバーレスのインスタンスごと。ベストエフォート）で数える。
// 環境変数はビルド時ではなく最初のリクエストで読む。
let limiters: ReturnType<typeof createAnalyzeLimiters> | undefined;
function getLimiters() {
  limiters ??= createAnalyzeLimiters({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    RATE_LIMIT_KEY_SECRET: process.env.RATE_LIMIT_KEY_SECRET,
    TRIAL_COOKIE_SECRET: process.env.TRIAL_COOKIE_SECRET,
  });
  return limiters;
}

/** 仕様・処理順序は docs/api-analyze.md、本体は lib/server/analyze/handler.ts */
export async function POST(req: Request) {
  const { limiter, trialLimiter } = getLimiters();
  return handleAnalyze(req, {
    auth: async () => {
      const { userId } = await auth();
      return { userId };
    },
    gemini: callGemini,
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      GEMINI_FALLBACK_MODEL: process.env.GEMINI_FALLBACK_MODEL,
      TRIAL_COOKIE_SECRET: process.env.TRIAL_COOKIE_SECRET,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NODE_ENV: process.env.NODE_ENV,
    },
    limiter,
    trialLimiter,
    now: Date.now,
    log: (level, ...args) => console[level](...args),
  });
}
