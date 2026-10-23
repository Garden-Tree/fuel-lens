import { describe, expect, it } from "vitest";
import {
  DISTANCE_TABLE_DISTANCES,
  DISTANCE_TABLE_EFFICIENCIES,
  EXAMPLE_PRICE,
  GAS_COST_DESCRIPTION,
  GAS_COST_FAQS,
  GAS_COST_PAGE_TITLE,
  buildGasCostJsonLd,
  commuteExample,
  computeGasCost,
  distanceCostTable,
  distanceLink,
  parseDistancePrefill,
  type GasCostInput,
} from "@/lib/gasCostPage";

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

describe("距離別の目安表", () => {
  it("セルの値は computeGasCost と一致する", () => {
    const table = distanceCostTable();
    expect(table.map((r) => r.distance)).toEqual([10, 14, 20, 30, 50, 100, 150, 180, 200, 300, 500, 1000]);
    expect(EXAMPLE_PRICE).toBe(170);
    // 燃費 10 / 15 / 20 / 25 km/L の順
    const cell = (d: number, i: number) => table.find((r) => r.distance === d)!.costs[i];
    expect(cell(300, 1)).toBe("3,400");
    expect(cell(1000, 0)).toBe("17,000");
    expect(cell(100, 1)).toBe(computeGasCost({ ...base, distance: "100" }).cost);
    expect(cell(50, 3)).toBe(computeGasCost({ ...base, distance: "50", efficiency: "25" }).cost);
    expect(cell(500, 2)).toBe(computeGasCost({ ...base, distance: "500", efficiency: "20" }).cost);
    expect(cell(180, 1)).toBe("2,040");
    expect(cell(14, 0)).toBe("238");
  });

  it("全セルが computeGasCost と一致する", () => {
    for (const { distance, costs } of distanceCostTable()) {
      expect(costs).toHaveLength(DISTANCE_TABLE_EFFICIENCIES.length);
      costs.forEach((cost, i) => {
        const expected = computeGasCost({
          distance: String(distance),
          efficiency: String(DISTANCE_TABLE_EFFICIENCIES[i]),
          price: String(EXAMPLE_PRICE),
          people: "",
          roundTrip: false,
        }).cost;
        expect(cost).toBe(expected);
      });
    }
  });

  it("行のリンクは計算機への ?km= で、受け取れるのは表の距離だけ", () => {
    expect(distanceLink(300)).toBe("/gas-cost?km=300#gas-cost-calculator");
    for (const d of DISTANCE_TABLE_DISTANCES) {
      expect(parseDistancePrefill(`?km=${d}`)).toBe(String(d));
    }
    expect(parseDistancePrefill("")).toBe("");
    expect(parseDistancePrefill("?km=")).toBe("");
    expect(parseDistancePrefill("?km=abc")).toBe("");
    expect(parseDistancePrefill("?km=301")).toBe("");
    expect(parseDistancePrefill("?km=-300")).toBe("");
    expect(parseDistancePrefill("?km=300.0")).toBe("");
    expect(parseDistancePrefill("?km=<script>")).toBe("");
    expect(parseDistancePrefill("?other=300")).toBe("");
  });

  it("タイトルと説明文は「〇〇キロ走るといくら」に答える形で、長すぎない", () => {
    expect(GAS_COST_PAGE_TITLE).toContain("ガソリン代計算");
    expect(GAS_COST_PAGE_TITLE).toContain("300km");
    expect(GAS_COST_PAGE_TITLE.endsWith("| FuelLens")).toBe(true);
    expect(GAS_COST_DESCRIPTION).toContain("300キロ");
    expect(GAS_COST_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
    expect(GAS_COST_DESCRIPTION.length).toBeLessThanOrEqual(125);
  });

  it("FAQ の 300km の例と距離から計算する式は表と同じ値", () => {
    const row300 = distanceCostTable().find((r) => r.distance === 300)!;
    const faq300 = GAS_COST_FAQS.find((f) => f.q.startsWith("300km"))!;
    expect(faq300.a).toContain(`${row300.costs[1]} 円`);
    expect(faq300.a).toContain(row300.costs[0]);
    expect(faq300.a).toContain(row300.costs[2]);
    const formula = GAS_COST_FAQS.find((f) => f.q === "ガソリン代を距離から計算する式は？")!;
    expect(formula.a).toContain("走行距離（km）÷ 燃費（km/L）× ガソリン単価（円/L）");
    expect(formula.a).toContain(distanceCostTable().find((r) => r.distance === 180)!.costs[1]);
  });

  it("通勤の例は往復 × 日数で計算される", () => {
    expect(commuteExample()).toEqual({ perDay: "340", perMonth: "6,800" });
  });

  it("FAQ の 100km の例は表と同じ値で、JSON-LD は < をエスケープする", () => {
    const faq = GAS_COST_FAQS.find((f) => f.q.startsWith("100km"))!;
    expect(faq.a).toContain(distanceCostTable().find((r) => r.distance === 100)!.costs[1]);
    expect(buildGasCostJsonLd()).not.toContain("<");
    expect(() => JSON.parse(buildGasCostJsonLd())).not.toThrow();
  });

  it("FAQ に </script> が含まれても JSON-LD に < が残らない", () => {
    const original = GAS_COST_FAQS.slice();
    GAS_COST_FAQS.push({ q: "</script><b>q</b>", a: "</script><script>alert(1)</script>" });
    try {
      const json = buildGasCostJsonLd();
      expect(json).not.toContain("<");
      expect(json).toContain("\\u003c/script>");
      expect(JSON.parse(json)["@graph"].length).toBeGreaterThan(0);
    } finally {
      GAS_COST_FAQS.splice(0, GAS_COST_FAQS.length, ...original);
    }
  });
});
