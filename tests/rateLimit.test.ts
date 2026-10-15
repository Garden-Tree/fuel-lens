import { describe, expect, it } from "vitest";
import {
  MAX_TRIAL_REQUESTS_PER_IP_PER_DAY,
  TRIAL_IP_WINDOW_MS,
  clientIpOf,
  createRateLimiter,
} from "@/lib/server/analyze/rateLimit";

function makeLimiter(overrides: Partial<Parameters<typeof createRateLimiter>[0]> = {}) {
  let t = 1_000_000;
  const store = new Map<string, { count: number; firstRequest: number }>();
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 5,
    maxKeys: 10_000,
    now: () => t,
    store,
    ...overrides,
  });
  return {
    limiter,
    store,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows up to max requests per window, then blocks", () => {
    const { limiter } = makeLimiter();
    for (let i = 0; i < 5; i++) {
      expect(limiter.consume("user:a")).toEqual({ allowed: true, retryAfterSec: 0 });
    }
    expect(limiter.consume("user:a").allowed).toBe(false);
  });

  it("counts keys independently", () => {
    const { limiter } = makeLimiter({ max: 1 });
    expect(limiter.consume("user:a").allowed).toBe(true);
    expect(limiter.consume("user:b").allowed).toBe(true);
    expect(limiter.consume("user:a").allowed).toBe(false);
  });

  it("reports retryAfterSec rounded up to seconds and at least 1", () => {
    const { limiter, advance } = makeLimiter({ max: 1 });
    limiter.consume("k");
    advance(10_500);
    // 残り 49.5 秒 -> 50
    expect(limiter.consume("k")).toEqual({ allowed: false, retryAfterSec: 50 });
    advance(49_400); // 経過 59.9 秒 -> 残り 0.1 秒 -> 1
    expect(limiter.consume("k")).toEqual({ allowed: false, retryAfterSec: 1 });
  });

  it("starts a new window only after windowMs has fully elapsed", () => {
    const { limiter, advance } = makeLimiter({ max: 1 });
    limiter.consume("k");
    advance(60_000); // ちょうど windowMs: まだ同じウィンドウ（> で判定）
    expect(limiter.consume("k").allowed).toBe(false);
    advance(1);
    expect(limiter.consume("k").allowed).toBe(true);
  });

  it("uses the explicit timestamp when given", () => {
    const { limiter } = makeLimiter({ max: 1 });
    expect(limiter.consume("k", 0).allowed).toBe(true);
    expect(limiter.consume("k", 30_000)).toEqual({ allowed: false, retryAfterSec: 30 });
    expect(limiter.consume("k", 60_001).allowed).toBe(true);
  });

  it("drops expired keys on each consume", () => {
    const { limiter, store, advance } = makeLimiter();
    limiter.consume("old");
    advance(61_000);
    limiter.consume("new");
    expect([...store.keys()]).toEqual(["new"]);
  });

  it("clears everything when the key cap is exceeded", () => {
    const { limiter, store } = makeLimiter({ maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) limiter.consume(k);
    expect(store.size).toBe(4); // 追加後に超過（クリアは次回の consume 冒頭）
    limiter.consume("e");
    expect([...store.keys()]).toEqual(["e"]);
  });
});


describe("trial IP bucket (24h window, 10 requests)", () => {
  it("uses the production defaults", () => {
    expect(TRIAL_IP_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(MAX_TRIAL_REQUESTS_PER_IP_PER_DAY).toBe(10);
  });

  it("allows 10 requests per IP per day, then blocks until the window ends", () => {
    const { limiter, advance } = makeLimiter({ windowMs: TRIAL_IP_WINDOW_MS, max: MAX_TRIAL_REQUESTS_PER_IP_PER_DAY });
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume("ip:203.0.113.5").allowed).toBe(true);
      advance(60_000);
    }
    const blocked = limiter.consume("ip:203.0.113.5");
    expect(blocked.allowed).toBe(false);
    // 最初のリクエストから 24 時間（ここまでに 10 分経過）
    expect(blocked.retryAfterSec).toBe(24 * 60 * 60 - 10 * 60);
    // 別の IP は独立
    expect(limiter.consume("ip:198.51.100.9").allowed).toBe(true);
    advance(TRIAL_IP_WINDOW_MS);
    expect(limiter.consume("ip:203.0.113.5").allowed).toBe(true);
  });
});

describe("clientIpOf", () => {
  const h = (init: Record<string, string>) => new Headers(init);

  it("uses the first X-Forwarded-For entry", () => {
    expect(clientIpOf(h({ "x-forwarded-for": " 203.0.113.5 , 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.5");
  });

  it("falls back to X-Real-IP, then to \"unknown\"", () => {
    expect(clientIpOf(h({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIpOf(h({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
    expect(clientIpOf(h({}))).toBe("unknown");
  });
});
