import { describe, expect, it } from "vitest";
import { efficiencyDeltaOf, heroModelOf } from "@/lib/home/hero";
import { formatMonthDay, formatShortDate, formatYen, recentRowOf, stationLabel } from "@/lib/home/recent";
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

/** 連鎖計算済みの満タン記録（run_* 付き） */
function full(id: string, date: string, km: number, liters: number): FuelRecord {
  const eff = Math.round((km / liters) * 100) / 100;
  return rec(id, date, {
    total_distance: km,
    fuel_amount: liters,
    fuel_efficiency: eff,
    run_distance: km,
    run_fuel: liters,
  });
}

describe("efficiencyDeltaOf", () => {
  it("向上・悪化・変わらない", () => {
    expect(efficiencyDeltaOf(15.12, 12.58)).toEqual({ value: 2.54, direction: "up", text: "2.54" });
    expect(efficiencyDeltaOf(12, 13.5)).toEqual({ value: -1.5, direction: "down", text: "1.50" });
    expect(efficiencyDeltaOf(12.001, 12.003).direction).toBe("flat");
  });
});

describe("heroModelOf", () => {
  // 日付の降順（useVehicleScope の records と同じ）
  const records = [full("c", "2026-10-10", 450, 30), full("b", "2026-09-20", 400, 32), full("a", "2026-09-01", 500, 40)];

  it("燃費・前回比・平均（Σkm ÷ ΣL）・目盛り", () => {
    const m = heroModelOf(records, records[0]);
    expect(m.efficiency).toBe(15);
    expect(m.nullReason).toBeNull();
    expect(m.delta).toEqual({ value: 2.5, direction: "up", text: "2.50" });
    expect(m.average).toBeCloseTo(1350 / 102);
    expect(m.scale.min).toBeLessThanOrEqual(12.5);
    expect(m.scale.max).toBeGreaterThanOrEqual(15);
  });

  it("前回比は燃費の無い記録を飛ばして比べる。最も古い記録なら null", () => {
    const withPartial = [records[0], rec("p", "2026-09-25", { is_full: false, fuel_amount: 10 }), ...records.slice(1)];
    expect(heroModelOf(withPartial, withPartial[0]).delta?.text).toBe("2.50");
    expect(heroModelOf(records, records[2]).delta).toBeNull();
  });

  it("部分給油なら燃費は null で理由を返し、前回比は出さない", () => {
    const partial = rec("p", "2026-10-12", { is_full: false, fuel_amount: 10 });
    const m = heroModelOf([partial, ...records], partial);
    expect(m.efficiency).toBeNull();
    expect(m.nullReason).toBe("部分給油（次の満タンで計算）");
    expect(m.delta).toBeNull();
    expect(m.average).not.toBeNull();
  });

  it("燃費が 1 件も無ければ既定の目盛り・平均なし", () => {
    const only = rec("x", "2026-10-01", { fuel_amount: 30 });
    const m = heroModelOf([only], only);
    expect(m.average).toBeNull();
    expect(m.scale).toEqual({ min: 0, max: 20 });
  });
});

describe("recent rows", () => {
  it("日付の表示", () => {
    expect(formatMonthDay("2026-09-11")).toBe("9月11日");
    expect(formatMonthDay("")).toBe("日付不明");
    expect(formatShortDate("2026-09-01")).toBe("9/1");
    expect(formatShortDate("bad")).toBeNull();
  });

  it("店舗名・金額", () => {
    expect(stationLabel("  ")).toBe("店舗名なし");
    expect(stationLabel(null)).toBe("店舗名なし");
    expect(stationLabel(" コスモ石油 ")).toBe("コスモ石油");
    expect(formatYen(4920)).toBe("¥4,920");
    expect(formatYen(null)).toBeNull();
  });

  it("1 行分", () => {
    const row = recentRowOf(
      rec("r", "2026-09-11", { gas_station: "コスモ石油", fuel_type: "premium", total_cost: 4920, fuel_efficiency: 15.12 })
    );
    expect(row).toEqual({
      id: "r",
      title: "コスモ石油",
      dateLabel: "9月11日",
      fuelLabel: "ハイオク",
      costLabel: "¥4,920",
      efficiency: 15.12,
      partial: false,
    });
    const partial = recentRowOf(rec("p", "2026-09-12", { is_full: false }));
    expect(partial).toMatchObject({ title: "店舗名なし", fuelLabel: null, costLabel: null, efficiency: null, partial: true });
  });
});
