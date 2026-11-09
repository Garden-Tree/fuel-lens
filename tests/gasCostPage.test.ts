import { describe, expect, it } from "vitest";
import {
  CAR_TYPE_EFFICIENCIES,
  DISTANCE_TABLE_DISTANCES,
  EXAMPLE_HIGH_OCTANE_PRICE,
  EXAMPLE_PRICE,
  FORMULA_EXAMPLE,
  FUEL_GRADES,
  GAS_COST_DESCRIPTION,
  GAS_COST_FAQS,
  GAS_COST_PAGE_TITLE,
  buildGasCostJsonLd,
  commuteExample,
  computeGasCost,
  formatPrice,
  formulaExample,
  quickAnswer,
  quickAnswerText,
  distanceCostTable,
  distanceLink,
  parseDistancePrefill,
  type GasCostInput,
} from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import { formatJaDate } from "@/lib/format";

const base: GasCostInput = { distance: "300", efficiency: "15", price: "170", people: "", roundTrip: false };

// 例の単価（全国平均）は週次で自動更新されるので、例の金額の期待値は単価から計算する（computeGasCost と同じく 1 円未満を四捨五入）
const REGULAR = NATIONAL_GAS_PRICE.regular;
const HIGH_OCTANE = NATIONAL_GAS_PRICE.highOctane;
const yenAt = (distanceKm: number, efficiency: number, price: number) =>
  Math.round((distanceKm / efficiency) * price).toLocaleString("ja-JP");

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

  it("全角カンマ入りの距離（１，０００）も読める", () => {
    const r = computeGasCost({ distance: "１，０００", efficiency: "10", price: "170", people: "", roundTrip: false });
    expect(r.errors).toEqual({});
    expect(r.cost).toBe("17,000");
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
  it("列は車種の燃費の目安で、レギュラーとハイオクの例の単価を持つ", () => {
    expect(CAR_TYPE_EFFICIENCIES.map((c) => [c.label, c.efficiency])).toEqual([
      ["軽自動車", 20],
      ["普通車", 13],
      ["ハイブリッド車", 25],
      ["ミニバン・ワンボックス", 10],
    ]);
    // 例の単価は全国平均（lib/nationalGasPrice.ts）
    expect(EXAMPLE_PRICE).toBe(NATIONAL_GAS_PRICE.regular);
    expect(EXAMPLE_HIGH_OCTANE_PRICE).toBe(NATIONAL_GAS_PRICE.highOctane);
    expect(FUEL_GRADES.map((g) => g.price)).toEqual([EXAMPLE_PRICE, EXAMPLE_HIGH_OCTANE_PRICE]);
  });

  it("セルの値は computeGasCost と一致する", () => {
    const table = distanceCostTable();
    expect(table.map((r) => r.distance)).toEqual([10, 14, 20, 30, 50, 100, 150, 180, 200, 300, 500, 1000]);
    // 軽 20 / 普通車 13 / ハイブリッド 25 / ミニバン 10 km/L の順
    const cell = (d: number, i: number, t = table) => t.find((r) => r.distance === d)!.costs[i];
    // レギュラー（全国平均）
    expect(cell(300, 0)).toBe(yenAt(300, 20, REGULAR));
    expect(cell(300, 1)).toBe(yenAt(300, 13, REGULAR));
    expect(cell(300, 2)).toBe(yenAt(300, 25, REGULAR));
    expect(cell(1000, 3)).toBe(yenAt(1000, 10, REGULAR));
    // ハイオク（全国平均）
    expect(cell(300, 0, distanceCostTable(EXAMPLE_HIGH_OCTANE_PRICE))).toBe(yenAt(300, 20, HIGH_OCTANE));
  });

  it("全セルが computeGasCost と一致する（レギュラー・ハイオクとも）", () => {
    for (const { price } of FUEL_GRADES) {
      for (const { distance, costs } of distanceCostTable(price)) {
        expect(costs).toHaveLength(CAR_TYPE_EFFICIENCIES.length);
        costs.forEach((cost, i) => {
          const expected = computeGasCost({
            distance: String(distance),
            efficiency: String(CAR_TYPE_EFFICIENCIES[i].efficiency),
            price: String(price),
            people: "",
            roundTrip: false,
          }).cost;
          expect(cost).toBe(expected);
        });
      }
    }
  });

  it("行のリンクは計算機への ?km= で、受け取れるのは 1〜2000 の整数だけ", () => {
    expect(distanceLink(300)).toBe("/gas-cost?km=300#gas-cost-calculator");
    for (const d of DISTANCE_TABLE_DISTANCES) {
      expect(parseDistancePrefill(`?km=${d}`)).toBe(String(d));
    }
    expect(parseDistancePrefill("")).toBe("");
    expect(parseDistancePrefill("?km=")).toBe("");
    expect(parseDistancePrefill("?km=abc")).toBe("");
    // 主要区間（/route-gas-cost）の距離も受け取る。範囲外・先頭 0 は受け取らない
    expect(parseDistancePrefill("?km=470")).toBe("470");
    expect(parseDistancePrefill("?km=2000")).toBe("2000");
    expect(parseDistancePrefill("?km=2001")).toBe("");
    expect(parseDistancePrefill("?km=0")).toBe("");
    expect(parseDistancePrefill("?km=0300")).toBe("");
    expect(parseDistancePrefill("?km=３００")).toBe("");
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
    expect(GAS_COST_DESCRIPTION).toContain("300km");
    expect(GAS_COST_PAGE_TITLE).toContain("普通車");
    expect(GAS_COST_PAGE_TITLE).toContain("軽自動車");
    expect(GAS_COST_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
    expect(GAS_COST_DESCRIPTION.length).toBeLessThanOrEqual(125);
  });

  it("本文に書いている計算式の例（150km・15km/L・全国平均の単価）は computeGasCost と一致する", () => {
    expect(FORMULA_EXAMPLE).toEqual({ distanceKm: 150, efficiency: 15 });
    expect(formulaExample()).toEqual({ fuel: "10.00", cost: yenAt(150, 15, REGULAR), costPerKm: (REGULAR / 15).toFixed(1) });
  });

  it("冒頭の一行回答は距離別の目安表の 300 km の行と同じ金額", () => {
    const { distance, items } = quickAnswer();
    expect(distance).toBe(300);
    const row = distanceCostTable().find((r) => r.distance === 300)!;
    for (const item of items) {
      const i = CAR_TYPE_EFFICIENCIES.findIndex((c) => c.label === item.label);
      expect(item.cost).toBe(row.costs[i]);
    }
    const standard = yenAt(300, 13, REGULAR);
    const kei = yenAt(300, 20, REGULAR);
    expect(quickAnswerText()).toBe(
      `300kmなら、普通車（燃費13km/L）で約${standard}円、軽自動車（燃費20km/L）で約${kei}円です（全国平均のレギュラー${REGULAR.toFixed(1)}円/Lで計算）。`
    );
    // meta description も同じ数字と調査日を使う
    expect(GAS_COST_DESCRIPTION).toContain(`普通車で約${standard}円`);
    expect(GAS_COST_DESCRIPTION).toContain(`軽自動車で約${kei}円`);
    expect(GAS_COST_DESCRIPTION).toContain(`${formatJaDate(NATIONAL_GAS_PRICE.surveyDate)}調査`);
  });

  it("単価と日付の表示", () => {
    expect(formatPrice(170.1)).toBe("170.1");
    expect(formatPrice(181.0)).toBe("181.0");
    expect(formatJaDate("2026-10-26")).toBe("2026年10月26日");
    expect(formatJaDate("2026-01-05")).toBe("2026年1月5日");
  });

  it("通勤の例は往復 × 日数で計算される", () => {
    // 片道 15 km・燃費 15 km/L・月 20 日: 1 日は往復 30 km、月は 600 km
    expect(commuteExample()).toEqual({ perDay: yenAt(30, 15, REGULAR), perMonth: yenAt(600, 15, REGULAR) });
  });

  it("FAQ は本文で答えていない質問だけで、JSON-LD は < をエスケープする", () => {
    expect(GAS_COST_FAQS.length).toBeGreaterThanOrEqual(1);
    expect(GAS_COST_FAQS.length).toBeLessThanOrEqual(4);
    expect(new Set(GAS_COST_FAQS.map((f) => f.q)).size).toBe(GAS_COST_FAQS.length);
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
