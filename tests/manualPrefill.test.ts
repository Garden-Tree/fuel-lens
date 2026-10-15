import { describe, expect, it } from "vitest";
import {
  PREFILL_MAX,
  buildManualPrefillHref,
  parseManualPrefill,
  parsePrefillNumber,
  prefillAppliedMessage,
  prefillToRecord,
} from "@/lib/manualPrefill";

const params = (query: string) => new URLSearchParams(query);

describe("parseManualPrefill", () => {
  it("distance / amount / cost を区間距離・給油量・支払総額として読む", () => {
    expect(parseManualPrefill(params("action=manual&distance=400.5&amount=25&cost=4000"))).toEqual({
      total_distance: 400.5,
      fuel_amount: 25,
      total_cost: 4000,
    });
  });

  it("読めた欄だけ返し、どれも読めなければ null", () => {
    expect(parseManualPrefill(params("action=manual&amount=30"))).toEqual({ fuel_amount: 30 });
    expect(parseManualPrefill(params("action=manual"))).toBeNull();
    expect(parseManualPrefill(params("action=manual&distance=&amount=abc&cost=-1"))).toBeNull();
  });

  it("知らないキーは無視する", () => {
    expect(parseManualPrefill(params("action=manual&amount=30&date=2020-01-01&memo=x&vehicle=v2&gas_station=a"))).toEqual({
      fuel_amount: 30,
    });
  });

  it("全角数字・桁区切りは parseDraftNumber と同じく読む", () => {
    expect(parseManualPrefill(params(`distance=${encodeURIComponent("４００")}&cost=${encodeURIComponent("4,000")}`))).toEqual({
      total_distance: 400,
      total_cost: 4000,
    });
  });

  it("0 以下・上限超え・指数表記・長すぎる値・スクリプトは捨てる", () => {
    expect(parseManualPrefill(params("distance=0&amount=-5&cost=0"))).toBeNull();
    expect(parseManualPrefill(params(`distance=${PREFILL_MAX.total_distance + 1}`))).toBeNull();
    expect(parseManualPrefill(params(`amount=${PREFILL_MAX.fuel_amount}`))).toEqual({ fuel_amount: PREFILL_MAX.fuel_amount });
    expect(parseManualPrefill(params("amount=1e3&cost=Infinity&distance=NaN"))).toBeNull();
    expect(parseManualPrefill(params(`amount=${"1".repeat(21)}`))).toBeNull();
    expect(parseManualPrefill(params(`cost=${encodeURIComponent("<script>alert(1)</script>")}`))).toBeNull();
  });

  it("同じキーが複数あれば最初の値を使う", () => {
    expect(parseManualPrefill(params("amount=20&amount=999999"))).toEqual({ fuel_amount: 20 });
  });
});

describe("parsePrefillNumber", () => {
  it("null・空・数値でないものは null", () => {
    expect(parsePrefillNumber(null, 100)).toBeNull();
    expect(parsePrefillNumber(undefined, 100)).toBeNull();
    expect(parsePrefillNumber("", 100)).toBeNull();
    expect(parsePrefillNumber("12a", 100)).toBeNull();
    expect(parsePrefillNumber("12.", 100)).toBe(12);
  });
});

describe("buildManualPrefillHref", () => {
  it("/app?action=manual に値を付ける", () => {
    expect(buildManualPrefillHref({ total_distance: 400, fuel_amount: 25.3, total_cost: 4000 })).toBe(
      "/app?action=manual&distance=400&amount=25.3&cost=4000"
    );
  });

  it("無い・不正・範囲外の値は載せない", () => {
    expect(buildManualPrefillHref({ fuel_amount: 25 })).toBe("/app?action=manual&amount=25");
    expect(
      buildManualPrefillHref({ total_distance: Number.NaN, fuel_amount: 0, total_cost: PREFILL_MAX.total_cost * 2 })
    ).toBe("/app?action=manual");
    expect(buildManualPrefillHref({ fuel_amount: 1e-7 })).toBe("/app?action=manual");
  });

  it("組み立てた URL を parseManualPrefill で読むと元の値に戻る", () => {
    const prefill = { total_distance: 523.4, fuel_amount: 30.12, total_cost: 5120 };
    const href = buildManualPrefillHref(prefill);
    expect(parseManualPrefill(new URL(href, "https://example.com").searchParams)).toEqual(prefill);
  });
});

describe("prefillToRecord", () => {
  const prefill = { total_distance: 400, fuel_amount: 25, total_cost: 4000 };

  it("トリップモードは区間距離も入れる", () => {
    expect(prefillToRecord(prefill, "trip")).toEqual({ record: prefill, distanceOmitted: false });
  });

  it("オドメーターモードは区間距離を入れず、そのことを返す", () => {
    expect(prefillToRecord(prefill, "odometer")).toEqual({
      record: { fuel_amount: 25, total_cost: 4000 },
      distanceOmitted: true,
    });
    expect(prefillToRecord({ fuel_amount: 25 }, "odometer")).toEqual({ record: { fuel_amount: 25 }, distanceOmitted: false });
  });
});

describe("prefillAppliedMessage", () => {
  it("車両名と、オドメーターモードの注意を入れる", () => {
    expect(prefillAppliedMessage("マイカー", false)).toBe(
      "計算した内容を「マイカー」の手動入力に入れました。日付と車両を確認して保存してください"
    );
    expect(prefillAppliedMessage(null, false)).toBe("計算した内容を手動入力に入れました。日付と車両を確認して保存してください");
    expect(prefillAppliedMessage("バイク", true)).toContain("オドメーターを入力");
  });
});
