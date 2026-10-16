import { auth } from "@clerk/nextjs/server";
import { handleAnalyze } from "@/lib/server/analyze/handler";
import { callGemini } from "@/lib/server/analyze/geminiClient";
import {
  MAX_RATE_LIMIT_KEYS,
  MAX_REQUESTS_PER_WINDOW,
  MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
  RATE_LIMIT_WINDOW_MS,
  TRIAL_IP_WINDOW_MS,
  createRateLimiter,
} from "@/lib/server/analyze/rateLimit";

/**
 * Gemini 呼び出し（1 回最大30秒。一時的な失敗の再試行・代替モデルは残り時間が足りるときだけ。全体の予算は 55 秒）＋前後処理の余裕を見て関数全体の上限を60秒にする。
 * （Vercel の Serverless Function 上限。Hobby プランでも 60 秒まで指定可能）
 */
export const maxDuration = 60;

// モジュールレベルのインスタンス（= サーバーレスのインスタンスごとの状態。ベストエフォート）。
// 1分間に5回まで（キー = ログインユーザーID、未ログインはIP）／未ログインのお試しは IP ごとに 1 日 10 回まで。
const limiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  maxKeys: MAX_RATE_LIMIT_KEYS,
});
const trialLimiter = createRateLimiter({
  windowMs: TRIAL_IP_WINDOW_MS,
  max: MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
  maxKeys: MAX_RATE_LIMIT_KEYS,
});

/** 仕様・処理順序は docs/api-analyze.md、本体は lib/server/analyze/handler.ts */
export async function POST(req: Request) {
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
