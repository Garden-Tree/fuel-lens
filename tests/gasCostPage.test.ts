import { describe, expect, it } from "vitest";
import { GAS_COST_FAQS, buildGasCostJsonLd, buildQuickTable, commuteExample, computeGasCost, type GasCostInput } from "@/lib/gasCostPage";

const base: GasCostInput = { distance: "300", efficiency: "15", price: "170", people: "", roundTrip: false };

describe("computeGasCost", () => {
  it("ガソリン量・ガソリン代・1km あたりのガソリン代を出す", () => {
    expect(computeGasCost(base)).toEqual({
      errors: {},
      warnings: [],
      totalDistance: "300",
      fuel: "20.00",
      cost: "3,400",
      people: null,
      perPerson: null,
      costPerKm: "11.3",
    });
  });

  it("往復は距離を 2 倍にする", () => {
    const r = computeGasCost({ ...base, roundTrip: true });
    expect(r.totalDistance).toBe("600");
    expect(r.fuel).toBe("40.00");
    expect(r.cost).toBe("6,800");
    expect(r.costPerKm).toBe("11.3");
  });

  it("丸める前の値で計算し、表示のときだけ丸める", () => {
    // 10 / 3 = 3.333… L × 155 = 516.67 → 517 円（表示の 3.33 L で掛けた 516.15 → 516 にはしない）
    const r = computeGasCost({ distance: "10", efficiency: "3", price: "155", people: "", roundTrip: false });
    expect(r.fuel).toBe("3.33");
    expect(r.cost).toBe("517");
  });

  it("2 人以上なら 1 人あたりを出し、1 円未満は切り上げる", () => {
    const r = computeGasCost({ ...base, people: "3" });
    expect(r.people).toBe(3);
    expect(r.perPerson).toBe("1,134");
    expect(computeGasCost({ ...base, people: "2" }).perPerson).toBe("1,700");
    expect(computeGasCost({ ...base, people: "1" })).toMatchObject({ people: null, perPerson: null });
  });

  it("全角数字とカンマも読む", () => {
    const r = computeGasCost({ distance: "１,２００", efficiency: "２０", price: "１５０", people: "４", roundTrip: false });
    expect(r.totalDistance).toBe("1,200");
    expect(r.fuel).toBe("60.00");
    expect(r.cost).toBe("9,000");
    expect(r.perPerson).toBe("2,250");
  });

  it("未入力はエラーにしない。出せる結果だけ出す", () => {
    expect(computeGasCost({ distance: "", efficiency: "", price: "", people: "", roundTrip: false })).toMatchObject({
      errors: {},
      warnings: [],
      totalDistance: null,
      fuel: null,
      cost: null,
      costPerKm: null,
    });
    // 距離がなくても 1km あたりは出る
    expect(computeGasCost({ ...base, distance: "" })).toMatchObject({ cost: null, fuel: null, costPerKm: "11.3" });
    // 単価がなければガソリン量だけ
    expect(computeGasCost({ ...base, price: "" })).toMatchObject({ fuel: "20.00", cost: null, costPerKm: null });
  });

  it("数値でない・0 以下・人数の範囲外は日本語のエラー", () => {
    const r = computeGasCost({ distance: "abc", efficiency: "0", price: "-1", people: "1.5", roundTrip: false });
    expect(r.errors.distance).toBe("走行距離は数値で入力してください");
    expect(r.errors.efficiency).toBe("燃費は 0 より大きい数値で入力してください");
    expect(r.errors.price).toBeDefined();
    expect(r.errors.people).toBe("人数は 1〜99 の整数で入力してください");
    expect(r.cost).toBeNull();
    expect(computeGasCost({ ...base, people: "0" }).errors.people).toBeDefined();
    expect(computeGasCost({ ...base, people: "100" }).errors.people).toBeDefined();
    const bad = computeGasCost({ ...base, people: "x" });
    expect(bad.errors.people).toBeDefined();
    expect(bad).toMatchObject({ cost: "3,400", perPerson: null });
  });

  it("単価・燃費が桁違いらしいときは注意を出す（計算はする）", () => {
    const low = computeGasCost({ ...base, price: "1.7" });
    expect(low.warnings).toHaveLength(1);
    expect(low.warnings[0]).toContain("円/L");
    expect(low.cost).toBe("34");
    expect(computeGasCost({ ...base, price: "1700" }).warnings).toHaveLength(1);
    expect(computeGasCost({ ...base, price: "50" }).warnings).toEqual([]);
    expect(computeGasCost({ ...base, price: "400" }).warnings).toEqual([]);
    // 50cc スクーターの 60〜100 km/L は注意しない
    expect(computeGasCost({ ...base, efficiency: "80" }).warnings).toEqual([]);
    const high = computeGasCost({ ...base, efficiency: "150" });
    expect(high.warnings).toHaveLength(1);
    expect(high.warnings[0]).toContain("燃費");
  });
});

describe("buildGasCostJsonLd", () => {
  it("WebApplication と FAQPage を持つ JSON になる", () => {
    const json = buildGasCostJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@context"]).toBe("https://schema.org");
    const types = data["@graph"].map((node: { "@type": string }) => node["@type"]);
    expect(types).toEqual(["WebApplication", "FAQPage"]);
    expect(data["@graph"][0].url).toBe("https://fuel-lens.gadelog.com/gas-cost");
    const faq = data["@graph"][1];
    expect(faq.mainEntity).toHaveLength(GAS_COST_FAQS.length);
    expect(faq.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: GAS_COST_FAQS[0].q,
      acceptedAnswer: { "@type": "Answer", text: GAS_COST_FAQS[0].a },
    });
  });
});

describe("早見表", () => {
  it("セルの値は computeGasCost と一致する", () => {
    const table = buildQuickTable();
    expect(table.map((r) => r.distance)).toEqual([50, 100, 200, 300, 500, 1000]);
    // 燃費 10 / 15 / 20 / 25 km/L の順
    const cell = (d: number, i: number) => table.find((r) => r.distance === d)!.costs[i];
    expect(cell(300, 1)).toBe("3,400");
    expect(cell(1000, 0)).toBe("17,000");
    expect(cell(100, 1)).toBe(computeGasCost({ ...base, distance: "100" }).cost);
    expect(cell(50, 3)).toBe(computeGasCost({ ...base, distance: "50", efficiency: "25" }).cost);
    expect(cell(500, 2)).toBe(computeGasCost({ ...base, distance: "500", efficiency: "20" }).cost);
  });

  it("通勤の例は往復 × 日数で計算される", () => {
    expect(commuteExample()).toEqual({ perDay: "340", perMonth: "6,800" });
  });

  it("FAQ の 100km の例は表と同じ値で、JSON-LD は < をエスケープする", () => {
    const faq = GAS_COST_FAQS.find((f) => f.q.startsWith("100km"))!;
    expect(faq.a).toContain(buildQuickTable()[1].costs[1]);
    expect(buildGasCostJsonLd()).not.toContain("<");
    expect(() => JSON.parse(buildGasCostJsonLd())).not.toThrow();
  });
});
