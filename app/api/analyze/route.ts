import { auth } from "@clerk/nextjs/server";
import { handleAnalyze } from "@/lib/server/analyze/handler";
import { callGemini } from "@/lib/server/analyze/geminiClient";
import {
  MAX_ANONYMOUS_SCANS,
  MAX_RATE_LIMIT_KEYS,
  MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
  createAnonymousQuota,
  createRateLimiter,
} from "@/lib/server/analyze/rateLimit";

/**
 * Gemini 呼び出し（最大30秒）＋前後処理の余裕を見て関数全体の上限を60秒にする。
 * （Vercel の Serverless Function 上限。Hobby プランでも 60 秒まで指定可能）
 */
export const maxDuration = 60;

// モジュールレベルのインスタンス（= サーバーレスのインスタンスごとの状態。ベストエフォート）。
// 1分間に5回まで（キー = ログインユーザーID、匿名時はIP）／匿名お試しは IP ごとに3回まで。
const limiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: MAX_REQUESTS_PER_WINDOW,
  maxKeys: MAX_RATE_LIMIT_KEYS,
});
const anonQuota = createAnonymousQuota({ max: MAX_ANONYMOUS_SCANS, maxKeys: MAX_RATE_LIMIT_KEYS });

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
      ALLOW_ANONYMOUS_SCAN: process.env.ALLOW_ANONYMOUS_SCAN,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    },
    limiter,
    anonQuota,
    now: Date.now,
    log: (level, ...args) => console[level](...args),
  });
}
