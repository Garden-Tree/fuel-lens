import { describe, expect, it } from "vitest";
import {
  FUEL_CONVERT_FAQS,
  FUEL_UNITS,
  buildFuelConvertJsonLd,
  buildQuickTable,
  computeFuelConvert,
  convertFuelEconomy,
  fromKmPerL,
} from "@/lib/fuelConvertPage";

describe("convertFuelEconomy", () => {
  it("15 km/L = 6.67 L/100km = 35.28 mpg (US) = 42.37 mpg (UK)", () => {
    expect(convertFuelEconomy(15, "kmpl", "l100km")).toBeCloseTo(6.6667, 3);
    expect(convertFuelEconomy(15, "kmpl", "mpgUs")).toBeCloseTo(35.2822, 3);
    expect(convertFuelEconomy(15, "kmpl", "mpgUk")).toBeCloseTo(42.3722, 3);
  });

  it("どの単位の組でも往復すると元に戻る", () => {
    for (const a of FUEL_UNITS) {
      for (const b of FUEL_UNITS) {
        expect(convertFuelEconomy(convertFuelEconomy(12.3, a, b), b, a)).toBeCloseTo(12.3, 9);
      }
    }
  });
});

describe("computeFuelConvert", () => {
  it("入力した単位の行は入力値、ほかは換算値を 2 桁で返す", () => {
    const r = computeFuelConvert({ value: "15", unit: "kmpl", price: "" });
    expect(r.values).toEqual({ kmpl: "15.00", l100km: "6.67", mpgUs: "35.28", mpgUk: "42.37" });
    expect(r.costPerKm).toBeNull();
    expect(r.costPer100km).toBeNull();
  });

  it("L/100km から入力しても km/L に換算できる", () => {
    expect(computeFuelConvert({ value: "8", unit: "l100km", price: "" }).values?.kmpl).toBe("12.50");
  });

  it("単価があれば 1km・100km あたりの燃料費を出す", () => {
    const r = computeFuelConvert({ value: "15", unit: "kmpl", price: "170" });
    expect(r.costPerKm).toBe("11.3");
    expect(r.costPer100km).toBe("1,133");
  });

  it("未入力はエラーにせず結果も出さない", () => {
    expect(computeFuelConvert({ value: "", unit: "kmpl", price: "" })).toEqual({
      errors: {},
      values: null,
      costPerKm: null,
      costPer100km: null,
    });
  });

  it("0 以下・数値でない入力は日本語のエラーにする", () => {
    expect(computeFuelConvert({ value: "0", unit: "kmpl", price: "" })).toMatchObject({
      errors: { value: "km/Lは 0 より大きい数値で入力してください" },
      values: null,
    });
    expect(computeFuelConvert({ value: "-5", unit: "mpgUs", price: "" }).errors.value).toBe("mpg (US)は数値で入力してください");
    expect(computeFuelConvert({ value: "abc", unit: "l100km", price: "" }).errors.value).toBe("L/100kmは数値で入力してください");
    expect(computeFuelConvert({ value: "15", unit: "kmpl", price: "x" }).errors.price).toBe("ガソリン単価は数値で入力してください");
    expect(computeFuelConvert({ value: "15", unit: "kmpl", price: "0" }).errors.price).toBe("ガソリン単価は 0 より大きい数値で入力してください");
  });
});

describe("buildQuickTable", () => {
  it("換算関数と同じ値になる", () => {
    const table = buildQuickTable();
    expect(table.map((r) => r.kmpl)).toEqual([5, 10, 15, 20, 25, 30, 40, 50]);
    for (const row of table) {
      expect(row.l100km).toBe(fromKmPerL(row.kmpl, "l100km").toFixed(2));
      expect(row.mpgUs).toBe(fromKmPerL(row.kmpl, "mpgUs").toFixed(2));
      expect(row.mpgUk).toBe(fromKmPerL(row.kmpl, "mpgUk").toFixed(2));
    }
    expect(table[2]).toMatchObject({ l100km: "6.67", mpgUs: "35.28", mpgUk: "42.37" });
  });
});

describe("buildFuelConvertJsonLd", () => {
  it("WebApplication と FAQPage を持ち、< を含まない", () => {
    const json = buildFuelConvertJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebApplication", "FAQPage"]);
    expect(data["@graph"][0].url).toBe("https://fuel-lens.gadelog.com/fuel-convert");
    expect(data["@graph"][1].mainEntity).toHaveLength(FUEL_CONVERT_FAQS.length);
    expect(data["@graph"][1].mainEntity[0].name).toBe(FUEL_CONVERT_FAQS[0].q);
  });

  it("FAQ に < が混じっても script を閉じられない形にエスケープする", () => {
    FUEL_CONVERT_FAQS.push({ q: "</script>?", a: "<b>x</b>" });
    try {
      const json = buildFuelConvertJsonLd();
      expect(json).not.toContain("<");
      expect(JSON.parse(json)["@graph"][1].mainEntity.at(-1).name).toBe("</script>?");
    } finally {
      FUEL_CONVERT_FAQS.pop();
    }
  });
});
