import { describe, expect, it, vi } from "vitest";
import { handleAnalyze, type AnalyzeDeps } from "@/lib/server/analyze/handler";
import { GeminiCallError } from "@/lib/server/analyze/errors";
import { createAnonymousQuota, createRateLimiter } from "@/lib/server/analyze/rateLimit";
import { MAX_PAIR_IMAGE_BASE64_LENGTH, MAX_PAIR_TOTAL_BASE64_LENGTH } from "@/lib/analyze";

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
    anonQuota: createAnonymousQuota({ max: 3, maxKeys: 10_000 }),
    now: () => NOW,
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

  it("allows anonymous scans (per IP) when ALLOW_ANONYMOUS_SCAN=true, then 403 at the quota", async () => {
    const { deps, gemini } = makeDeps({
      auth: async () => ({ userId: null }),
      env: { GEMINI_API_KEY: "k", ALLOW_ANONYMOUS_SCAN: "true" },
      limiter: looseLimiter(), // 匿名枠の検証なのでレートリミットは緩める
    });
    const headers = { "x-forwarded-for": "203.0.113.5, 10.0.0.1" };
    for (let i = 0; i < 3; i++) {
      expect((await handleAnalyze(makeReq(goodBody, headers), deps)).status).toBe(200);
    }
    const blocked = await handleAnalyze(makeReq(goodBody, headers), deps);
    const json = await expectError(blocked, 403, "ANONYMOUS_LIMIT_EXCEEDED");
    expect(json.error).toContain("3回");
    expect(gemini).toHaveBeenCalledTimes(3);
    // 別 IP は影響を受けない
    expect((await handleAnalyze(makeReq(goodBody, { "x-forwarded-for": "198.51.100.9" }), deps)).status).toBe(200);
  });

  it("only counts the anonymous quota on successful scans", async () => {
    const { deps, gemini } = makeDeps({
      auth: async () => ({ userId: null }),
      env: { GEMINI_API_KEY: "k", ALLOW_ANONYMOUS_SCAN: "true" },
      limiter: looseLimiter(),
    });
    gemini.mockRejectedValue(new GeminiCallError("upstream", 500, new Error("boom")));
    for (let i = 0; i < 4; i++) {
      expect((await handleAnalyze(makeReq(goodBody), deps)).status).toBe(502);
    }
    expect(deps.anonQuota.isExceeded("unknown_ip")).toBe(false);
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
    expect(gemini.mock.calls[0][0].images).toEqual([{ role: "combined", base64: PNG_B64, mimeType: "image/png" }]);
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
      images: [{ role: "combined", base64: JPEG_B64, mimeType: "image/jpeg" }],
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

  it("returns 422 NOTHING_EXTRACTED when no core value is read (and does not count the anonymous quota)", async () => {
    const { deps, gemini } = makeDeps({
      auth: async () => ({ userId: null }),
      env: { GEMINI_API_KEY: "k", ALLOW_ANONYMOUS_SCAN: "true" },
    });
    gemini.mockResolvedValue({ text: JSON.stringify({ date: "2026-10-03", gas_station: "x" }) });
    await expectError(await handleAnalyze(makeReq(goodBody), deps), 422, "NOTHING_EXTRACTED");
    expect(deps.anonQuota.isExceeded("unknown_ip")).toBe(false);
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

    gemini.mockRejectedValueOnce(new GeminiCallError("upstream", 500, new Error("secret 500")));
    const upstream = await expectError(await handleAnalyze(makeReq(goodBody), deps), 502, "UPSTREAM_ERROR");
    expect(JSON.stringify(upstream)).not.toContain("secret");

    // 分類されていない例外も 502 に寄せる
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
});

// ---------------------------------------------------------------------------
// 2 枚（レシート + メーター）
// ---------------------------------------------------------------------------

const receiptEntry = { role: "receipt", image: `data:image/jpeg;base64,${JPEG_B64}` };
const meterEntry = { role: "meter", image: PNG_B64 };
const pairBody = { images: [receiptEntry, meterEntry] };

/** Base64 として正しく、先頭が JPEG の、指定の長さ（4 の倍数）の文字列 */
function bigJpegBase64(length: number): string {
  // 30 バイト = 40 文字（パディングなし）の JPEG の先頭に "A"（0 のバイト）を続ける
  const head = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(26)]).toString("base64");
  return head + "A".repeat(length - head.length);
}

