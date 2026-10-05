import { describe, expect, it } from "vitest";
import { calculateFuelMetrics, formatPricePerUnit } from "@/lib/calculations";

describe("calculateFuelMetrics", () => {
  it("computes ¥/L (1 decimal) and km/L (2 decimals) for normal values", () => {
    expect(calculateFuelMetrics(500, 40, 6000)).toEqual({
      price_per_unit: 150,
      fuel_efficiency: 12.5,
    });
  });

  it("rounds price_per_unit to 0.1 yen with Math.round(x * 10) / 10 (half up)", () => {
    expect(calculateFuelMetrics(0, 40, 6001).price_per_unit).toBe(150); // 150.025
    expect(calculateFuelMetrics(0, 40, 6020).price_per_unit).toBe(150.5); // 150.5（旧仕様では 151）
    expect(calculateFuelMetrics(0, 40, 6019).price_per_unit).toBe(150.5); // 150.475（旧仕様では 150）
    expect(calculateFuelMetrics(0, 40, 5602).price_per_unit).toBe(140.1); // 140.05
    expect(calculateFuelMetrics(0, 50, 7003).price_per_unit).toBe(140.1); // 140.06
  });

  it("keeps the pump price billed in 0.1 yen/L", () => {
    expect(calculateFuelMetrics(0, 40, 5672).price_per_unit).toBe(141.8); // 141.8（旧仕様では 142）
    expect(calculateFuelMetrics(0, 42.3, 6000).price_per_unit).toBe(141.8); // 141.843...
    expect(calculateFuelMetrics(0, 3, 1).price_per_unit).toBe(0.3); // 0.333...
  });

  it("rounds fuel_efficiency to 2 decimals via toFixed(2)", () => {
    expect(calculateFuelMetrics(500, 30, null).fuel_efficiency).toBe(16.67);
    expect(calculateFuelMetrics(1, 3, null).fuel_efficiency).toBe(0.33);
    expect(calculateFuelMetrics(2, 3, null).fuel_efficiency).toBe(0.67);
    expect(calculateFuelMetrics(100, 8, null).fuel_efficiency).toBe(12.5);
  });

  it("returns null for both metrics when fuel amount is zero", () => {
    expect(calculateFuelMetrics(500, 0, 6000)).toEqual({ price_per_unit: null, fuel_efficiency: null });
  });

  it("returns null for both metrics when fuel amount is negative", () => {
    expect(calculateFuelMetrics(500, -10, 6000)).toEqual({ price_per_unit: null, fuel_efficiency: null });
  });

  it("returns null for both metrics when fuel amount is null/undefined", () => {
    expect(calculateFuelMetrics(500, null, 6000)).toEqual({ price_per_unit: null, fuel_efficiency: null });
    expect(calculateFuelMetrics(500, undefined, 6000)).toEqual({ price_per_unit: null, fuel_efficiency: null });
  });

  it("still computes efficiency when cost is missing", () => {
    expect(calculateFuelMetrics(500, 40, null)).toEqual({ price_per_unit: null, fuel_efficiency: 12.5 });
    expect(calculateFuelMetrics(500, 40, undefined)).toEqual({ price_per_unit: null, fuel_efficiency: 12.5 });
  });

  it("still computes price when distance is missing", () => {
    expect(calculateFuelMetrics(null, 40, 6000)).toEqual({ price_per_unit: 150, fuel_efficiency: null });
    expect(calculateFuelMetrics(undefined, 40, 6000)).toEqual({ price_per_unit: 150, fuel_efficiency: null });
  });

  it("returns nulls when everything is missing", () => {
    expect(calculateFuelMetrics(null, null, null)).toEqual({ price_per_unit: null, fuel_efficiency: null });
    expect(calculateFuelMetrics(undefined, undefined, undefined)).toEqual({
      price_per_unit: null,
      fuel_efficiency: null,
    });
  });

  it("treats zero distance / zero cost as valid values (not null)", () => {
    expect(calculateFuelMetrics(0, 40, 0)).toEqual({ price_per_unit: 0, fuel_efficiency: 0 });
  });

  it("does not guard against negative distance or cost (documents current behaviour)", () => {
    // 入力画面側で下限 0 のバリデーションを行う前提。純粋関数自体は負数をそのまま計算する。
    expect(calculateFuelMetrics(-100, 10, -1000)).toEqual({ price_per_unit: -100, fuel_efficiency: -10 });
  });
});

describe("formatPricePerUnit", () => {
  it("always shows one decimal", () => {
    expect(formatPricePerUnit(141.8)).toBe("141.8");
    expect(formatPricePerUnit(160)).toBe("160.0"); // 旧仕様で保存された整数の単価
    expect(formatPricePerUnit(150.5)).toBe("150.5");
    expect(formatPricePerUnit(0)).toBe("0.0");
  });

  it("returns -- for null / undefined / non-finite values", () => {
    expect(formatPricePerUnit(null)).toBe("--");
    expect(formatPricePerUnit(undefined)).toBe("--");
    expect(formatPricePerUnit(NaN)).toBe("--");
    expect(formatPricePerUnit(Infinity)).toBe("--");
  });
});
