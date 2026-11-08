import { describe, expect, it } from "vitest";
import {
  ANNUAL_GAS_COST_DESCRIPTION,
  ANNUAL_GAS_COST_FAQS,
  ANNUAL_GAS_COST_HEADING,
  ANNUAL_GAS_COST_PAGE_TITLE,
  ANNUAL_GAS_COST_PATH,
  ANNUAL_GAS_COST_TITLE,
  QUICK_ANSWER_EXAMPLE,
  YEARLY_DISTANCE_EXAMPLES,
  MONTHLY_TABLE_DISTANCES,
  MONTHLY_TABLE_EFFICIENCIES,
  buildAnnualGasCostJsonLd,
  buildMonthlyTable,
  commuteExample,
  computeAnnualGasCost,
  exampleMonthlyAndYearly,
  formatManYen,
  monthlyFromYearly,
  quickAnswerText,
  type AnnualGasCostInput,
} from "@/lib/annualGasCostPage";
import { EXAMPLE_PRICE, NATIONAL_PRICE_SURVEY_LABEL, formatPrice } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";

const base: AnnualGasCostInput = {
  mode: "distance",
  distance: "800",
  period: "month",
  oneWay: "",
  days: "20",
  efficiency: "15",
  price: "170",
};

describe("computeAnnualGasCost（距離から）", () => {
  it("月の距離から月額・年額・給油量・1km あたりを出す", () => {
    expect(computeAnnualGasCost(base)).toEqual({
      errors: {},
      warnings: [],
      monthlyCost: "9,067",
      yearlyCost: "108,800",
      monthlyDistance: "800",
      yearlyDistance: "9,600",
      monthlyFuel: "53.33",
      costPerKm: "11.3",
    });
  });

  it("年の距離を選ぶと 12 で割って月間にする", () => {
    const r = computeAnnualGasCost({ ...base, distance: "9600", period: "year" });
    expect(r.monthlyDistance).toBe("800");
    expect(r.yearlyDistance).toBe("9,600");
    expect(r.monthlyCost).toBe("9,067");
    expect(r.yearlyCost).toBe("108,800");
  });

  it("年額は丸めた月額ではなく丸める前の値の 12 倍", () => {
    // 月額 9,066.67 → 9,067 だが、年額は 9,067 × 12 = 108,804 ではなく 108,800
    const r = computeAnnualGasCost(base);
    expect(r.monthlyCost).toBe("9,067");
    expect(r.yearlyCost).toBe("108,800");
  });

  it("全角数字とカンマも読む", () => {
    const r = computeAnnualGasCost({ ...base, distance: "１,０００", efficiency: "２０", price: "１５０" });
    expect(r.monthlyCost).toBe("7,500");
    expect(r.yearlyCost).toBe("90,000");
  });
});

describe("computeAnnualGasCost（通勤から）", () => {
  const commute: AnnualGasCostInput = { ...base, mode: "commute", distance: "", oneWay: "15", days: "20" };

  it("片道 × 2 × 日数で月の距離を出す", () => {
    const r = computeAnnualGasCost(commute);
    expect(r.monthlyDistance).toBe("600");
    expect(r.yearlyDistance).toBe("7,200");
    expect(r.monthlyFuel).toBe("40.00");
    expect(r.monthlyCost).toBe("6,800");
    expect(r.yearlyCost).toBe("81,600");
  });

  it("出勤日数は 1〜31 の整数", () => {
    for (const days of ["0", "32", "1.5", "abc"]) {
      const r = computeAnnualGasCost({ ...commute, days });
      expect(r.errors.days).toBe("出勤日数は 1〜31 の整数で入力してください");
      expect(r.monthlyCost).toBeNull();
    }
    expect(computeAnnualGasCost({ ...commute, days: "31" }).errors.days).toBeUndefined();
    expect(computeAnnualGasCost({ ...commute, days: "1" }).monthlyDistance).toBe("30");
  });

  it("日数が空なら結果は出ないがエラーにしない", () => {
    const r = computeAnnualGasCost({ ...commute, days: "" });
    expect(r.errors).toEqual({});
    expect(r.monthlyCost).toBeNull();
  });

  it("モードに関係しない欄は検証しない", () => {
    const r = computeAnnualGasCost({ ...commute, distance: "abc" });
    expect(r.errors).toEqual({});
  });
});

