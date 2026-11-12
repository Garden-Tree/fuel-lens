import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "@/lib/server/analyze/rateLimit";
import {
  RATE_LIMIT_LUA,
  createAnalyzeLimiters,
  createRedisRateLimiter,
  redisRateLimitConfigFrom,
  redisRateLimitKey,
} from "@/lib/server/analyze/redisRateLimit";
import { handleAnalyze, type AnalyzeDeps } from "@/lib/server/analyze/handler";
import { encodeTrialCookie } from "@/lib/server/analyze/trialCookie";

const CONFIG = { url: "https://example-redis.upstash.io", token: "test-token", secret: "test-rate-secret" };
const IP = "203.0.113.5";

/**
 * Upstash の REST API（EVAL で RATE_LIMIT_LUA を実行する）を真似る fake。時計は注入。
 * 受け取ったリクエスト本文をすべて記録する。
 */
function fakeUpstash(clock: () => number) {
  const data = new Map<string, { count: number; expiresAt: number }>();
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toBe(CONFIG.url);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${CONFIG.token}`);
    const body = String(init?.body);
    bodies.push(body);
    const [cmd, script, numKeys, key, ttl] = JSON.parse(body) as string[];
    expect(cmd).toBe("EVAL");
    expect(script).toBe(RATE_LIMIT_LUA);
    expect(numKeys).toBe("1");
    const now = clock();
    let entry = data.get(key);
    if (entry && entry.expiresAt <= now) entry = undefined;
    if (!entry) {
      entry = { count: 0, expiresAt: now + Number(ttl) };
      data.set(key, entry);
    }
    entry.count++;
    return Response.json({ result: [entry.count, entry.expiresAt - now] });
  });
  return { fetch: fetchMock as unknown as typeof fetch, fetchMock, data, bodies };
}

function setup(overrides: { fetch?: typeof fetch; max?: number; windowMs?: number } = {}) {
  let t = 1_000_000;
  const clock = () => t;
  const upstash = fakeUpstash(clock);
  const windowMs = overrides.windowMs ?? 60_000;
  const max = overrides.max ?? 5;
  const fallback = createRateLimiter({ windowMs, max, maxKeys: 10_000, now: clock });
  const fallbackSpy = vi.spyOn(fallback, "consume");
  const log = vi.fn();
  const limiter = createRedisRateLimiter({
    config: CONFIG,
    bucket: "minute",
    windowMs,
    max,
    fallback,
    fetch: overrides.fetch ?? upstash.fetch,
    now: clock,
    log,
    timeoutMs: 20,
    cooldownMs: 30_000,
  });
  return { limiter, upstash, fallbackSpy, log, advance: (ms: number) => (t += ms) };
}

describe("redisRateLimitConfigFrom", () => {
  it("UPSTASH_REDIS_REST_* と KV_REST_API_* のどちらでも受け付ける（UPSTASH を優先）", () => {
    const secret = { TRIAL_COOKIE_SECRET: "s" };
    expect(
      redisRateLimitConfigFrom({ ...secret, KV_REST_API_URL: "https://kv.upstash.io/", KV_REST_API_TOKEN: "kt" })
    ).toEqual({ url: "https://kv.upstash.io", token: "kt", secret: "s" });
    expect(
      redisRateLimitConfigFrom({
        ...secret,
        UPSTASH_REDIS_REST_URL: "https://up.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "ut",
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kt",
      })
    ).toEqual({ url: "https://up.upstash.io", token: "ut", secret: "s" });
  });

  it("URL とトークンが同じ組でそろわないなら使わない", () => {
    expect(
      redisRateLimitConfigFrom({ TRIAL_COOKIE_SECRET: "s", UPSTASH_REDIS_REST_URL: "https://up.upstash.io", KV_REST_API_TOKEN: "kt" })
    ).toBeNull();
  });

  it("HMAC の鍵は RATE_LIMIT_KEY_SECRET を優先し、無ければ TRIAL_COOKIE_SECRET。どちらも無ければ使わない", () => {
    const conn = { KV_REST_API_URL: "https://kv.upstash.io", KV_REST_API_TOKEN: "kt" };
    expect(redisRateLimitConfigFrom({ ...conn, RATE_LIMIT_KEY_SECRET: "r", TRIAL_COOKIE_SECRET: "s" })?.secret).toBe("r");
    expect(redisRateLimitConfigFrom({ ...conn, RATE_LIMIT_KEY_SECRET: " ", TRIAL_COOKIE_SECRET: "s" })?.secret).toBe("s");
    expect(redisRateLimitConfigFrom(conn)).toBeNull();
  });

  it("https 以外の URL は使わない", () => {
    expect(
      redisRateLimitConfigFrom({ TRIAL_COOKIE_SECRET: "s", KV_REST_API_URL: "http://kv.upstash.io", KV_REST_API_TOKEN: "kt" })
    ).toBeNull();
    expect(redisRateLimitConfigFrom({ TRIAL_COOKIE_SECRET: "s", KV_REST_API_URL: "not a url", KV_REST_API_TOKEN: "kt" })).toBeNull();
  });
});

describe("redisRateLimitKey", () => {
  it("生のキーを含まず、鍵・バケツ・キーごとに変わる", () => {
    const k = redisRateLimitKey("s", "minute", `ip:${IP}`);
    expect(k).toMatch(/^fuel_lens:rl:minute:[A-Za-z0-9_-]{43}$/);
    expect(k).not.toContain(IP);
    expect(redisRateLimitKey("s", "minute", `ip:${IP}`)).toBe(k);
    expect(redisRateLimitKey("other", "minute", `ip:${IP}`)).not.toBe(k);
    expect(redisRateLimitKey("s", "trial-day", `ip:${IP}`)).not.toBe(k);
    expect(redisRateLimitKey("s", "minute", "ip:198.51.100.9")).not.toBe(k);
  });
});

describe("createRedisRateLimiter", () => {
  it("外部ストアで max 回まで許可し、超えたら残りの TTL を Retry-After にする（固定窓）", async () => {
    const { limiter, upstash, fallbackSpy, advance } = setup();
    for (let i = 0; i < 5; i++) {
      expect(await limiter.consume("user:a")).toEqual({ allowed: true, retryAfterSec: 0 });
    }
    advance(10_500);
    expect(await limiter.consume("user:a")).toEqual({ allowed: false, retryAfterSec: 50 });
    // 別のキーは独立
    expect((await limiter.consume("user:b")).allowed).toBe(true);
    // 窓が過ぎれば数え直し
    advance(49_500);
    expect((await limiter.consume("user:a")).allowed).toBe(true);
    expect(upstash.fetchMock).toHaveBeenCalledTimes(8);
    expect(fallbackSpy).not.toHaveBeenCalled();
  });

  it("TTL を窓の長さで渡す（1 日の窓なら 86400000ms）", async () => {
    const { limiter, upstash } = setup({ windowMs: 24 * 60 * 60 * 1000, max: 10 });
    await limiter.consume(`ip:${IP}`);
    expect(JSON.parse(upstash.bodies[0])[4]).toBe("86400000");
  });

  it("外部ストアに送る本文・キーに生の IP / userId が入らない", async () => {
    const { limiter, upstash } = setup();
    await limiter.consume(`ip:${IP}`);
    await limiter.consume("user:user_2abcDEF");
    for (const body of upstash.bodies) {
      expect(body).not.toContain(IP);
      expect(body).not.toContain("user_2abcDEF");
    }
    expect([...upstash.data.keys()]).toEqual([
      redisRateLimitKey(CONFIG.secret, "minute", `ip:${IP}`),
      redisRateLimitKey(CONFIG.secret, "minute", "user:user_2abcDEF"),
    ]);
  });

  it("HTTP エラーならメモリで数え、IP を含まない日本語のログを残す。しばらくは外部ストアを呼ばない", async () => {
    const failing = vi.fn(async () => new Response("ERR", { status: 500 }));
    const { limiter, fallbackSpy, log, advance } = setup({ fetch: failing as unknown as typeof fetch });
    expect(await limiter.consume(`ip:${IP}`)).toEqual({ allowed: true, retryAfterSec: 0 });
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("HTTP 500");
    expect(log.mock.calls[0][0]).toContain("メモリで数えます");
    expect(JSON.stringify(log.mock.calls)).not.toContain(IP);

    // クールダウン中は外部ストアを呼ばず、メモリで上限まで数える
    for (let i = 0; i < 4; i++) await limiter.consume(`ip:${IP}`);
    expect(await limiter.consume(`ip:${IP}`)).toEqual({ allowed: false, retryAfterSec: 60 });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);

    // クールダウンが明けたら再び外部ストアを試す
    advance(30_000);
    await limiter.consume(`ip:${IP}`);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("タイムアウトしたらメモリで数える（リクエストは中断する）", async () => {
    let aborted = false;
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        })
    );
    const { limiter, fallbackSpy, log } = setup({ fetch: hanging as unknown as typeof fetch });
    expect((await limiter.consume("user:a")).allowed).toBe(true);
    expect(aborted).toBe(true);
    expect(fallbackSpy).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain("タイムアウト");
  });

  it("接続できない・応答の形が不正でもメモリで数える", async () => {
    for (const fetchImpl of [
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => Response.json({ error: "ERR something" }),
      async () => new Response("not json"),
    ]) {
      const { limiter, fallbackSpy, log } = setup({ fetch: vi.fn(fetchImpl) as unknown as typeof fetch });
      expect((await limiter.consume("user:a")).allowed).toBe(true);
      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
    }
  });
});

describe("createAnalyzeLimiters", () => {
  it("外部ストアが未設定ならメモリの実装（同期）を使う", () => {
    const { store, limiter } = createAnalyzeLimiters({ TRIAL_COOKIE_SECRET: "s" });
    expect(store).toBe("memory");
    expect(limiter.consume("user:a")).toEqual({ allowed: true, retryAfterSec: 0 });
  });

  it("設定されていれば外部ストアで数える", async () => {
    const upstash = fakeUpstash(() => 0);
    const { store, limiter, trialLimiter } = createAnalyzeLimiters(
      { KV_REST_API_URL: CONFIG.url, KV_REST_API_TOKEN: CONFIG.token, RATE_LIMIT_KEY_SECRET: CONFIG.secret },
      { fetch: upstash.fetch }
    );
    expect(store).toBe("redis");
    await limiter.consume("user:a");
    await trialLimiter.consume(`ip:${IP}`);
    expect([...upstash.data.keys()]).toEqual([
      redisRateLimitKey(CONFIG.secret, "minute", "user:a"),
      redisRateLimitKey(CONFIG.secret, "trial-day", `ip:${IP}`),
    ]);
    expect(JSON.parse(upstash.bodies[1])[4]).toBe(String(24 * 60 * 60 * 1000));
  });
});

describe("handleAnalyze with the Redis limiters", () => {
  const SECRET = "test-trial-secret";
  const JPEG_B64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(28)]).toString("base64");
  const GOOD_JSON = JSON.stringify({ date: "2026-10-03", fuel_amount: 40, total_cost: 6800, total_distance: 512.3 });

  function makeReq(headers: Record<string, string> = {}) {
    return new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost", origin: "http://localhost", ...headers },
      body: JSON.stringify({ image: JPEG_B64 }),
    });
  }

  function deps(fetchImpl: typeof fetch, userId: string | null): AnalyzeDeps {
    const { limiter, trialLimiter } = createAnalyzeLimiters(
      { KV_REST_API_URL: CONFIG.url, KV_REST_API_TOKEN: CONFIG.token, TRIAL_COOKIE_SECRET: SECRET },
      { fetch: fetchImpl, now: () => 0, log: () => {} }
    );
    return {
      auth: async () => ({ userId }),
      gemini: (async () => ({ text: GOOD_JSON })) as unknown as AnalyzeDeps["gemini"],
      env: { GEMINI_API_KEY: "k", TRIAL_COOKIE_SECRET: SECRET },
      limiter,
      trialLimiter,
      now: () => 0,
      sleep: async () => {},
      log: () => {},
      newRequestId: () => "req00001",
    };
  }

  it("1 分間 6 回目は 429 RATE_LIMITED と Retry-After（応答は従来どおり）", async () => {
    const d = deps(fakeUpstash(() => 0).fetch, "user_1");
    for (let i = 0; i < 5; i++) expect((await handleAnalyze(makeReq(), d)).status).toBe(200);
    const res = await handleAnalyze(makeReq(), d);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).code).toBe("RATE_LIMITED");
  });

  it("お試しの IP ごとの 1 日 11 回目は 429 TRIAL_IP_LIMITED。外部ストアに生の IP は届かない", async () => {
    const upstash = fakeUpstash(() => 0);
    const d = deps(upstash.fetch, null);
    // 1 分間の上限に掛からないよう、IP の 1 日の上限だけを見るため毎回 X-Forwarded-For の先頭は同じ・Cookie は 0 回
    const cookie = `fuel_lens_trial=${encodeTrialCookie(0, SECRET)}`;
    let last: Response | undefined;
    for (let i = 0; i < 11; i++) {
      // 1 分間の窓を飛ばすため、1 分間のキーだけ消す
      for (const key of upstash.data.keys()) if (key.startsWith("fuel_lens:rl:minute:")) upstash.data.delete(key);
      last = await handleAnalyze(makeReq({ "x-forwarded-for": IP, cookie }), d);
      if (i < 10) expect(last.status).toBe(200);
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBe(String(24 * 60 * 60));
    expect((await last?.json()).code).toBe("TRIAL_IP_LIMITED");
    for (const body of upstash.bodies) expect(body).not.toContain(IP);
  });

  it("外部ストアが落ちていても 200 を返す（メモリで数える）", async () => {
    const down = vi.fn(async () => new Response("down", { status: 503 }));
    const d = deps(down as unknown as typeof fetch, "user_1");
    expect((await handleAnalyze(makeReq(), d)).status).toBe(200);
  });
});
