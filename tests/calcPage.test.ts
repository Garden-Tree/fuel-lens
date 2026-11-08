import { describe, expect, it } from "vitest";
import {
  CALC_DESCRIPTION,
  CALC_EXAMPLE,
  CALC_FAQS,
  CALC_H1,
  CALC_PAGE_TITLE,
  buildCalcJsonLd,
  calcExample,
  calcOgFormula,
  calcQuickAnswerText,
  calcRecordHref,
  computeCalc,
} from "@/lib/calcPage";
import { calculateFuelMetrics } from "@/lib/calculations";
import { CAR_TYPE_EFFICIENCIES } from "@/lib/gasCostPage";
import { parseManualPrefill } from "@/lib/manualPrefill";

describe("computeCalc", () => {
  it("燃費・単価・1km あたりの燃料費を出す", () => {
    expect(computeCalc({ distance: "400", amount: "25", cost: "4000" })).toEqual({
      errors: {},
      warning: null,
      efficiency: "16.00",
      pricePerUnit: "160.0",
      costPerKm: "10.0",
    });
  });

  it("支払総額が無ければ燃費だけ出す。全角数字とカンマも読む", () => {
    const r = computeCalc({ distance: "５２３．４", amount: "30.12", cost: "" });
    expect(r.efficiency).toBe("17.38");
    expect(r.pricePerUnit).toBeNull();
    expect(r.costPerKm).toBeNull();
    expect(computeCalc({ distance: "1,200", amount: "60", cost: "" }).efficiency).toBe("20.00");
  });

  it("未入力はエラーにしない", () => {
    expect(computeCalc({ distance: "", amount: "", cost: "" })).toMatchObject({ errors: {}, efficiency: null });
  });

  it("数値でない・0 以下は日本語のエラー", () => {
    const r = computeCalc({ distance: "abc", amount: "0", cost: "-1" });
    expect(r.errors.distance).toBe("走行距離は数値で入力してください");
    expect(r.errors.amount).toBe("給油量は 0 より大きい数値で入力してください");
    expect(r.errors.cost).toBeDefined();
    expect(r.efficiency).toBeNull();
  });

  it("オドメーターらしい距離には注意を出す", () => {
    expect(computeCalc({ distance: "45000", amount: "40", cost: "" }).warning).toContain("オドメーター");
  });
});

describe("calcRecordHref", () => {
  it("走行距離（区間距離）・給油量・支払総額をアプリの手動入力の URL にする", () => {
    expect(calcRecordHref({ distance: "400", amount: "25", cost: "4000" })).toBe(
      "/app?action=manual&distance=400&amount=25&cost=4000"
    );
  });

  it("支払総額は任意（空・0 なら載せない）", () => {
    expect(calcRecordHref({ distance: "400", amount: "25", cost: "" })).toBe("/app?action=manual&distance=400&amount=25");
    expect(calcRecordHref({ distance: "400", amount: "25", cost: "0" })).toBe("/app?action=manual&distance=400&amount=25");
  });

  it("全角数字・カンマは読み取った数値で載せ、アプリ側で同じ値に戻る", () => {
    const href = calcRecordHref({ distance: "５２３．４", amount: "30.12", cost: "5,120" });
    expect(href).toBe("/app?action=manual&distance=523.4&amount=30.12&cost=5120");
    expect(parseManualPrefill(new URL(href!, "https://example.com").searchParams)).toEqual({
      total_distance: 523.4,
      fuel_amount: 30.12,
      total_cost: 5120,
    });
  });

  it("走行距離か給油量が無い・どこかにエラーがあれば null", () => {
    expect(calcRecordHref({ distance: "", amount: "25", cost: "" })).toBeNull();
    expect(calcRecordHref({ distance: "400", amount: "", cost: "4000" })).toBeNull();
    expect(calcRecordHref({ distance: "400", amount: "0", cost: "" })).toBeNull();
    expect(calcRecordHref({ distance: "400", amount: "25", cost: "abc" })).toBeNull();
  });
});

describe("buildCalcJsonLd", () => {
  it("WebApplication と FAQPage を持つ JSON になる", () => {
    const json = buildCalcJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@context"]).toBe("https://schema.org");
    const types = data["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toEqual(["WebApplication", "FAQPage"]);
    const faq = data["@graph"][1];
    expect(faq.mainEntity).toHaveLength(CALC_FAQS.length);
    expect(faq.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: CALC_FAQS[0].q,
      acceptedAnswer: { "@type": "Answer", text: CALC_FAQS[0].a },
    });
  });
});

describe("タイトル・見出し・一行回答", () => {
  const len = (str: string) => [...str].length;

  it("タイトルは「燃費計算」で始まり、` | FuelLens` を除いて 32 字以内", () => {
    const title = CALC_PAGE_TITLE.replace(/ \| FuelLens$/, "");
    expect(title.startsWith("燃費計算")).toBe(true);
    expect(title).toContain("満タン法");
    expect(len(title)).toBeLessThanOrEqual(32);
    expect(CALC_H1).toContain("燃費計算");
    expect(CALC_DESCRIPTION).toContain("登録不要・無料");
  });

  it("一行回答の燃費は calculateFuelMetrics の結果と一致する（手で書いた数字ではない）", () => {
    const { fuel_efficiency, price_per_unit } = calculateFuelMetrics(CALC_EXAMPLE.distance, CALC_EXAMPLE.amount, CALC_EXAMPLE.cost);
    const example = calcExample();
    expect(example.efficiency).toBe(fuel_efficiency!.toFixed(2));
    expect(example.pricePerUnit).toBe(price_per_unit!.toFixed(1));
    expect(example.costPerKm).toBe((CALC_EXAMPLE.cost / CALC_EXAMPLE.distance).toFixed(1));
    expect(calcQuickAnswerText()).toContain(`燃費は${fuel_efficiency!.toFixed(2)}km/L`);
    expect(calcQuickAnswerText()).toContain(`${CALC_EXAMPLE.distance}km`);
    expect(calcQuickAnswerText()).toContain(`${CALC_EXAMPLE.amount}L`);
  });

  it("OG 画像の式は一行回答と同じ計算例（距離・給油量・燃費）", () => {
    const parts = calcOgFormula();
    expect(parts.map((p) => p.text).join(" ")).toBe(
      `${CALC_EXAMPLE.distance} km ÷ ${CALC_EXAMPLE.amount} L = ${calcExample().efficiency} km/L`
    );
    expect(parts.filter((p) => p.kind === "result")).toEqual([{ text: calcExample().efficiency, kind: "result" }]);
  });
});

describe("CALC_FAQS", () => {
  it("2〜4 問で、計算式の問いは計算例と同じ数字を使う", () => {
    expect(CALC_FAQS.length).toBeGreaterThanOrEqual(2);
    expect(CALC_FAQS.length).toBeLessThanOrEqual(4);
    const formula = CALC_FAQS.find((f) => f.q === "燃費計算の式は？")!;
    const { pricePerUnit, costPerKm } = calcExample();
    expect(formula.a).toContain(`単価は${pricePerUnit}円/L`);
    expect(formula.a).toContain(`1kmあたり${costPerKm}円`);
  });

  it("燃費の目安は CAR_TYPE_EFFICIENCIES の値をそのまま使う", () => {
    const typical = CALC_FAQS.find((f) => f.q.includes("目安"))!;
    for (const c of CAR_TYPE_EFFICIENCIES) expect(typical.a).toContain(`${c.label}で約${c.efficiency}km/L`);
  });
});