describe("検証と注意", () => {
  it("未入力はエラーにしない", () => {
    expect(computeAnnualGasCost({ ...base, distance: "", efficiency: "", price: "" })).toMatchObject({
      errors: {},
      warnings: [],
      monthlyCost: null,
      yearlyCost: null,
      monthlyDistance: null,
      monthlyFuel: null,
      costPerKm: null,
    });
  });

  it("日本語のエラーを出す", () => {
    const r = computeAnnualGasCost({ ...base, distance: "abc", efficiency: "0", price: "0" });
    expect(r.errors.distance).toBe("走行距離は数値で入力してください");
    expect(r.errors.efficiency).toBe("燃費は 0 より大きい数値で入力してください");
    expect(r.errors.price).toBe("ガソリン単価は 0 より大きい数値で入力してください");
    expect(r.monthlyCost).toBeNull();
    const c = computeAnnualGasCost({ ...base, mode: "commute", oneWay: "0" });
    expect(c.errors.oneWay).toBe("片道の距離は 0 より大きい数値で入力してください");
  });

  it("単価が 50〜400 の外、燃費が 100 超なら注意を出しつつ計算する", () => {
    const r = computeAnnualGasCost({ ...base, price: "17", efficiency: "150" });
    expect(r.warnings).toHaveLength(2);
    expect(r.monthlyCost).not.toBeNull();
    expect(computeAnnualGasCost({ ...base, price: "401" }).warnings).toHaveLength(1);
    expect(computeAnnualGasCost({ ...base, price: "400" }).warnings).toHaveLength(0);
  });
});

/** 全国平均の単価（EXAMPLE_PRICE）での月額・年額の期待値。年額は月額の 12 倍を丸める */
function expectedAtExamplePrice(monthlyKm: number, efficiency: number) {
  const monthlyYen = (monthlyKm / efficiency) * NATIONAL_GAS_PRICE.regular;
  const yen = (v: number) => Math.round(v).toLocaleString("ja-JP");
  return { monthly: yen(monthlyYen), yearly: yen(monthlyYen * 12) };
}

describe("早見表と通勤の例", () => {
  it("例の単価は全国平均のレギュラー", () => {
    expect(EXAMPLE_PRICE).toBe(NATIONAL_GAS_PRICE.regular);
  });

  it("セルの値は computeAnnualGasCost と一致する", () => {
    const table = buildMonthlyTable();
    expect(table.map((r) => r.distance)).toEqual([...MONTHLY_TABLE_DISTANCES]);
    expect(MONTHLY_TABLE_EFFICIENCIES).toEqual([10, 15, 20, 25]);
    for (const row of table) {
      row.cells.forEach((cell, i) => {
        const r = computeAnnualGasCost({
          ...base,
          distance: String(row.distance),
          efficiency: String(MONTHLY_TABLE_EFFICIENCIES[i]),
          price: String(EXAMPLE_PRICE),
        });
        expect(cell).toEqual({ monthly: r.monthlyCost, yearly: r.yearlyCost });
      });
    }
    // 単価は全国平均のレギュラー（週次で自動更新されるので、期待値も単価から計算する）
    // 例: 1,000 km/月・15 km/L なら 66.67 L × 単価
    expect(table.find((r) => r.distance === 1000)!.cells[1]).toEqual(expectedAtExamplePrice(1000, 15));
    expect(table.find((r) => r.distance === 300)!.cells[0]).toEqual(expectedAtExamplePrice(300, 10));
  });

  it("通勤の例は 片道 15 km × 往復 × 20 日 = 月 600 km を全国平均の単価で計算する", () => {
    expect(commuteExample()).toEqual({ monthlyKm: "600", ...expectedAtExamplePrice(600, 15) });
  });
});

