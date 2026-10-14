import { describe, expect, it } from "vitest";
import { CALC_FAQS, buildCalcJsonLd, computeCalc } from "@/lib/calcPage";

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
