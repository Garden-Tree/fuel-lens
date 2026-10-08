import { describe, expect, it } from "vitest";
import { createAnonymousQuota, createRateLimiter } from "@/lib/server/analyze/rateLimit";

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

describe("createAnonymousQuota", () => {
  it("is exceeded only after max recorded scans", () => {
    const quota = createAnonymousQuota({ max: 3, maxKeys: 100 });
    expect(quota.max).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(quota.isExceeded("1.1.1.1")).toBe(false);
      quota.record("1.1.1.1");
    }
    expect(quota.isExceeded("1.1.1.1")).toBe(true);
    expect(quota.isExceeded("2.2.2.2")).toBe(false);
  });

  it("resets the store once it grows past maxKeys", () => {
    const store = new Map<string, number>();
    const quota = createAnonymousQuota({ max: 1, maxKeys: 2, store });
    quota.record("a");
    quota.record("b");
    quota.record("c"); // size 3 > 2 になるのは次の record の冒頭
    expect(store.size).toBe(3);
    quota.record("d");
    expect([...store.keys()]).toEqual(["d"]);
    expect(quota.isExceeded("a")).toBe(false);
  });
});