describe("一行回答・title・description", () => {
  const typical = () => exampleMonthlyAndYearly(QUICK_ANSWER_EXAMPLE.monthlyKm, QUICK_ANSWER_EXAMPLE.efficiency);

  it("典型例は 月 500 km・燃費 15 km/L で、早見表の行と列にある", () => {
    expect(QUICK_ANSWER_EXAMPLE).toEqual({ monthlyKm: 500, efficiency: 15 });
    expect(MONTHLY_TABLE_DISTANCES).toContain(QUICK_ANSWER_EXAMPLE.monthlyKm);
    expect(MONTHLY_TABLE_EFFICIENCIES).toContain(QUICK_ANSWER_EXAMPLE.efficiency);
    expect(typical()).toEqual(expectedAtExamplePrice(500, 15));
  });

  it("万円は小数第 1 位", () => {
    expect(formatManYen("68,000")).toBe("6.8");
    expect(formatManYen("81,600")).toBe("8.2");
    expect(formatManYen("108,800")).toBe("10.9");
  });

  it("一行回答は典型例と通勤の例の月額を、全国平均の単価で計算した値で出す", () => {
    const t = typical();
    const c = commuteExample();
    expect(quickAnswerText()).toBe(
      `月500km・燃費15km/Lなら月約${t.monthly}円（年約${formatManYen(t.yearly)}万円）、` +
        `片道15kmの通勤（月20日）なら月約${c.monthly}円です（全国平均のレギュラー${formatPrice(EXAMPLE_PRICE)}円/Lで計算）。`,
    );
  });

  it("title と H1 は「月いくら」の問いで始まり、通勤を含む", () => {
    expect(ANNUAL_GAS_COST_PAGE_TITLE).toBe("ガソリン代は月いくら？通勤・年間のガソリン代シミュレーター | FuelLens");
    expect(ANNUAL_GAS_COST_HEADING).toBe("ガソリン代は月いくら？通勤・年間のガソリン代を計算");
  });

  it("description は「月いくら」と計算した月額・年額・単価・調査日を含み、120 文字以内", () => {
    const t = typical();
    expect(ANNUAL_GAS_COST_DESCRIPTION).toContain("月いくら");
    expect(ANNUAL_GAS_COST_DESCRIPTION).toContain(`月約${t.monthly}円・年約${formatManYen(t.yearly)}万円`);
    expect(ANNUAL_GAS_COST_DESCRIPTION).toContain(`全国平均${formatPrice(EXAMPLE_PRICE)}円/L・${NATIONAL_PRICE_SURVEY_LABEL}調査`);
    expect([...ANNUAL_GAS_COST_DESCRIPTION].length).toBeLessThanOrEqual(120);
  });

  it("年間走行距離の目安は 12 で割った月間距離", () => {
    expect(YEARLY_DISTANCE_EXAMPLES.map(monthlyFromYearly)).toEqual(["417", "833"]);
  });
});

describe("定数・FAQ・JSON-LD", () => {
  it("パスと短い名前を公開する", () => {
    expect(ANNUAL_GAS_COST_PATH).toBe("/annual-gas-cost");
    expect(ANNUAL_GAS_COST_TITLE).toBe("年間ガソリン代");
  });

  it("FAQ は本文と重ならない 2〜4 問", () => {
    expect(ANNUAL_GAS_COST_FAQS.map((f) => f.q)).toEqual([
      "自分のガソリン代の月平均を知るにはどうすればいいですか？",
      "年間の金額は今後も同じになりますか？",
    ]);
    expect(ANNUAL_GAS_COST_FAQS.length).toBeGreaterThanOrEqual(2);
    expect(ANNUAL_GAS_COST_FAQS.length).toBeLessThanOrEqual(4);
  });

  it("WebApplication と FAQPage を持つ JSON になり、< をエスケープする", () => {
    const json = buildAnnualGasCostJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebApplication", "FAQPage"]);
    expect(data["@graph"][0].url).toBe("https://fuel-lens.gadelog.com/annual-gas-cost");
    expect(data["@graph"][1].mainEntity).toHaveLength(ANNUAL_GAS_COST_FAQS.length);
    ANNUAL_GAS_COST_FAQS.forEach(({ q, a }, i) => {
      expect(data["@graph"][1].mainEntity[i]).toMatchObject({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } });
    });
  });
});
