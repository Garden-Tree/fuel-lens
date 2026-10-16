import { describe, expect, it, vi } from "vitest";
import { handleAnalyze, type AnalyzeDeps } from "@/lib/server/analyze/handler";
import { GeminiCallError } from "@/lib/server/analyze/errors";
import { createRateLimiter } from "@/lib/server/analyze/rateLimit";
import { encodeTrialCookie } from "@/lib/server/analyze/trialCookie";

// ---------------------------------------------------------------------------
// fixtures: 先頭バイトにマジックナンバーを持つ 32 バイトのダミー画像（tests/analyze.test.ts と同じ作り）
// ---------------------------------------------------------------------------

function padTo32(head: number[]): Buffer {
  return Buffer.concat([Buffer.from(head), Buffer.alloc(32 - head.length)]);
}

const JPEG_B64 = padTo32([0xff, 0xd8, 0xff, 0xe0]).toString("base64");
const PNG_B64 = padTo32([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
const GIF_B64 = padTo32([...Buffer.from("GIF89a")]).toString("base64");

const GOOD_JSON = JSON.stringify({
  date: "2026-10-03",
  fuel_amount: 40,
  total_cost: 6800,
  price_per_unit: 999,
  total_distance: 512.3,
  odometer: 45210,
  gas_station: "テスト石油",
  fuel_type: "regular",
  confidence: { fuel_amount: 0.9 },
});

const NOW = 1_000_000;
const SECRET = "test-trial-secret";
const IP_A = { "x-forwarded-for": "203.0.113.5, 10.0.0.1" };
const cookieFor = (count: number) => `other=1; fuel_lens_trial=${encodeTrialCookie(count, SECRET)}`;
const looseLimiter = () => createRateLimiter({ windowMs: 60_000, max: 100, maxKeys: 10_000, now: () => NOW });

type GeminiMock = ReturnType<typeof vi.fn>;

function makeDeps(overrides: Partial<AnalyzeDeps> = {}) {
  const gemini: GeminiMock = vi.fn(async () => ({ text: GOOD_JSON }));
  const log = vi.fn();
  const deps: AnalyzeDeps = {
    auth: async () => ({ userId: "user_1" }),
    gemini: gemini as unknown as AnalyzeDeps["gemini"],
    env: { GEMINI_API_KEY: "test-key" },
    limiter: createRateLimiter({ windowMs: 60_000, max: 5, maxKeys: 10_000, now: () => NOW }),
    trialLimiter: createRateLimiter({ windowMs: 24 * 60 * 60 * 1000, max: 10, maxKeys: 10_000, now: () => NOW }),
    now: () => NOW,
    sleep: async () => {},
    log,
    newRequestId: () => "req00001",
    ...overrides,
  };
  return { deps, gemini, log };
}

function makeReq(body: unknown, headers: Record<string, string> = {}, raw = false) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

const goodBody = { image: `data:image/jpeg;base64,${JPEG_B64}` };

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const json = await res.json();
  expect(json.code).toBe(code);
  expect(json.requestId).toBe("req00001");
  expect(typeof json.error).toBe("string");
  return json;
}

describe("handleAnalyze", () => {
  it("rejects a mismatched Origin with 403 before authenticating", async () => {
    const auth = vi.fn(async () => ({ userId: "user_1" }));
    const { deps, gemini } = makeDeps({ auth });
    const res = await handleAnalyze(makeReq(goodBody, { origin: "https://evil.example" }), deps);
    await expectError(res, 403, "ORIGIN_MISMATCH");
    expect(auth).not.toHaveBeenCalled();
    expect(gemini).not.toHaveBeenCalled();
  });

  it("accepts a matching Origin and one allowed via NEXT_PUBLIC_APP_URL", async () => {
    const { deps } = makeDeps();
    expect((await handleAnalyze(makeReq(goodBody, { origin: "http://localhost" }), deps)).status).toBe(200);
    const { deps: deps2 } = makeDeps({
      env: { GEMINI_API_KEY: "k", NEXT_PUBLIC_APP_URL: "https://fuel.example.com" },
    });
    const res = await handleAnalyze(makeReq(goodBody, { origin: "https://fuel.example.com" }), deps2);
    expect(res.status).toBe(200);
  });

  it("returns 401 for unauthenticated requests when anonymous scan is off", async () => {
    const { deps, gemini } = makeDeps({ auth: async () => ({ userId: null }) });
    const res = await handleAnalyze(makeReq(goodBody), deps);
    await expectError(res, 401, "AUTH_REQUIRED");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("ignores the trial cookie when TRIAL_COOKIE_SECRET is unset (401, no trial header)", async () => {
    const { deps, gemini } = makeDeps({ auth: async () => ({ userId: null }) });
    const res = await handleAnalyze(
      makeReq(goodBody, { cookie: `fuel_lens_trial=${encodeTrialCookie(0, "whatever")}` }),
      deps
    );
    await expectError(res, 401, "AUTH_REQUIRED");
    expect(res.headers.get("X-Trial-Remaining")).toBeNull();
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(gemini).not.toHaveBeenCalled();
  });

  it("returns 200 for logged-in users without touching the trial cookie or the IP bucket", async () => {
    const trialLimiter = { consume: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })) };
    const { deps } = makeDeps({ env: { GEMINI_API_KEY: "k", TRIAL_COOKIE_SECRET: SECRET }, trialLimiter });
    const res = await handleAnalyze(makeReq(goodBody, { cookie: cookieFor(3) }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    expect(res.headers.get("X-Trial-Remaining")).toBeNull();
    expect(trialLimiter.consume).not.toHaveBeenCalled();
  });

  describe("anonymous trial (TRIAL_COOKIE_SECRET set)", () => {
    function trialDeps(overrides: Partial<AnalyzeDeps> = {}) {
      return makeDeps({
        auth: async () => ({ userId: null }),
        env: { GEMINI_API_KEY: "k", TRIAL_COOKIE_SECRET: SECRET },
        limiter: looseLimiter(), // お試しの検証なので 1 分間の上限は緩める
        ...overrides,
      });
    }

    it("allows uses 1-3, increments the signed cookie and reports the remaining count; the 4th is 401 TRIAL_EXHAUSTED", async () => {
      const { deps, gemini } = trialDeps();
      let cookie: string | null = null;
      for (let used = 1; used <= 3; used++) {
        const res = await handleAnalyze(makeReq(goodBody, { ...IP_A, ...(cookie ? { cookie } : {}) }), deps);
        expect(res.status).toBe(200);
        expect(res.headers.get("X-Trial-Remaining")).toBe(String(3 - used));
        const setCookie = res.headers.get("Set-Cookie") ?? "";
        expect(setCookie).toContain(`fuel_lens_trial=${encodeTrialCookie(used, SECRET)}`);
        expect(setCookie).toMatch(/HttpOnly/);
        expect(setCookie).toMatch(/SameSite=Lax/);
        expect(setCookie).toMatch(/Max-Age=15552000/);
        expect(setCookie).toMatch(/Path=\//);
        expect(setCookie).not.toMatch(/Secure/); // 本番（NODE_ENV=production）以外
        cookie = setCookie.split(";")[0];
      }
      const blocked = await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: cookie ?? "" }), deps);
      const json = await expectError(blocked, 401, "TRIAL_EXHAUSTED");
      expect(json.error).toBe("お試しの読み取りは3回までです。ログインすると続けて使えます");
      expect(blocked.headers.get("X-Trial-Remaining")).toBe("0");
      expect(blocked.headers.get("Set-Cookie")).toBeNull();
      expect(gemini).toHaveBeenCalledTimes(3);
    });

    it("sets Secure on the cookie in production", async () => {
      const { deps } = trialDeps({ env: { GEMINI_API_KEY: "k", TRIAL_COOKIE_SECRET: SECRET, NODE_ENV: "production" } });
      const res = await handleAnalyze(makeReq(goodBody, IP_A), deps);
      expect(res.headers.get("Set-Cookie")).toMatch(/; Secure$/);
    });

    it("never trusts client-provided counts (request headers are ignored)", async () => {
      const { deps } = trialDeps();
      const res = await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: cookieFor(3), "x-trial-remaining": "3" }), deps);
      await expectError(res, 401, "TRIAL_EXHAUSTED");
    });

    it("treats a tampered or malformed cookie as a new device, but the per-IP daily cap still applies", async () => {
      const { deps, gemini } = trialDeps();
      const forged = `fuel_lens_trial=0.${"A".repeat(43)}`;
      const otherSecret = `fuel_lens_trial=${encodeTrialCookie(0, "another-secret")}`;
      const garbage = "fuel_lens_trial=%%%";
      const cookies = [forged, otherSecret, garbage];
      for (let i = 0; i < 10; i++) {
        const res = await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: cookies[i % 3] }), deps);
        expect(res.status).toBe(200);
        expect(res.headers.get("X-Trial-Remaining")).toBe("2"); // 毎回 0 回目として数え直される
      }
      const capped = await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: forged }), deps);
      const json = await expectError(capped, 429, "TRIAL_IP_LIMITED");
      expect(json.error).toContain("ログイン");
      expect(capped.headers.get("Retry-After")).toBe(String(24 * 60 * 60));
      expect(capped.headers.get("X-Trial-Remaining")).toBe("3");
      expect(gemini).toHaveBeenCalledTimes(10);
      // 別の IP は影響を受けない。X-Real-IP にもフォールバックする
      expect((await handleAnalyze(makeReq(goodBody, { "x-real-ip": "198.51.100.9" }), deps)).status).toBe(200);
    });

    it("keys the IP cap by the first X-Forwarded-For entry and counts failed requests too", async () => {
      const { deps, gemini } = trialDeps();
      gemini.mockRejectedValue(new GeminiCallError("upstream", 500, new Error("boom")));
      for (let i = 0; i < 10; i++) {
        const res = await handleAnalyze(makeReq(goodBody, { "x-forwarded-for": `203.0.113.5, 10.0.0.${i}` }), deps);
        expect(res.status).toBe(502);
        expect(res.headers.get("Set-Cookie")).toBeNull(); // 失敗はお試しの回数に数えない
        expect(res.headers.get("X-Trial-Remaining")).toBe("3");
      }
      await expectError(
        await handleAnalyze(makeReq(goodBody, { "x-forwarded-for": "203.0.113.5" }), deps),
        429,
        "TRIAL_IP_LIMITED"
      );
    });

    it("does not count an exhausted cookie against the IP cap", async () => {
      const trialLimiter = { consume: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })) };
      const { deps } = trialDeps({ trialLimiter });
      await expectError(await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: cookieFor(3) }), deps), 401, "TRIAL_EXHAUSTED");
      expect(trialLimiter.consume).not.toHaveBeenCalled();
    });

    it("applies the per-minute limit per IP before the daily cap (429 RATE_LIMITED)", async () => {
      const { deps } = trialDeps({
        limiter: createRateLimiter({ windowMs: 60_000, max: 5, maxKeys: 10_000, now: () => NOW }),
      });
      for (let i = 0; i < 5; i++) {
        expect((await handleAnalyze(makeReq(goodBody, IP_A), deps)).status).toBe(200);
      }
      const res = await handleAnalyze(makeReq(goodBody, IP_A), deps);
      await expectError(res, 429, "RATE_LIMITED");
      expect(res.headers.get("X-Trial-Remaining")).toBe("3");
    });

    it("does not count a 422 NOTHING_EXTRACTED against the trial", async () => {
      const { deps, gemini } = trialDeps();
      gemini.mockResolvedValue({ text: JSON.stringify({ date: "2026-10-03", gas_station: "x" }) });
      const res = await handleAnalyze(makeReq(goodBody, { ...IP_A, cookie: cookieFor(2) }), deps);
      await expectError(res, 422, "NOTHING_EXTRACTED");
      expect(res.headers.get("Set-Cookie")).toBeNull();
      expect(res.headers.get("X-Trial-Remaining")).toBe("1");
    });

    it("does not log the client IP", async () => {
      const blocked = { consume: () => ({ allowed: false, retryAfterSec: 5 }) };
      const minute = trialDeps({ limiter: blocked });
      await expectError(await handleAnalyze(makeReq(goodBody, IP_A), minute.deps), 429, "RATE_LIMITED");
      const daily = trialDeps({ trialLimiter: blocked });
      await expectError(await handleAnalyze(makeReq(goodBody, IP_A), daily.deps), 429, "TRIAL_IP_LIMITED");
      for (const { log } of [minute, daily]) {
        expect(log).toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain("203.0.113.5");
      }
    });
  });

  it("returns 429 with Retry-After once the per-user rate limit is exceeded", async () => {
    const { deps } = makeDeps();
    for (let i = 0; i < 5; i++) {
      expect((await handleAnalyze(makeReq(goodBody), deps)).status).toBe(200);
    }
    const res = await handleAnalyze(makeReq(goodBody), deps);
    await expectError(res, 429, "RATE_LIMITED");
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("returns 500 SERVER_MISCONFIGURED when GEMINI_API_KEY is missing", async () => {
    const { deps, gemini } = makeDeps({ env: {} });
    const res = await handleAnalyze(makeReq(goodBody), deps);
    await expectError(res, 500, "SERVER_MISCONFIGURED");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("returns 413 when Content-Length exceeds 4MB, before reading the body", async () => {
    const { deps } = makeDeps();
    const res = await handleAnalyze(makeReq(goodBody, { "content-length": String(4 * 1024 * 1024 + 1) }), deps);
    await expectError(res, 413, "PAYLOAD_TOO_LARGE");
  });

  it("returns 400 INVALID_JSON for unparseable bodies", async () => {
    const { deps } = makeDeps();
    const res = await handleAnalyze(makeReq("{not json", {}, true), deps);
    await expectError(res, 400, "INVALID_JSON");
  });

  it("returns 400 INVALID_BODY for non-object JSON", async () => {
    const { deps } = makeDeps({ limiter: looseLimiter() });
    await expectError(await handleAnalyze(makeReq([1, 2]), deps), 400, "INVALID_BODY");
    await expectError(await handleAnalyze(makeReq(null), deps), 400, "INVALID_BODY");
  });

  it("returns 400 INVALID_IMAGE when the image is missing or malformed", async () => {
    const { deps } = makeDeps({ limiter: looseLimiter() });
    await expectError(await handleAnalyze(makeReq({}), deps), 400, "INVALID_IMAGE");
    await expectError(await handleAnalyze(makeReq({ image: "***not base64***" }), deps), 400, "INVALID_IMAGE");
  });

  it("returns 415 INVALID_IMAGE for non-JPEG/PNG/WebP content", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    await expectError(await handleAnalyze(makeReq({ image: GIF_B64 }), deps), 415, "INVALID_IMAGE");
    await expectError(
      await handleAnalyze(makeReq({ image: `data:text/plain;base64,${JPEG_B64}` }), deps),
      415,
      "INVALID_IMAGE"
    );
    expect(gemini).not.toHaveBeenCalled();
  });

  it("accepts PNG and the legacy imageBase64 field", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    expect((await handleAnalyze(makeReq({ image: PNG_B64 }), deps)).status).toBe(200);
    expect(gemini.mock.calls[0][0].mimeType).toBe("image/png");
    expect((await handleAnalyze(makeReq({ imageBase64: JPEG_B64 }), deps)).status).toBe(200);
  });

  it("returns 200 with sanitized data, recalculated unit price and requestId (no warnings key when clean)", async () => {
    const { deps, gemini } = makeDeps({ env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "my-model" } });
    const res = await handleAnalyze(makeReq(goodBody), deps);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      date: "2026-10-03",
      fuel_amount: 40,
      total_cost: 6800,
      price_per_unit: 170, // 6800 / 40 で再計算（AI の 999 は捨てる）
      total_distance: 512.3,
      odometer: 45210,
      gas_station: "テスト石油",
      fuel_type: "regular",
      requestId: "req00001",
    });
    expect("warnings" in json).toBe(false);
    expect(gemini).toHaveBeenCalledWith({
      apiKey: "test-key",
      model: "my-model",
      base64: JPEG_B64,
      mimeType: "image/jpeg",
    });
  });

  it("uses the default model when GEMINI_MODEL is unset", async () => {
    const { deps, gemini } = makeDeps();
    await handleAnalyze(makeReq(goodBody), deps);
    expect(gemini.mock.calls[0][0].model).toBe("gemini-3.1-flash-lite");
  });

  it("includes plausibility warnings as { code, message }", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockResolvedValue({
      text: JSON.stringify({ fuel_amount: 10, total_cost: 1700, total_distance: 2500, fuel_type: null }),
    });
    const res = await handleAnalyze(makeReq(goodBody), deps);
    expect(res.status).toBe(200);
    const json = await res.json();
    const codes = json.warnings.map((w: { code: string }) => w.code);
    expect(codes).toContain("DISTANCE_TOO_LARGE");
    for (const w of json.warnings) {
      expect(typeof w.message).toBe("string");
    }
    expect(json.requestId).toBe("req00001");
  });

  it("returns 422 NOTHING_EXTRACTED when no core value is read", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockResolvedValue({ text: JSON.stringify({ date: "2026-10-03", gas_station: "x" }) });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 422, "NOTHING_EXTRACTED");
  });

  it("maps an empty Gemini response to 422 BLOCKED or 502 UPSTREAM_EMPTY", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockResolvedValueOnce({ text: undefined, blockReason: "SAFETY" });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 422, "BLOCKED");
    gemini.mockResolvedValueOnce({ text: undefined, finishReason: "STOP" });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_EMPTY");
  });

  it("maps invalid Gemini output to 502", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockResolvedValueOnce({ text: "not json" });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_INVALID_JSON");
    gemini.mockResolvedValueOnce({ text: "[1,2]" });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_INVALID_SHAPE");
  });

  it("maps classified upstream errors to 429 / 504 / 502 without leaking details", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });

    gemini.mockRejectedValueOnce(new GeminiCallError("quota", 429, new Error("secret quota detail")));
    const quota = await handleAnalyze(makeReq(goodBody), deps);
    const quotaJson = await expectError(quota, 429, "UPSTREAM_QUOTA");
    expect(quota.headers.get("Retry-After")).toBe("30");
    expect(JSON.stringify(quotaJson)).not.toContain("secret");

    gemini.mockRejectedValueOnce(new GeminiCallError("timeout", undefined, new Error("deadline")));
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 504, "UPSTREAM_TIMEOUT");

    gemini.mockRejectedValue(new GeminiCallError("upstream", 500, new Error("secret 500")));
    const upstream = await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_ERROR");
    expect(JSON.stringify(upstream)).not.toContain("secret");

    // 分類されていない例外も 502 に寄せる
    gemini.mockReset();
    gemini.mockRejectedValueOnce(new Error("unclassified"));
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_ERROR");
  });

  it("returns 500 INTERNAL_ERROR when auth() throws", async () => {
    const { deps, log } = makeDeps({
      auth: async () => {
        throw new Error("clerk down");
      },
    });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 500, "INTERNAL_ERROR");
    expect(log).toHaveBeenCalledWith("error", "[analyze req00001]", "Unexpected error:", expect.any(Error));
  });

  describe("transient upstream errors: retry and fallback", () => {
    const e503 = () => new GeminiCallError("upstream", 503, new Error("secret high demand body"));
    const models = (g: GeminiMock) => g.mock.calls.map((c) => (c[0] as { model: string }).model);

    it("retries the primary model once after a 503 and succeeds", async () => {
      const sleep = vi.fn(async () => {});
      const { deps, gemini, log } = makeDeps({ sleep, random: () => 0.5 });
      gemini.mockRejectedValueOnce(e503());
      const res = await handleAnalyze(makeReq(goodBody), deps);
      expect(res.status).toBe(200);
      expect(models(gemini)).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-flash-lite"]);
      expect(sleep).toHaveBeenCalledTimes(1);
      const ms = (sleep.mock.calls[0] as unknown as [number])[0];
      expect(ms).toBeGreaterThanOrEqual(800);
      expect(ms).toBeLessThanOrEqual(1500);
      expect(log).toHaveBeenCalledWith("warn", "[analyze req00001]", expect.stringContaining("attempt 1 failed (upstream, status=503"));
    });

    it("falls back to the fallback model after two transient failures", async () => {
      const { deps, gemini, log } = makeDeps();
      gemini.mockRejectedValueOnce(e503()).mockRejectedValueOnce(e503());
      const res = await handleAnalyze(makeReq(goodBody), deps);
      expect(res.status).toBe(200);
      expect(models(gemini)).toEqual(["gemini-3.1-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash"]);
      expect(log).toHaveBeenCalledWith("log", "[analyze req00001]", "succeeded with fallback model gemini-2.5-flash");
    });

    it("uses GEMINI_FALLBACK_MODEL and counts one rate-limit hit for all attempts", async () => {
      const limiter = { consume: vi.fn(() => ({ allowed: true, retryAfterSec: 0 })) };
      const { deps, gemini } = makeDeps({
        env: { GEMINI_API_KEY: "k", GEMINI_FALLBACK_MODEL: "custom-fb" },
        limiter,
      });
      gemini.mockRejectedValueOnce(e503()).mockRejectedValueOnce(e503());
      expect((await handleAnalyze(makeReq(goodBody), deps)).status).toBe(200);
      expect(models(gemini)[2]).toBe("custom-fb");
      expect(limiter.consume).toHaveBeenCalledTimes(1);
    });

    it("returns the overload message with requestId and no body leak when every attempt fails with 503", async () => {
      const { deps, gemini } = makeDeps();
      gemini.mockRejectedValue(e503());
      const res = await handleAnalyze(makeReq(goodBody), deps);
      const json = await expectError(res, 502, "UPSTREAM_ERROR");
      expect(gemini).toHaveBeenCalledTimes(3);
      expect(json.error).toBe("AIが混み合っています。少し時間をおいてもう一度お試しください。");
      expect(JSON.stringify(json)).not.toMatch(/secret|gemini/i);
    });

    it("does not retry quota, timeout, 4xx or unclassified errors", async () => {
      for (const err of [
        new GeminiCallError("quota", 429, new Error("q")),
        new GeminiCallError("timeout", undefined, new Error("t")),
        new GeminiCallError("upstream", 400, new Error("bad")),
        new Error("unclassified"),
      ]) {
        const { deps, gemini } = makeDeps();
        gemini.mockRejectedValue(err);
        await handleAnalyze(makeReq(goodBody), deps);
        expect(gemini).toHaveBeenCalledTimes(1);
      }
    });

    it("retries network errors (no status) and 500", async () => {
      const { deps, gemini } = makeDeps();
      gemini
        .mockRejectedValueOnce(new GeminiCallError("upstream", undefined, new Error("fetch failed")))
        .mockRejectedValueOnce(new GeminiCallError("upstream", 500, new Error("x")));
      expect((await handleAnalyze(makeReq(goodBody), deps)).status).toBe(200);
      expect(gemini).toHaveBeenCalledTimes(3);
    });

    it("skips the fallback when the env is empty or equals the primary", async () => {
      for (const env of [
        { GEMINI_API_KEY: "k", GEMINI_FALLBACK_MODEL: "" },
        { GEMINI_API_KEY: "k", GEMINI_MODEL: "m1", GEMINI_FALLBACK_MODEL: "m1" },
      ]) {
        const { deps, gemini } = makeDeps({ env });
        gemini.mockRejectedValue(e503());
        await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_ERROR");
        expect(gemini).toHaveBeenCalledTimes(2);
      }
    });

    it("does not start another attempt when less than 32s of the 55s budget remains", async () => {
      let t = NOW;
      const { deps, gemini, log } = makeDeps({ now: () => t, sleep: async () => { t += 1_000; } });
      gemini.mockImplementation(async () => {
        t += 24_000; // 遅い失敗: 1 回目で 24s + 待機 1s = 25s 経過、残り 30s < 32s
        throw e503();
      });
      await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_ERROR");
      expect(gemini).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("warn", "[analyze req00001]", expect.stringContaining("not enough time budget"));
    });
  });
});
