import { describe, expect, it } from "vitest";
import { monthKeyOf, monthStartOf, monthSummaryOf } from "@/lib/home/month";
import type { FuelRecord } from "@/lib/types";

function rec(id: string, date: string, extra: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id,
    date,
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    ...extra,
  };
}

// ローカル時刻の 2026年10月15日
const TODAY = new Date(2026, 9, 15, 12, 0, 0);

describe("monthSummaryOf", () => {
  it("今月（ローカル暦）の給油代・給油量・回数を集計する", () => {
    const records = [
      rec("a", "2026-10-31", { total_cost: 4920, fuel_amount: 29.11, price_per_unit: 169 }),
      rec("b", "2026-10-01", { total_cost: 3000, fuel_amount: 20 }),
      rec("c", "2026-09-30", { total_cost: 9999, fuel_amount: 50, price_per_unit: 168 }),
      rec("d", "2026-11-01", { total_cost: 1, fuel_amount: 1 }),
    ];
    const s = monthSummaryOf(records, TODAY);
    expect(s.monthKey).toBe("2026-10");
    expect(s.label).toBe("10月");
    expect(s.count).toBe(2);
    expect(s.totalCost).toBe(7920);
    expect(s.totalFuel).toBeCloseTo(49.11);
  });

  it("日付の無い・不正な記録は数えない", () => {
    const records = [rec("a", "", { total_cost: 100 }), rec("b", "2026-10-32", { total_cost: 100 })];
    const s = monthSummaryOf(records, TODAY);
    expect(s.count).toBe(0);
    expect(s.totalCost).toBeNull();
    expect(s.totalFuel).toBe(0);
  });

  it("支払総額の分かる記録が無ければ給油代は null", () => {
    const s = monthSummaryOf([rec("a", "2026-10-02", { fuel_amount: 10 })], TODAY);
    expect(s.count).toBe(1);
    expect(s.totalCost).toBeNull();
  });

  it("単価は今月の最新と、その 1 つ前（先月以前を含む）の差", () => {
    const records = [
      rec("a", "2026-10-10", { price_per_unit: 169 }),
      rec("b", "2026-10-03", { total_cost: 1680, fuel_amount: 10 }), // 168.0
      rec("c", "2026-09-20", { price_per_unit: 170 }),
    ];
    const s = monthSummaryOf(records, TODAY);
    expect(s.latestPrice).toBe(169);
    expect(s.priceDiff).toBeCloseTo(1);
  });

  it("今月の単価が 1 件だけなら先月の単価と比べる", () => {
    const records = [rec("a", "2026-10-10", { price_per_unit: 165 }), rec("c", "2026-09-20", { price_per_unit: 170 })];
    const s = monthSummaryOf(records, TODAY);
    expect(s.latestPrice).toBe(165);
    expect(s.priceDiff).toBeCloseTo(-5);
  });

  it("今月に単価の分かる記録が無ければ単価も差も null（未来の記録は無視）", () => {
    const records = [rec("a", "2026-09-20", { price_per_unit: 170 }), rec("b", "2026-11-02", { price_per_unit: 171 })];
    const s = monthSummaryOf(records, TODAY);
    expect(s.latestPrice).toBeNull();
    expect(s.priceDiff).toBeNull();
  });

  it("比べる単価が無ければ差は null", () => {
    const s = monthSummaryOf([rec("a", "2026-10-10", { price_per_unit: 165 })], TODAY);
    expect(s.latestPrice).toBe(165);
    expect(s.priceDiff).toBeNull();
  });

  it("月の境界: 1 月は前年の 12 月を含まない", () => {
    const s = monthSummaryOf([rec("a", "2025-12-31", { total_cost: 1 }), rec("b", "2026-01-01", { total_cost: 2 })], new Date(2026, 0, 1, 0, 0, 0));
    expect(s.label).toBe("1月");
    expect(s.count).toBe(1);
    expect(s.totalCost).toBe(2);
  });
});

describe("monthKeyOf / monthStartOf", () => {
  it("ローカル暦の YYYY-MM と、その月の 1 日", () => {
    expect(monthKeyOf(new Date(2026, 9, 31, 23, 59))).toBe("2026-10");
    expect(monthKeyOf(new Date(2026, 10, 1, 0, 0))).toBe("2026-11");
    const start = monthStartOf("2026-01");
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 0, 1]);
    expect(monthKeyOf(monthStartOf("2026-12"))).toBe("2026-12");
  });
});
