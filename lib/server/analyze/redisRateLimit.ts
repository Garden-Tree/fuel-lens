import { createHmac } from "node:crypto";
import {
  MAX_RATE_LIMIT_KEYS,
  MAX_REQUESTS_PER_WINDOW,
  MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
  RATE_LIMIT_WINDOW_MS,
  TRIAL_IP_WINDOW_MS,
  createRateLimiter,
  type RateLimitConsumer,
  type RateLimitResult,
  type RateLimiter,
} from "./rateLimit";

/**
 * /api/analyze のレートリミットを外部ストア（Upstash Redis の REST API）で数える実装。サーバー専用（node:crypto）。
 *
 * - 窓はメモリの実装（`createRateLimiter`）と同じ「最初のリクエストから windowMs の固定窓」。
 *   Lua スクリプト 1 回で INCR → 初回だけ PEXPIRE → PTTL を原子的に行い、回数が max を超えたら拒否する
 *   （Retry-After = 残りの TTL を秒に切り上げ、1 以上）。成否にかかわらず 1 リクエスト 1 回数える点も同じ。
 * - キーには生の IP / userId を置かない。`HMAC-SHA256(secret, "fuel_lens_rate_limit:v1:<バケツ名>:<キー>")` の
 *   base64url を使い、TTL は窓の長さ（期限が来れば消える）。
 * - 外部ストアが遅い・落ちているときは /api/analyze を止めない。タイムアウト（既定 300ms）や HTTP エラー・
 *   不正な応答なら、渡されたメモリのリミッタで数え、console に日本語で記録する（キー・IP は出さない）。
 *   失敗の直後はしばらく（既定 30 秒）外部ストアを呼ばずにメモリで数える（毎回タイムアウトを待たないため）。
 */

/** 外部ストアの接続先と、キーを変換する秘密 */
export type RedisRateLimitConfig = {
  /** REST API の URL（https） */
  url: string;
  /** REST API のトークン（書き込みできるもの） */
  token: string;
  /** キーの HMAC の鍵 */
  secret: string;
};

/** 外部ストアの設定に使う環境変数 */
export type RedisRateLimitEnv = {
  /** Upstash のコンソール、または Vercel の Marketplace 連携（接頭辞を UPSTASH_REDIS_REST にした場合）で入る名前 */
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  /** Vercel の Marketplace 連携（Upstash for Redis。既定の接頭辞 KV）で入る名前 */
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  /** キーの HMAC 専用の鍵（任意）。未設定なら TRIAL_COOKIE_SECRET を使う */
  RATE_LIMIT_KEY_SECRET?: string;
  TRIAL_COOKIE_SECRET?: string;
};

