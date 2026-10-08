import { describe, expect, it } from "vitest";
import { calculateFuelMetrics } from "@/lib/calculations";
import {
  MAX_IMAGE_BASE64_LENGTH,
  analyzeErrorMessage,
  PLAUSIBILITY_LIMITS,
  derivePricePerUnit,
  detectImageMime,
  hasAnyCoreValue,
  hostFromUrl,
  isAllowedOrigin,
  isTripDistanceWarning,
  normalizeFuelType,
  parseImagePayload,
  plausibilityWarnings,
  sanitizeAIResponse,
  toNonNegativeNumber,
} from "@/lib/analyze";
import { isValidCalendarDate } from "@/lib/dates";

// ---------------------------------------------------------------------------
// fixtures: 先頭バイトにマジックナンバーを持つ 32 バイトのダミー画像
// ---------------------------------------------------------------------------

function padTo32(head: number[]): Buffer {
  return Buffer.concat([Buffer.from(head), Buffer.alloc(32 - head.length)]);
}

const JPEG_BYTES = padTo32([0xff, 0xd8, 0xff, 0xe0]);
const PNG_BYTES = padTo32([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_BYTES = padTo32([...Buffer.from("RIFF"), 0x10, 0x00, 0x00, 0x00, ...Buffer.from("WEBP")]);
const GIF_BYTES = padTo32([...Buffer.from("GIF89a")]);

const JPEG_B64 = JPEG_BYTES.toString("base64");
const PNG_B64 = PNG_BYTES.toString("base64");
const WEBP_B64 = WEBP_BYTES.toString("base64");
const GIF_B64 = GIF_BYTES.toString("base64");

describe("detectImageMime", () => {
  it("detects JPEG / PNG / WebP from magic bytes", () => {
    expect(detectImageMime(new Uint8Array(JPEG_BYTES))).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array(PNG_BYTES))).toBe("image/png");
    expect(detectImageMime(new Uint8Array(WEBP_BYTES))).toBe("image/webp");
  });

  it("returns null for GIF, empty and truncated headers", () => {
    expect(detectImageMime(new Uint8Array(GIF_BYTES))).toBeNull();
    expect(detectImageMime(new Uint8Array([]))).toBeNull();
    expect(detectImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // RIFF ではあるが WEBP ではない (例: WAV)
    expect(detectImageMime(new Uint8Array(padTo32([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])))).toBeNull();
  });
});

describe("parseImagePayload", () => {
  it("accepts raw base64 JPEG / PNG / WebP", () => {
    expect(parseImagePayload(JPEG_B64)).toEqual({
      ok: true,
      base64: JPEG_B64,
      mimeType: "image/jpeg",
      approxBytes: 32,
    });
    expect(parseImagePayload(PNG_B64)).toMatchObject({ ok: true, mimeType: "image/png" });
    expect(parseImagePayload(WEBP_B64)).toMatchObject({ ok: true, mimeType: "image/webp" });
  });

  it("strips a data: URL prefix and returns the sniffed MIME (not the declared one)", () => {
    // 宣言は png だが中身は jpeg → 実バイトで判定
    const r = parseImagePayload(`data:image/png;base64,${JPEG_B64}`);
    expect(r).toEqual({ ok: true, base64: JPEG_B64, mimeType: "image/jpeg", approxBytes: 32 });
  });

  it("accepts data: URLs with extra parameters and no explicit mime", () => {
    expect(parseImagePayload(`data:image/jpeg;charset=utf-8;base64,${JPEG_B64}`)).toMatchObject({ ok: true });
    expect(parseImagePayload(`data:;base64,${PNG_B64}`)).toMatchObject({ ok: true, mimeType: "image/png" });
    expect(parseImagePayload(`DATA:IMAGE/WEBP;BASE64,${WEBP_B64}`)).toMatchObject({ ok: true, mimeType: "image/webp" });
  });

  it("tolerates whitespace and newlines inside the base64 body and around it", () => {
    const wrapped = `  \n${JPEG_B64.slice(0, 10)}\r\n${JPEG_B64.slice(10, 30)} ${JPEG_B64.slice(30)}\n`;
    const r = parseImagePayload(wrapped);
    expect(r).toMatchObject({ ok: true, base64: JPEG_B64, mimeType: "image/jpeg" });
  });

  it("computes approxBytes taking padding into account", () => {
    const b31 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(28)]); // 31 bytes → 1 '='
    const b30 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(27)]); // 30 bytes → 2 '='
    expect(parseImagePayload(b31.toString("base64"))).toMatchObject({ ok: true, approxBytes: 31 });
    expect(parseImagePayload(b30.toString("base64"))).toMatchObject({ ok: true, approxBytes: 30 });
  });

  it("rejects non-string / empty input with 400", () => {
    for (const bad of [undefined, null, 123, {}, [], "", "   "]) {
      expect(parseImagePayload(bad)).toMatchObject({ ok: false, status: 400 });
    }
  });

  it("rejects invalid base64 charset or length with 400", () => {
    expect(parseImagePayload("AAA!")).toMatchObject({ ok: false, status: 400 });
    expect(parseImagePayload("AAAAA")).toMatchObject({ ok: false, status: 400 }); // length % 4 !== 0
    expect(parseImagePayload("AA===")).toMatchObject({ ok: false, status: 400 });
    expect(parseImagePayload(`${JPEG_B64}日本語`)).toMatchObject({ ok: false, status: 400 });
    // URL-safe alphabet is not accepted
    expect(parseImagePayload("AA-_")).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a data: URL whose declared type is not image/* with 415", () => {
    expect(parseImagePayload(`data:text/plain;base64,${JPEG_B64}`)).toMatchObject({ ok: false, status: 415 });
    expect(parseImagePayload(`data:application/pdf;base64,${JPEG_B64}`)).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects a data: URL without ;base64 or with a malformed prefix with 400", () => {
    expect(parseImagePayload(`data:image/png,${PNG_B64}`)).toMatchObject({ ok: false, status: 400 });
    expect(parseImagePayload("data:garbage")).toMatchObject({ ok: false, status: 400 });
    expect(parseImagePayload("data:")).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects unsupported image bytes (GIF, zeros) with 415", () => {
    expect(parseImagePayload(GIF_B64)).toMatchObject({ ok: false, status: 415 });
    expect(parseImagePayload(`data:image/gif;base64,${GIF_B64}`)).toMatchObject({ ok: false, status: 415 });
    expect(parseImagePayload(Buffer.alloc(32).toString("base64"))).toMatchObject({ ok: false, status: 415 });
    expect(parseImagePayload("AAAA")).toMatchObject({ ok: false, status: 415 });
  });

  it("rejects oversize payloads with 413 before sniffing", () => {
    // 4 の倍数で上限を超える長さ。内容は画像でなくても長さチェックが先に走る
    const len = MAX_IMAGE_BASE64_LENGTH + (4 - (MAX_IMAGE_BASE64_LENGTH % 4 || 4)) + 4;
    expect(len % 4).toBe(0);
    expect(len).toBeGreaterThan(MAX_IMAGE_BASE64_LENGTH);
    expect(parseImagePayload("A".repeat(len))).toMatchObject({ ok: false, status: 413 });
  });

  it("accepts a payload exactly at the limit when it is valid base64", () => {
    // MAX_IMAGE_BASE64_LENGTH は 4 の倍数とは限らないので、それ以下で最大の 4 の倍数を使う
    const len = MAX_IMAGE_BASE64_LENGTH - (MAX_IMAGE_BASE64_LENGTH % 4);
    // 33 バイト → 44 文字でパディング無し（末尾に "A" を連結しても Base64 として正しい）
    const head = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(30)]).toString("base64");
    expect(head.endsWith("=")).toBe(false);
    const payload = head + "A".repeat(len - head.length);
    expect(parseImagePayload(payload)).toMatchObject({ ok: true, mimeType: "image/jpeg" });
  });
});

describe("isValidCalendarDate", () => {
  it("accepts real YYYY-MM-DD dates", () => {
    expect(isValidCalendarDate("2026-10-03")).toBe(true);
    expect(isValidCalendarDate("2024-02-29")).toBe(true); // うるう年
    expect(isValidCalendarDate("2026-12-31")).toBe(true);
    expect(isValidCalendarDate("2026-01-01")).toBe(true);
  });

  it("rejects non-existent calendar days", () => {
    expect(isValidCalendarDate("2026-02-30")).toBe(false);
    expect(isValidCalendarDate("2023-02-29")).toBe(false); // 平年
    expect(isValidCalendarDate("2026-04-31")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("2026-00-10")).toBe(false);
    expect(isValidCalendarDate("2026-10-00")).toBe(false);
    expect(isValidCalendarDate("2026-10-32")).toBe(false);
  });

  it("rejects wrong shapes and non-strings", () => {
    expect(isValidCalendarDate("2026-1-3")).toBe(false);
    expect(isValidCalendarDate("2026/10/03")).toBe(false);
    expect(isValidCalendarDate("20261003")).toBe(false);
    expect(isValidCalendarDate(" 2026-10-03")).toBe(false);
    expect(isValidCalendarDate(20261003)).toBe(false);
    expect(isValidCalendarDate(null)).toBe(false);
    expect(isValidCalendarDate(undefined)).toBe(false);
  });
});

describe("toNonNegativeNumber", () => {
  it("keeps finite non-negative numbers", () => {
    expect(toNonNegativeNumber(0)).toBe(0);
    expect(toNonNegativeNumber(45.6)).toBe(45.6);
  });

  it("parses numeric strings with thousands separators / unit suffixes", () => {
    expect(toNonNegativeNumber("12,345")).toBe(12345);
    expect(toNonNegativeNumber("45.6L")).toBe(45.6);
    expect(toNonNegativeNumber(" 6,000 円")).toBe(6000);
    expect(toNonNegativeNumber("150")).toBe(150);
  });

  it("returns null for negative, non-finite and non-numeric input", () => {
    expect(toNonNegativeNumber(-1)).toBeNull();
    expect(toNonNegativeNumber("-5")).toBeNull();
    expect(toNonNegativeNumber(NaN)).toBeNull();
    expect(toNonNegativeNumber(Infinity)).toBeNull();
    expect(toNonNegativeNumber("12abc34")).toBeNull();
    expect(toNonNegativeNumber("-")).toBeNull();
    expect(toNonNegativeNumber("")).toBeNull();
    expect(toNonNegativeNumber("   ")).toBeNull();
    expect(toNonNegativeNumber(null)).toBeNull();
    expect(toNonNegativeNumber(undefined)).toBeNull();
    expect(toNonNegativeNumber(true)).toBeNull();
    expect(toNonNegativeNumber({})).toBeNull();
  });

  // 回帰テスト: 末尾の非数値文字を取り除いた結果が空文字になる入力（Number("") === 0）を
  // 0 ではなく null にする。AI が「読み取れない」を文字列で返した場合に 0 が混入しないようにする。
  it("returns null for strings that contain no digits at all (not 0)", () => {
    expect(toNonNegativeNumber("abc")).toBeNull();
    expect(toNonNegativeNumber("N/A")).toBeNull();
    expect(toNonNegativeNumber("不明")).toBeNull();
    expect(toNonNegativeNumber("円")).toBeNull();
    expect(toNonNegativeNumber(" , ")).toBeNull();
    expect(toNonNegativeNumber("L")).toBeNull();
  });

  it("still accepts strings that reduce to a plain number after cleanup", () => {
    expect(toNonNegativeNumber("0")).toBe(0);
    expect(toNonNegativeNumber("0円")).toBe(0);
    expect(toNonNegativeNumber("+5")).toBe(5);
    expect(toNonNegativeNumber("1,234.5 L")).toBe(1234.5);
  });
});

describe("sanitizeAIResponse", () => {
  it("returns null for anything that is not a plain object", () => {
    expect(sanitizeAIResponse([])).toBeNull();
    expect(sanitizeAIResponse([{ fuel_amount: 1 }])).toBeNull();
    expect(sanitizeAIResponse(null)).toBeNull();
    expect(sanitizeAIResponse(undefined)).toBeNull();
    expect(sanitizeAIResponse("{}")).toBeNull();
    expect(sanitizeAIResponse(42)).toBeNull();
  });

  it("normalizes a full valid response", () => {
    expect(
      sanitizeAIResponse({
        date: "2026-10-03",
        fuel_amount: 40.5,
        total_cost: "6,075",
        price_per_unit: 150,
        total_distance: 512,
        odometer: 123456,
        gas_station: "  ENEOS 本町  ",
        confidence: { fuel_amount: 0.9, date: 1.5, gas_station: -0.2 },
      })
    ).toEqual({
      date: "2026-10-03",
      fuel_amount: 40.5,
      total_cost: 6075,
      price_per_unit: 150,
      total_distance: 512,
      odometer: 123456,
      gas_station: "ENEOS 本町",
      fuel_type: null,
      confidence: { fuel_amount: 0.9, date: 1, gas_station: 0 },
    });
  });

  it("drops unknown keys", () => {
    const r = sanitizeAIResponse({ fuel_amount: 10, foo: "bar", __proto__: { evil: true }, user_id: "x" });
    expect(r).not.toBeNull();
    expect(Object.keys(r!).sort()).toEqual(
      [
        "date",
        "fuel_amount",
        "total_cost",
        "price_per_unit",
        "total_distance",
        "odometer",
        "gas_station",
        "fuel_type",
      ].sort()
    );
  });

  it("maps negative / invalid numbers to null", () => {
    const r = sanitizeAIResponse({
      fuel_amount: -1,
      total_cost: "12abc34",
      price_per_unit: NaN,
      total_distance: Infinity,
      odometer: null,
    });
    expect(r).toMatchObject({
      fuel_amount: null,
      total_cost: null,
      price_per_unit: null,
      total_distance: null,
      odometer: null,
    });
  });

  it("maps digit-less strings such as 不明 / N/A to null (regression)", () => {
    const r = sanitizeAIResponse({ total_cost: "不明", fuel_amount: "N/A", total_distance: "円", odometer: "abc" });
    expect(r).toMatchObject({ total_cost: null, fuel_amount: null, total_distance: null, odometer: null });
  });

  it("maps invalid dates to null", () => {
    expect(sanitizeAIResponse({ date: "2026-02-30" })!.date).toBeNull();
    expect(sanitizeAIResponse({ date: 20261003 })!.date).toBeNull();
    expect(sanitizeAIResponse({})!.date).toBeNull();
  });

  it("trims gas_station to 100 chars and nulls empty / non-string values", () => {
    const long = "あ".repeat(150);
    expect(sanitizeAIResponse({ gas_station: long })!.gas_station).toBe("あ".repeat(100));
    expect(sanitizeAIResponse({ gas_station: `  ${"x".repeat(120)}  ` })!.gas_station).toBe("x".repeat(100));
    expect(sanitizeAIResponse({ gas_station: "   " })!.gas_station).toBeNull();
    expect(sanitizeAIResponse({ gas_station: 123 })!.gas_station).toBeNull();
    expect(sanitizeAIResponse({})!.gas_station).toBeNull();
  });

  it("maps fuel_type strings to the four allowed values", () => {
    const ft = (v: unknown) => sanitizeAIResponse({ fuel_type: v })!.fuel_type;
    expect(ft("regular")).toBe("regular");
    expect(ft("premium")).toBe("premium");
    expect(ft("diesel")).toBe("diesel");
    expect(ft("other")).toBe("other");
    expect(ft("レギュラー")).toBe("regular");
    expect(ft("レギュラーガソリン")).toBe("regular");
    expect(ft("ハイオク")).toBe("premium");
    expect(ft("high-octane")).toBe("premium");
    expect(ft("軽油")).toBe("diesel");
    expect(ft("DIESEL")).toBe("diesel");
    expect(ft("  Premium ")).toBe("premium");
    expect(ft("LPG")).toBe("other");
    expect(ft("灯油")).toBe("other");
  });

  it("maps empty / non-string fuel_type to null", () => {
    const ft = (v: unknown) => sanitizeAIResponse({ fuel_type: v })!.fuel_type;
    expect(ft("")).toBeNull();
    expect(ft("   ")).toBeNull();
    expect(ft(123)).toBeNull();
    expect(ft(null)).toBeNull();
    expect(ft({})).toBeNull();
    expect(sanitizeAIResponse({})!.fuel_type).toBeNull();
    expect(normalizeFuelType(undefined)).toBeNull();
  });

  it("keeps fuel_type confidence and still drops unknown keys", () => {
    const r = sanitizeAIResponse({ fuel_type: "軽油", fuel_types: "x", confidence: { fuel_type: 0.8 } });
    expect(r).toMatchObject({ fuel_type: "diesel", confidence: { fuel_type: 0.8 } });
    expect(r).not.toHaveProperty("fuel_types");
  });

  it("clamps confidence to [0, 1], keeps only known fields and omits it when empty", () => {
    const r = sanitizeAIResponse({
      confidence: { fuel_amount: 2, total_cost: -1, date: 0.42, odometer: "0.5", unknown_field: 0.9, total_distance: NaN },
    });
    expect(r!.confidence).toEqual({ fuel_amount: 1, total_cost: 0, date: 0.42 });

    expect(sanitizeAIResponse({ confidence: { odometer: "0.5" } })).not.toHaveProperty("confidence");
    expect(sanitizeAIResponse({ confidence: [0.5] })).not.toHaveProperty("confidence");
    expect(sanitizeAIResponse({ confidence: 0.5 })).not.toHaveProperty("confidence");
    expect(sanitizeAIResponse({})).not.toHaveProperty("confidence");
  });
});

describe("derivePricePerUnit", () => {
  it("matches the rounding rule of calculateFuelMetrics", () => {
    const cases: Array<[number | null | undefined, number | null | undefined]> = [
      [6000, 40],
      [6001, 40],
      [6020, 40],
      [6019, 40],
      [0, 40],
      [6000, 0],
      [6000, -5],
      [null, 40],
      [undefined, 40],
      [6000, null],
      [6000, undefined],
      [1, 3],
      [2, 3],
      [5672, 40],
      [6000, 42.3],
      [5602, 40],
      [7003, 50],
      [6075, 40.5],
    ];
    for (const [cost, amount] of cases) {
      expect(derivePricePerUnit(cost, amount), `cost=${cost} amount=${amount}`).toBe(
        calculateFuelMetrics(null, amount, cost).price_per_unit
      );
    }
  });

  it("returns a value rounded to 0.1 yen", () => {
    expect(derivePricePerUnit(6075, 40.5)).toBe(150);
    expect(derivePricePerUnit(6001, 40)).toBe(150);
    expect(derivePricePerUnit(6020, 40)).toBe(150.5);
    expect(derivePricePerUnit(5672, 40)).toBe(141.8);
  });
});

describe("hasAnyCoreValue", () => {
  it("is false only when all three core values are null", () => {
    expect(hasAnyCoreValue({ fuel_amount: null, total_cost: null, total_distance: null })).toBe(false);
    expect(hasAnyCoreValue({ fuel_amount: 0, total_cost: null, total_distance: null })).toBe(true);
    expect(hasAnyCoreValue({ fuel_amount: null, total_cost: 6000, total_distance: null })).toBe(true);
    expect(hasAnyCoreValue({ fuel_amount: null, total_cost: null, total_distance: 500 })).toBe(true);
  });
});

describe("plausibilityWarnings", () => {
  it("returns no warnings for plausible values or nulls", () => {
    expect(plausibilityWarnings({ fuel_amount: 40, total_distance: 500 })).toEqual([]);
    expect(plausibilityWarnings({ fuel_amount: null, total_distance: null })).toEqual([]);
    expect(plausibilityWarnings({ fuel_amount: null, total_distance: 500 })).toEqual([]);
    expect(plausibilityWarnings({ fuel_amount: 40, total_distance: null })).toEqual([]);
  });

  it("uses strict > on the fuel amount threshold (200 L)", () => {
    expect(plausibilityWarnings({ fuel_amount: PLAUSIBILITY_LIMITS.maxFuelAmount, total_distance: null })).toEqual([]);
    const w = plausibilityWarnings({ fuel_amount: 200.1, total_distance: null });
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("FUEL_TOO_LARGE");
    expect(w[0].message).toContain("給油量");
    expect(w[0].message).toContain("200 L");
  });

  it("uses strict > on the trip distance threshold (2000 km)", () => {
    expect(plausibilityWarnings({ fuel_amount: null, total_distance: PLAUSIBILITY_LIMITS.maxTripDistance })).toEqual([]);
    const w = plausibilityWarnings({ fuel_amount: null, total_distance: 2001 });
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("DISTANCE_TOO_LARGE");
    expect(w[0].message).toContain("走行距離");
    expect(w[0].message).toContain("オドメーター");
  });

  it("uses strict > on the efficiency threshold (60 km/L)", () => {
    expect(plausibilityWarnings({ fuel_amount: 10, total_distance: 600 })).toEqual([]); // exactly 60
    const w = plausibilityWarnings({ fuel_amount: 10, total_distance: 601 });
    expect(w).toHaveLength(1);
    expect(w[0].code).toBe("EFFICIENCY_TOO_HIGH");
    expect(w[0].message).toContain("燃費");
    expect(w[0].message).toContain("60.1 km/L");
  });

  it("does not emit the efficiency warning when fuel_amount is 0", () => {
    expect(plausibilityWarnings({ fuel_amount: 0, total_distance: 500 })).toEqual([]);
  });

  it("can emit several warnings at once", () => {
    const w = plausibilityWarnings({ fuel_amount: 250, total_distance: 30000 });
    expect(w.map(x => x.code)).toEqual(["FUEL_TOO_LARGE", "DISTANCE_TOO_LARGE", "EFFICIENCY_TOO_HIGH"]);
    expect(w.every(x => typeof x.message === "string" && x.message.length > 0)).toBe(true);
  });
});

describe("isTripDistanceWarning", () => {
  it("is true for warnings based on the trip distance reading (DISTANCE_* and the efficiency check)", () => {
    expect(isTripDistanceWarning("DISTANCE_TOO_LARGE")).toBe(true);
    expect(isTripDistanceWarning("DISTANCE_SOMETHING_NEW")).toBe(true);
    expect(isTripDistanceWarning("EFFICIENCY_TOO_HIGH")).toBe(true);
  });

  it("is false for other warnings", () => {
    expect(isTripDistanceWarning("FUEL_TOO_LARGE")).toBe(false);
    expect(isTripDistanceWarning("")).toBe(false);
  });
});

describe("hostFromUrl", () => {
  it("extracts lower-cased host including port", () => {
    expect(hostFromUrl("https://APP.Example.com/path?x=1")).toBe("app.example.com");
    expect(hostFromUrl("http://localhost:3000")).toBe("localhost:3000");
  });

  it("returns null for empty, invalid, or host-less values", () => {
    expect(hostFromUrl(null)).toBeNull();
    expect(hostFromUrl(undefined)).toBeNull();
    expect(hostFromUrl("")).toBeNull();
    expect(hostFromUrl("null")).toBeNull();
    expect(hostFromUrl("not a url")).toBeNull();
    expect(hostFromUrl("file:///tmp/x")).toBeNull();
  });
});

describe("isAllowedOrigin", () => {
  const allowed = ["app.example.com", "localhost:3000", null, undefined];

  it("skips the check when the Origin header is absent", () => {
    expect(isAllowedOrigin(null, allowed)).toBe(true);
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin("", allowed)).toBe(true);
  });

  it('rejects the literal "null" origin and unparsable origins', () => {
    expect(isAllowedOrigin("null", allowed)).toBe(false);
    expect(isAllowedOrigin("garbage", allowed)).toBe(false);
  });

  it("accepts a matching host (case-insensitive, port-sensitive)", () => {
    expect(isAllowedOrigin("https://app.example.com", allowed)).toBe(true);
    expect(isAllowedOrigin("https://APP.EXAMPLE.COM", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000", allowed)).toBe(true);
    expect(isAllowedOrigin("http://localhost:3001", allowed)).toBe(false);
    expect(isAllowedOrigin("http://localhost", allowed)).toBe(false);
  });

  it("rejects other hosts and ignores empty entries in the allow list", () => {
    expect(isAllowedOrigin("https://evil.example.com", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com.evil.com", allowed)).toBe(false);
    expect(isAllowedOrigin("https://app.example.com", [])).toBe(false);
    expect(isAllowedOrigin("https://app.example.com", [null, undefined, ""])).toBe(false);
  });
});

describe("analyzeErrorMessage", () => {
  const SIGNED_OUT_401 =
    "AIスキャンにはログインが必要です。右上の「ログイン」からサインインするか、「手動で入力」から記録を追加してください（手動入力はログイン不要です）。";
  const SIGNED_IN_401 = "セッションの有効期限が切れた可能性があります。ページを再読み込みして、もう一度お試しください。";

  it.each<[string, number, unknown, Parameters<typeof analyzeErrorMessage>[2], string]>([
    ["401 未ログイン", 401, { error: "Unauthorized" }, { isSignedIn: false }, SIGNED_OUT_401],
    ["401 ログイン状態が未確定は未ログイン扱い", 401, null, { isSignedIn: undefined }, SIGNED_OUT_401],
    ["401 ログイン中（セッション切れ）", 401, { error: "Unauthorized" }, { isSignedIn: true }, SIGNED_IN_401],
    ["422 サーバーの文言を優先", 422, { error: "画像を読み取れませんでした" }, {}, "画像を読み取れませんでした"],
    [
      "422 文言なし",
      422,
      {},
      {},
      "レシート/メーターを読み取れませんでした。撮り直すか、「手動で入力」から記録してください。",
    ],
    [
      "429 Retry-After が秒数",
      429,
      { error: "混雑しています。" },
      { retryAfter: "30" },
      "混雑しています。 約30秒後にもう一度お試しください。",
    ],
    [
      "429 Retry-After が秒数でない",
      429,
      null,
      { retryAfter: "Wed, 21 Oct 2026 07:28:00 GMT" },
      "リクエストが多すぎます。 しばらくしてからもう一度お試しください。",
    ],
    ["429 Retry-After なし", 429, null, { retryAfter: null }, "リクエストが多すぎます。 しばらくしてからもう一度お試しください。"],
    ["504 サーバーの文言", 504, { error: "AIの応答がありませんでした" }, {}, "AIの応答がありませんでした"],
    ["504 文言なし", 504, null, {}, "AI解析がタイムアウトしました。しばらくしてから、もう一度お試しください。"],
    ["500 requestId 付き", 500, { error: "解析に失敗しました。", requestId: "abc123" }, {}, "解析に失敗しました。（ID: abc123）"],
    ["500 本文なし", 500, null, {}, "サーバーエラーが発生しました。"],
    ["400 requestId のみ", 400, { requestId: "r1" }, {}, "サーバーエラーが発生しました。（ID: r1）"],
    ["文字列でない error / requestId は使わない", 502, { error: 42, requestId: { x: 1 } }, {}, "サーバーエラーが発生しました。"],
  ])("%s", (_label, status, body, options, expected) => {
    expect(analyzeErrorMessage(status, body, options)).toBe(expected);
  });

  it("401 の文言は本文の error を使わない", () => {
    expect(analyzeErrorMessage(401, { error: "Unauthorized" }, { isSignedIn: false })).not.toContain("Unauthorized");
  });
});