describe("handleAnalyze（2 枚: レシート + メーター）", () => {
  it("2 枚を 1 回の Gemini 呼び出しで送る（レシート → メーターの順）", async () => {
    const { deps, gemini } = makeDeps();
    const res = await handleAnalyze(makeReq(pairBody), deps);
    expect(res.status).toBe(200);
    expect(gemini).toHaveBeenCalledTimes(1);
    expect(gemini.mock.calls[0][0].images).toEqual([
      { role: "receipt", base64: JPEG_B64, mimeType: "image/jpeg" },
      { role: "meter", base64: PNG_B64, mimeType: "image/png" },
    ]);
    const json = await res.json();
    expect(json).toMatchObject({ fuel_amount: 40, total_distance: 512.3, requestId: "req00001" });
  });

  it("順序が逆（メーター → レシート）でも役割どおりに並べ替える", async () => {
    const { deps, gemini } = makeDeps();
    const res = await handleAnalyze(makeReq({ images: [meterEntry, receiptEntry] }), deps);
    expect(res.status).toBe(200);
    expect(gemini.mock.calls[0][0].images.map((img: { role: string }) => img.role)).toEqual(["receipt", "meter"]);
  });

  it("0 枚・1 枚・3 枚は 400 INVALID_IMAGE（Gemini を呼ばない）", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    await expectError(await handleAnalyze(makeReq({ images: [] }), deps), 400, "INVALID_IMAGE");
    await expectError(await handleAnalyze(makeReq({ images: [receiptEntry] }), deps), 400, "INVALID_IMAGE");
    await expectError(
      await handleAnalyze(makeReq({ images: [receiptEntry, meterEntry, { role: "meter", image: JPEG_B64 }] }), deps),
      400,
      "INVALID_IMAGE"
    );
    expect(gemini).not.toHaveBeenCalled();
  });

  it("役割の重複・未知の役割・未知のキー・配列でない・要素がオブジェクトでないものは 400 INVALID_IMAGE", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    const bad: unknown[] = [
      { images: [receiptEntry, { ...meterEntry, role: "receipt" }] },
      { images: [receiptEntry, { ...meterEntry, role: "odometer" }] },
      { images: [receiptEntry, { ...meterEntry, role: undefined }] },
      { images: [receiptEntry, { ...meterEntry, note: "x" }] },
      { images: "not array" },
      { images: { receipt: JPEG_B64, meter: PNG_B64 } },
      { images: [receiptEntry, JPEG_B64] },
      { images: [receiptEntry, null] },
    ];
    for (const body of bad) {
      const json = await expectError(await handleAnalyze(makeReq(body), deps), 400, "INVALID_IMAGE");
      expect(json.error).toContain("レシートとメーター");
    }
    expect(gemini).not.toHaveBeenCalled();
  });

  it("image と images を両方送ったら 400 INVALID_IMAGE", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    await expectError(await handleAnalyze(makeReq({ ...goodBody, ...pairBody }), deps), 400, "INVALID_IMAGE");
    await expectError(await handleAnalyze(makeReq({ imageBase64: JPEG_B64, ...pairBody }), deps), 400, "INVALID_IMAGE");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("どちらかの画像が JPEG/PNG/WebP でなければ 415、壊れていれば 400", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    await expectError(
      await handleAnalyze(makeReq({ images: [receiptEntry, { role: "meter", image: GIF_B64 }] }), deps),
      415,
      "INVALID_IMAGE"
    );
    await expectError(
      await handleAnalyze(makeReq({ images: [{ role: "receipt", image: `data:text/plain;base64,${JPEG_B64}` }, meterEntry] }), deps),
      415,
      "INVALID_IMAGE"
    );
    await expectError(
      await handleAnalyze(makeReq({ images: [receiptEntry, { role: "meter", image: "***" }] }), deps),
      400,
      "INVALID_IMAGE"
    );
    await expectError(
      await handleAnalyze(makeReq({ images: [receiptEntry, { role: "meter" }] }), deps),
      400,
      "INVALID_IMAGE"
    );
    expect(gemini).not.toHaveBeenCalled();
  });

  it("1 枚あたりの上限（1.5MB）を超えたら 413 INVALID_IMAGE、合計の上限を超えたら 413 PAYLOAD_TOO_LARGE", async () => {
    const { deps, gemini } = makeDeps({ limiter: looseLimiter() });
    const perImageMax = MAX_PAIR_IMAGE_BASE64_LENGTH - (MAX_PAIR_IMAGE_BASE64_LENGTH % 4);
    const tooBig = bigJpegBase64(perImageMax + 4);
    const json = await expectError(
      await handleAnalyze(makeReq({ images: [{ role: "receipt", image: tooBig }, meterEntry] }), deps),
      413,
      "INVALID_IMAGE"
    );
    expect(json.error).toContain("1枚あたり");

    // 1 枚ずつは上限内だが、合計が上限を超える
    const each = bigJpegBase64(perImageMax);
    expect(each.length * 2).toBeGreaterThan(MAX_PAIR_TOTAL_BASE64_LENGTH);
    await expectError(
      await handleAnalyze(makeReq({ images: [{ role: "receipt", image: each }, { role: "meter", image: each }] }), deps),
      413,
      "PAYLOAD_TOO_LARGE"
    );
    expect(gemini).not.toHaveBeenCalled();
  });

  it("未ログインは 401（2 枚でも同じ）", async () => {
    const { deps, gemini } = makeDeps({ auth: async () => ({ userId: null }) });
    await expectError(await handleAnalyze(makeReq(pairBody), deps), 401, "AUTH_REQUIRED");
    expect(gemini).not.toHaveBeenCalled();
  });

  it("2 枚でもレートリミットは 1 リクエスト = 1 回分", async () => {
    const { deps } = makeDeps(); // 1 分に 5 回
    for (let i = 0; i < 5; i++) {
      expect((await handleAnalyze(makeReq(pairBody), deps)).status).toBe(200);
    }
    await expectError(await handleAnalyze(makeReq(pairBody), deps), 429, "RATE_LIMITED");
  });

  it("2 枚で何も読み取れなければ 422 NOTHING_EXTRACTED（画像の選び方の確認を促す）", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockResolvedValue({ text: JSON.stringify({ date: null, gas_station: null }) });
    const json = await expectError(await handleAnalyze(makeReq(pairBody), deps), 422, "NOTHING_EXTRACTED");
    expect(json.error).toContain("1枚目にレシート");
  });

  it("Gemini のエラー本文を返さない（2 枚でも汎用メッセージ + requestId）", async () => {
    const { deps, gemini } = makeDeps();
    gemini.mockRejectedValueOnce(new GeminiCallError("upstream", 500, new Error("secret upstream body")));
    const json = await expectError(await handleAnalyze(makeReq(pairBody), deps), 502, "UPSTREAM_ERROR");
    expect(JSON.stringify(json)).not.toContain("secret");
  });
});