function nonEmpty(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * 環境変数から外部ストアの設定を読む。URL とトークンの組（UPSTASH_REDIS_REST_* を優先し、無ければ KV_REST_API_*）と
 * HMAC の鍵（RATE_LIMIT_KEY_SECRET、無ければ TRIAL_COOKIE_SECRET）がそろわなければ null（メモリの実装を使う）。
 * URL は https のものだけ受け付ける。
 */
export function redisRateLimitConfigFrom(env: RedisRateLimitEnv): RedisRateLimitConfig | null {
  const pairs: Array<[string | undefined, string | undefined]> = [
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
  ];
  const pair = pairs
    .map(([url, token]) => [nonEmpty(url), nonEmpty(token)] as const)
    .find(([url, token]) => url && token);
  const secret = nonEmpty(env.RATE_LIMIT_KEY_SECRET) ?? nonEmpty(env.TRIAL_COOKIE_SECRET);
  if (!pair || !secret) return null;
  const [url, token] = pair as readonly [string, string];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return { url: url.replace(/\/+$/, ""), token, secret };
}

/** 外部ストアに置くキー（生のキーは HMAC-SHA256 で変換し、元に戻せない値にする） */
export function redisRateLimitKey(secret: string, bucket: string, key: string): string {
  const digest = createHmac("sha256", secret).update(`fuel_lens_rate_limit:v1:${bucket}:${key}`).digest("base64url");
  return `fuel_lens:rl:${bucket}:${digest}`;
}

/**
 * INCR → 初回（または TTL が無いとき）だけ PEXPIRE → PTTL。戻り値は {回数, 残り ms}。
 * EVAL は 1 回のスクリプトとして原子的に実行される。
 */
export const RATE_LIMIT_LUA = [
  "local c = redis.call('INCR', KEYS[1])",
  "local t = redis.call('PTTL', KEYS[1])",
  "if c == 1 or t < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); t = tonumber(ARGV[1]) end",
  "return {c, t}",
].join("\n");

/** 外部ストアの呼び出しのタイムアウトの既定（ms） */
export const REDIS_RATE_LIMIT_TIMEOUT_MS = 300;
/** 失敗した後、外部ストアを呼ばずにメモリで数える時間の既定（ms） */
export const REDIS_RATE_LIMIT_COOLDOWN_MS = 30_000;

export type RedisRateLimiterOptions = {
  config: RedisRateLimitConfig;
  /** バケツ名（キーの接頭辞。例: "minute" / "trial-day"） */
  bucket: string;
  windowMs: number;
  max: number;
  /** 外部ストアが使えないときに数えるメモリのリミッタ（同じ windowMs / max のもの） */
  fallback: RateLimiter;
  timeoutMs?: number;
  cooldownMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
  /** 切り替えの記録（既定は console.warn）。キー・IP は渡さない */
  log?: (message: string) => void;
};

class RedisRateLimitError extends Error {}

/** 外部ストアで数えるリミッタ。失敗したら fallback（メモリ）で数える */
export function createRedisRateLimiter(options: RedisRateLimiterOptions): RateLimitConsumer {
  const { config, bucket, windowMs, max, fallback } = options;
  const timeoutMs = options.timeoutMs ?? REDIS_RATE_LIMIT_TIMEOUT_MS;
  const cooldownMs = options.cooldownMs ?? REDIS_RATE_LIMIT_COOLDOWN_MS;
  const doFetch = options.fetch ?? fetch;
  const clock = options.now ?? Date.now;
  const log = options.log ?? ((message: string) => console.warn(message));
  let skipUntil = 0;

  async function incr(key: string): Promise<{ count: number; ttlMs: number }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RedisRateLimitError("タイムアウト"));
      }, timeoutMs);
    });
    try {
      const request = (async () => {
        let res: Response;
        try {
          res = await doFetch(config.url, {
            method: "POST",
            headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
            body: JSON.stringify(["EVAL", RATE_LIMIT_LUA, "1", redisRateLimitKey(config.secret, bucket, key), String(windowMs)]),
            signal: controller.signal,
            cache: "no-store",
          });
        } catch {
          throw new RedisRateLimitError("接続できない");
        }
        if (!res.ok) throw new RedisRateLimitError(`HTTP ${res.status}`);
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          throw new RedisRateLimitError("応答を解釈できない");
        }
        const result = (body as { result?: unknown } | null)?.result;
        if (!Array.isArray(result) || result.length !== 2) throw new RedisRateLimitError("応答の形が不正");
        const [count, ttlMs] = result.map(Number);
        if (!Number.isInteger(count) || count < 1 || !Number.isFinite(ttlMs)) {
          throw new RedisRateLimitError("応答の形が不正");
        }
        return { count, ttlMs };
      })();
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async consume(key, at): Promise<RateLimitResult> {
      if (clock() >= skipUntil) {
        try {
          const { count, ttlMs } = await incr(key);
          if (count > max) {
            return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(Math.min(ttlMs, windowMs) / 1000)) };
          }
          return { allowed: true, retryAfterSec: 0 };
        } catch (error) {
          const reason = error instanceof RedisRateLimitError ? error.message : "不明なエラー";
          skipUntil = clock() + cooldownMs;
          log(
            `[rate-limit] 外部ストア（Upstash Redis）で回数を数えられませんでした（${reason}）。` +
              `${Math.round(cooldownMs / 1000)} 秒間はこのインスタンスのメモリで数えます（バケツ: ${bucket}）`
          );
        }
      }
      return fallback.consume(key, at);
    },
  };
}

/**
 * /api/analyze の 2 つのリミッタ（1 分間 5 回、お試しの IP ごとの 1 日 10 回）を作る。
 * 外部ストアが設定されていれば Redis で数え（障害時はメモリ）、未設定ならメモリの実装だけ（従来どおり）。
 */
export function createAnalyzeLimiters(
  env: RedisRateLimitEnv,
  options: Pick<RedisRateLimiterOptions, "fetch" | "now" | "log" | "timeoutMs" | "cooldownMs"> = {}
): { limiter: RateLimitConsumer; trialLimiter: RateLimitConsumer; store: "redis" | "memory" } {
  const memoryMinute = createRateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: MAX_REQUESTS_PER_WINDOW,
    maxKeys: MAX_RATE_LIMIT_KEYS,
    now: options.now,
  });
  const memoryDaily = createRateLimiter({
    windowMs: TRIAL_IP_WINDOW_MS,
    max: MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
    maxKeys: MAX_RATE_LIMIT_KEYS,
    now: options.now,
  });
  const config = redisRateLimitConfigFrom(env);
  if (!config) return { limiter: memoryMinute, trialLimiter: memoryDaily, store: "memory" };
  return {
    limiter: createRedisRateLimiter({
      ...options,
      config,
      bucket: "minute",
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      fallback: memoryMinute,
    }),
    trialLimiter: createRedisRateLimiter({
      ...options,
      config,
      bucket: "trial-day",
      windowMs: TRIAL_IP_WINDOW_MS,
      max: MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
      fallback: memoryDaily,
    }),
    store: "redis",
  };
}
