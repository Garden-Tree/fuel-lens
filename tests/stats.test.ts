import { describe, expect, it } from "vitest";
import { applyFillChain } from "@/lib/fillChain";
import type { FuelRecord } from "@/lib/useFuelRecords";
import {
  PERIOD_MONTHS,
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
  buildPriceAxis,
  buildPriceSeries,
  buildTimeDomain,
  countUnknownDate,
  filterByPeriod,
  hasNumber,
  hasPositiveNumber,
  hasStatsData,
  hasValidDate,
  localDateString,
  normalizeDateString,
  parseLocalDate,
  priceDelta,
  recordPrice,
  roundTo1,
  roundTo2,
  sortByDateAsc,
  subtractMonthsClamped,
  summarize,
  summarizeStations,
} from "@/lib/stats";

let seq = 0;
function rec(overrides: Partial<FuelRecord> = {}): FuelRecord {
  seq += 1;
  return {
    id: `r${String(seq).padStart(3, "0")}`,
    date: "2026-10-01",
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    ...overrides,
  };
}

/** ローカル暦の Date（タイムゾーンに依存しない比較用） */
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// ---------------------------------------------------------------------------

describe("hasNumber / hasPositiveNumber", () => {
  it("hasNumber accepts finite numbers only", () => {
    expect(hasNumber(0)).toBe(true);
    expect(hasNumber(-1.5)).toBe(true);
    expect(hasNumber(NaN)).toBe(false);
    expect(hasNumber(Infinity)).toBe(false);
    expect(hasNumber(null)).toBe(false);
    expect(hasNumber(undefined)).toBe(false);
    expect(hasNumber("1")).toBe(false);
  });

  it("hasPositiveNumber requires > 0", () => {
    expect(hasPositiveNumber(0.1)).toBe(true);
    expect(hasPositiveNumber(0)).toBe(false);
    expect(hasPositiveNumber(-1)).toBe(false);
    expect(hasPositiveNumber(null)).toBe(false);
  });
});

describe("normalizeDateString / parseLocalDate / hasValidDate", () => {
  it("returns YYYY-MM-DD for valid dates and ISO datetimes", () => {
    expect(normalizeDateString("2026-10-03")).toBe("2026-10-03");
    expect(normalizeDateString("2026-10-03T12:34:56Z")).toBe("2026-10-03");
    expect(normalizeDateString("2026-10-03 extra")).toBe("2026-10-03");
    expect(normalizeDateString("2024-02-29")).toBe("2024-02-29");
  });

  it("returns null for invalid calendar days, wrong shapes and non-strings", () => {
    expect(normalizeDateString("2026-02-30")).toBeNull();
    expect(normalizeDateString("2023-02-29")).toBeNull();
    expect(normalizeDateString("2026-13-01")).toBeNull();
    expect(normalizeDateString("2026-00-01")).toBeNull();
    expect(normalizeDateString("2026-1-3")).toBeNull();
    expect(normalizeDateString("")).toBeNull();
    expect(normalizeDateString(null)).toBeNull();
    expect(normalizeDateString(undefined)).toBeNull();
    expect(normalizeDateString(20261003)).toBeNull();
    expect(normalizeDateString(new Date())).toBeNull();
  });

  it("parseLocalDate builds a local-midnight Date", () => {
    const d = parseLocalDate("2026-10-03T23:00:00Z");
    expect(d).toEqual(local(2026, 10, 3));
    expect(d!.getHours()).toBe(0);
    expect(parseLocalDate("2026-02-30")).toBeNull();
  });

  it("hasValidDate / countUnknownDate", () => {
    expect(hasValidDate({ date: "2026-10-03" })).toBe(true);
    expect(hasValidDate({ date: "" })).toBe(false);
    expect(countUnknownDate([{ date: "2026-10-03" }, { date: "x" }, { date: "2026-02-30" }])).toBe(2);
    expect(countUnknownDate([])).toBe(0);
  });
});

describe("localDateString", () => {
  it("formats using the local calendar with zero padding", () => {
    expect(localDateString(local(2026, 10, 3))).toBe("2026-10-03");
    expect(localDateString(local(2026, 1, 5))).toBe("2026-01-05");
    expect(localDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    expect(localDateString(new Date(2026, 0, 1, 0, 0, 1))).toBe("2026-01-01");
  });
});

describe("subtractMonthsClamped", () => {
  it("clamps to the last day of the target month", () => {
    expect(subtractMonthsClamped(local(2026, 10, 31), 1)).toEqual(local(2026, 9, 30));
    expect(subtractMonthsClamped(local(2026, 3, 31), 1)).toEqual(local(2026, 2, 28));
    expect(subtractMonthsClamped(local(2024, 3, 31), 1)).toEqual(local(2024, 2, 29)); // うるう年
    expect(subtractMonthsClamped(local(2026, 5, 31), 3)).toEqual(local(2026, 2, 28));
    expect(subtractMonthsClamped(local(2026, 12, 31), 1)).toEqual(local(2026, 11, 30));
  });

  it("keeps the day when it exists in the target month", () => {
    expect(subtractMonthsClamped(local(2026, 10, 3), 3)).toEqual(local(2026, 7, 3));
    expect(subtractMonthsClamped(local(2026, 10, 3), 6)).toEqual(local(2026, 4, 3));
    expect(subtractMonthsClamped(local(2026, 10, 3), 12)).toEqual(local(2025, 10, 3));
    expect(subtractMonthsClamped(local(2026, 3, 31), 12)).toEqual(local(2025, 3, 31));
  });

  it("crosses year boundaries", () => {
    expect(subtractMonthsClamped(local(2026, 1, 15), 1)).toEqual(local(2025, 12, 15));
    expect(subtractMonthsClamped(local(2026, 1, 31), 3)).toEqual(local(2025, 10, 31));
    expect(subtractMonthsClamped(local(2026, 2, 10), 14)).toEqual(local(2024, 12, 10));
  });

  it("returns local midnight and does not mutate the input", () => {
    const input = new Date(2026, 9, 3, 15, 30, 45, 123);
    const out = subtractMonthsClamped(input, 0);
    expect(out).toEqual(local(2026, 10, 3));
    expect(out.getHours()).toBe(0);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
    expect(input.getHours()).toBe(15);
  });
});

describe("filterByPeriod", () => {
  const today = local(2026, 10, 3);
  const records = [
    rec({ id: "a", date: "2026-10-03" }),
    rec({ id: "b", date: "2026-07-03" }), // 3m cutoff (inclusive)
    rec({ id: "c", date: "2026-07-02" }), // just before 3m cutoff
    rec({ id: "d", date: "2026-04-03" }), // 6m cutoff
    rec({ id: "e", date: "2026-04-02" }),
    rec({ id: "f", date: "2025-10-03" }), // 1y cutoff
    rec({ id: "g", date: "2025-10-02" }),
    rec({ id: "h", date: "2026-02-30" }), // invalid
    rec({ id: "i", date: "" }), // missing
    rec({ id: "j", date: "2026-08-01T12:00:00Z" }), // ISO datetime
  ];
  const ids = (list: FuelRecord[]) => list.map((r) => r.id);

  it("exposes the expected month counts", () => {
    expect(PERIOD_MONTHS).toEqual({ "1y": 12, "6m": 6, "3m": 3 });
  });

  it('"all" returns a copy of every record, including undated ones', () => {
    const out = filterByPeriod(records, "all", today);
    expect(out).toEqual(records);
    expect(out).not.toBe(records);
  });

  it("includes the cutoff date itself and excludes the day before", () => {
    expect(ids(filterByPeriod(records, "3m", today))).toEqual(["a", "b", "j"]);
    expect(ids(filterByPeriod(records, "6m", today))).toEqual(["a", "b", "c", "d", "j"]);
    expect(ids(filterByPeriod(records, "1y", today))).toEqual(["a", "b", "c", "d", "e", "f", "j"]);
  });

  it("excludes invalid / missing dates for any bounded period", () => {
    for (const p of ["3m", "6m", "1y"] as const) {
      expect(ids(filterByPeriod(records, p, today))).not.toContain("h");
      expect(ids(filterByPeriod(records, p, today))).not.toContain("i");
    }
  });

  it("has no upper bound (future-dated records are kept)", () => {
    const future = rec({ id: "z", date: "2027-01-01" });
    expect(ids(filterByPeriod([future], "3m", today))).toEqual(["z"]);
  });

  it("uses month-end clamping for the cutoff", () => {
    const eom = [rec({ id: "x", date: "2026-02-28" }), rec({ id: "y", date: "2026-02-27" })];
    expect(ids(filterByPeriod(eom, "3m", local(2026, 5, 31)))).toEqual(["x"]);

    const oct = [rec({ id: "p", date: "2025-10-31" }), rec({ id: "q", date: "2025-10-30" })];
    expect(ids(filterByPeriod(oct, "1y", local(2026, 10, 31)))).toEqual(["p"]);
  });

  it("works with the time-of-day of today ignored", () => {
    const lateToday = new Date(2026, 9, 3, 23, 59, 59);
    expect(ids(filterByPeriod(records, "3m", lateToday))).toEqual(["a", "b", "j"]);
  });
});

describe("sortByDateAsc", () => {
  it("sorts ascending, undated last, ties by id", () => {
    const list = [
      rec({ id: "3", date: "2026-10-02" }),
      rec({ id: "1", date: "" }),
      rec({ id: "2", date: "2026-10-01" }),
      rec({ id: "0", date: "2026-10-02" }),
      rec({ id: "4", date: "bad" }),
    ];
    expect(sortByDateAsc(list).map((r) => r.id)).toEqual(["2", "0", "3", "1", "4"]);
    // 入力は変更しない
    expect(list.map((r) => r.id)).toEqual(["3", "1", "2", "0", "4"]);
  });
});

describe("hasStatsData", () => {
  it("is true when efficiency or cost is a number (0 counts)", () => {
    expect(hasStatsData({ fuel_efficiency: 12.5, total_cost: null })).toBe(true);
    expect(hasStatsData({ fuel_efficiency: null, total_cost: 0 })).toBe(true);
    expect(hasStatsData({ fuel_efficiency: null, total_cost: null })).toBe(false);
    expect(hasStatsData({ fuel_efficiency: NaN, total_cost: null })).toBe(false);
  });
});

describe("summarize", () => {
  // 統計ページには連鎖計算（applyFillChain）済みの記録が渡る。全件満タンのトリップモードでは各記録が 1 件の run
  const records = applyFillChain(
    [
      rec({ total_distance: 100, fuel_amount: 10, total_cost: 1500 }),
      rec({ total_distance: 500, fuel_amount: 25, total_cost: 4000 }),
      rec({ total_distance: 200, fuel_amount: null, total_cost: 3000 }), // cost + distance only（燃費が出ないので run なし）
      rec({ total_distance: null, fuel_amount: 5, total_cost: null }), // fuel only
      rec({ total_distance: 0, fuel_amount: 0, total_cost: 0 }), // zeros
      rec(), // all null
    ],
    { distance_mode: "trip" }
  );

  it("returns zeros / nulls for an empty list", () => {
    expect(summarize([])).toEqual({
      count: 0,
      avgEfficiency: null,
      meanEfficiency: null,
      totalCost: 0,
      avgPricePerUnit: null,
      costPerKm: null,
      totalDistance: 0,
      totalFuel: 0,
    });
  });

  it("uses Σkm/ΣL over closed runs for avgEfficiency and the simple mean for meanEfficiency", () => {
    const s = summarize(records);
    expect(s.avgEfficiency).toBeCloseTo(600 / 35, 10); // 17.142857...
    expect(s.meanEfficiency).toBe(15);
    expect(s.avgEfficiency).not.toBe(s.meanEfficiency);
  });

  it("¥/L pairs records that have both values; ¥/km uses closed runs only", () => {
    const s = summarize(records);
    // ¥/L: 記録 1,2 のみ (記録 3 は fuel なし, 記録 4 は cost なし)
    expect(s.avgPricePerUnit).toBeCloseTo((1500 + 4000) / (10 + 25), 10);
    // ¥/km: 燃費の出た run（記録 1,2）のみ。記録 3 は給油量が無く run を閉じないので含めない
    expect(s.costPerKm).toBeCloseTo((1500 + 4000) / (100 + 500), 10);
  });

  it("sums totals independently of pairing", () => {
    const s = summarize(records);
    expect(s.count).toBe(6);
    expect(s.totalCost).toBe(8500);
    expect(s.totalDistance).toBe(800);
    expect(s.totalFuel).toBe(40);
  });

  it("trip mode with all full fills gives the same numbers as the per-record pairing", () => {
    const list = applyFillChain(
      [
        rec({ date: "2026-01-01", total_distance: 512.3, fuel_amount: 31.7, total_cost: 5400 }),
        rec({ date: "2026-01-10", total_distance: 480, fuel_amount: 29.95, total_cost: 5100 }),
        rec({ date: "2026-01-20", total_distance: 333.3, fuel_amount: 20, total_cost: 3500 }),
      ],
      { distance_mode: "trip" }
    );
    const s = summarize(list);
    expect(s.avgEfficiency).toBeCloseTo((512.3 + 480 + 333.3) / (31.7 + 29.95 + 20), 10);
    expect(s.costPerKm).toBeCloseTo((5400 + 5100 + 3500) / (512.3 + 480 + 333.3), 10);
  });

  it("carry rows do not skew the averages: A(1000, 30 L) → B(no odometer, 20 L, ¥3000) → C(1600, 20 L, ¥3000)", () => {
    const list = applyFillChain(
      [
        rec({ id: "A", date: "2026-07-10", odometer: 1000, fuel_amount: 30 }),
        rec({ id: "B", date: "2026-07-11", odometer: null, fuel_amount: 20, total_cost: 3000 }),
        rec({ id: "C", date: "2026-07-12", odometer: 1600, fuel_amount: 20, total_cost: 3000 }),
      ],
      { distance_mode: "odometer" }
    );
    const s = summarize(list);
    expect(s.avgEfficiency).toBe(15); // 600 ÷ (20 + 20)。記録ごとのペアなら 600 ÷ 20 = 30 になっていた
    expect(s.costPerKm).toBe(10); // 6000 ÷ 600
    expect(s.totalDistance).toBe(600);
    expect(s.totalFuel).toBe(70);
  });

  it("a rolled-back odometer: 1000 → 1300 → 130 → 1600 (20 L each) gives 600 / 60 = 10", () => {
    const list = applyFillChain(
      [
        rec({ date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
        rec({ date: "2026-10-02", odometer: 1300, fuel_amount: 20 }),
        rec({ date: "2026-10-03", odometer: 130, fuel_amount: 20 }),
        rec({ date: "2026-10-04", odometer: 1600, fuel_amount: 20 }),
      ],
      { distance_mode: "odometer" }
    );
    expect(summarize(list).avgEfficiency).toBe(10);
  });

  it("a run with an unknown cost counts for avgEfficiency but not for costPerKm", () => {
    const s = summarize([
      rec({ fuel_efficiency: 15, run_distance: 300, run_fuel: 20, run_cost: null }),
      rec({ fuel_efficiency: 20, run_distance: 400, run_fuel: 20, run_cost: 2000 }),
    ]);
    expect(s.avgEfficiency).toBeCloseTo(700 / 40, 10);
    expect(s.costPerKm).toBe(5); // 2000 ÷ 400
  });

  it("records without run fields (not chained) give no efficiency / ¥/km average", () => {
    const s = summarize([rec({ total_distance: 300, fuel_amount: 20, total_cost: 3000, fuel_efficiency: 15 })]);
    expect(s.avgEfficiency).toBeNull();
    expect(s.costPerKm).toBeNull();
    expect(s.meanEfficiency).toBe(15);
    expect(s.avgPricePerUnit).toBe(150);
  });

  it("ignores zero / negative denominators but still counts totalCost of any finite number", () => {
    const s = summarize([
      rec({ total_distance: -100, fuel_amount: -10, total_cost: -500, fuel_efficiency: -5 }),
      rec({ total_distance: 100, fuel_amount: 0, total_cost: 1000 }),
      rec({ run_distance: 0, run_fuel: 10, run_cost: 1000 }),
      rec({ run_distance: 100, run_fuel: -10, run_cost: -1000 }),
    ]);
    expect(s.avgEfficiency).toBeNull();
    expect(s.meanEfficiency).toBeNull();
    expect(s.avgPricePerUnit).toBeNull();
    expect(s.costPerKm).toBeNull();
    expect(s.totalCost).toBe(500); // -500 + 1000 (負数も有限値として合算される: 現状の挙動)
    expect(s.totalDistance).toBe(100);
    expect(s.totalFuel).toBe(0);
  });

  it("ignores NaN / Infinity values", () => {
    const s = summarize([
      rec({ total_distance: NaN, fuel_amount: Infinity, total_cost: NaN, fuel_efficiency: Infinity }),
      rec({ run_distance: NaN, run_fuel: Infinity, run_cost: NaN }),
    ]);
    expect(s).toMatchObject({
      count: 2,
      avgEfficiency: null,
      meanEfficiency: null,
      costPerKm: null,
      totalCost: 0,
      totalDistance: 0,
      totalFuel: 0,
    });
  });
});

describe("buildEfficiencySeries", () => {
  it("keeps only dated records with positive efficiency, sorted by date", () => {
    const out = buildEfficiencySeries([
      rec({ date: "2026-10-03", fuel_efficiency: 12.5, total_cost: 6000, gas_station: "ENEOS" }),
      rec({ date: "2026-09-01T10:00:00Z", fuel_efficiency: 15, total_cost: null, gas_station: "" }),
      rec({ date: "2026-09-15", fuel_efficiency: 0 }), // excluded
      rec({ date: "2026-09-16", fuel_efficiency: null, total_cost: 5000 }), // excluded (cost only)
      rec({ date: "2026-02-30", fuel_efficiency: 10 }), // invalid date
      rec({ date: "", fuel_efficiency: 10 }), // missing date
    ]);
    expect(out).toEqual([
      { timestamp: local(2026, 9, 1).getTime(), name: "2026-09-01", efficiency: 15, cost: 0, gasStation: "不明" },
      { timestamp: local(2026, 10, 3).getTime(), name: "2026-10-03", efficiency: 12.5, cost: 6000, gasStation: "ENEOS" },
    ]);
  });

  it("returns an empty array for no usable data", () => {
    expect(buildEfficiencySeries([])).toEqual([]);
    expect(buildEfficiencySeries([rec({ total_cost: 1000 })])).toEqual([]);
  });
});

describe("buildMonthlyCostSeries", () => {
  it("groups positive costs by YYYY-MM, sorted, with a 'YYYY/M月' label", () => {
    const out = buildMonthlyCostSeries([
      rec({ date: "2026-10-03", total_cost: 6000 }),
      rec({ date: "2026-10-20", total_cost: 4000 }),
      rec({ date: "2026-01-05", total_cost: 1234 }),
      rec({ date: "2025-12-31T23:00:00Z", total_cost: 100 }),
      rec({ date: "2026-10-21", total_cost: 0 }), // excluded
      rec({ date: "2026-10-22", total_cost: null }), // excluded
      rec({ date: "2026-10-23", total_cost: -500 }), // excluded
      rec({ date: "2026-02-30", total_cost: 999 }), // invalid date
    ]);
    expect(out).toEqual([
      { key: "2025-12", month: "2025/12月", cost: 100 },
      { key: "2026-01", month: "2026/1月", cost: 1234 },
      { key: "2026-10", month: "2026/10月", cost: 10000 },
    ]);
  });

  it("returns an empty array for no data", () => {
    expect(buildMonthlyCostSeries([])).toEqual([]);
  });
});

describe("roundTo2", () => {
  it("rounds like toFixed(2)", () => {
    expect(roundTo2(17.142857)).toBe(17.14);
    expect(roundTo2(1.005)).toBe(1); // toFixed の二進浮動小数の挙動をそのまま踏襲
    expect(roundTo2(12.5)).toBe(12.5);
    expect(roundTo2(2 / 3)).toBe(0.67);
  });
});

describe("buildEfficiencyAxis", () => {
  it("returns undefined domain/ticks for empty series", () => {
    expect(buildEfficiencyAxis([], 12)).toEqual({ domain: undefined, ticks: undefined, averageTick: null });
  });

  it("pads by 15% of the range and splits into 5 ticks", () => {
    const axis = buildEfficiencyAxis([{ efficiency: 10 }, { efficiency: 20 }], null);
    expect(axis.averageTick).toBeNull();
    expect(axis.domain).toEqual([8.5, 21.5]);
    expect(axis.ticks).toEqual([8.5, 11.75, 15, 18.25, 21.5]);
  });

  it("uses a padding of 1 when all values are equal", () => {
    const axis = buildEfficiencyAxis([{ efficiency: 12.5 }], null);
    expect(axis.domain).toEqual([11.5, 13.5]);
    expect(axis.ticks).toEqual([11.5, 12, 12.5, 13, 13.5]);
  });

  it("inserts the rounded average into the ticks (deduplicated, sorted) and widens the range to include it", () => {
    const axis = buildEfficiencyAxis([{ efficiency: 10 }, { efficiency: 20 }], 17.142857);
    expect(axis.averageTick).toBe(17.14);
    expect(axis.ticks).toEqual([8.5, 11.75, 15, 17.14, 18.25, 21.5]);

    const same = buildEfficiencyAxis([{ efficiency: 10 }, { efficiency: 20 }], 15);
    expect(same.ticks).toEqual([8.5, 11.75, 15, 18.25, 21.5]);

    const outside = buildEfficiencyAxis([{ efficiency: 10 }, { efficiency: 12 }], 20);
    expect(outside.domain).toEqual([8.5, 21.5]);
    expect(outside.ticks).toContain(20);
  });

  it("never lets the lower bound go below 0 and ignores non-positive averages", () => {
    const axis = buildEfficiencyAxis([{ efficiency: 0.5 }], 0);
    expect(axis.domain![0]).toBe(0);
    expect(axis.averageTick).toBeNull();
  });
});

describe("buildTimeDomain", () => {
  const day = 86_400_000;

  it("returns null for empty series", () => {
    expect(buildTimeDomain([])).toBeNull();
  });

  it("pads by at least one day", () => {
    const t = local(2026, 10, 3).getTime();
    expect(buildTimeDomain([{ timestamp: t }])).toEqual([t - day, t + day]);
  });

  it("pads by 5% of the range when that exceeds a day", () => {
    const a = 0;
    const b = 100 * day;
    expect(buildTimeDomain([{ timestamp: b }, { timestamp: a }])).toEqual([a - 5 * day, b + 5 * day]);
  });
});

// ---------------------------------------------------------------------------
// 単価トレンドとスタンド比較
// ---------------------------------------------------------------------------

describe("recordPrice", () => {
  it("prefers a positive price_per_unit", () => {
    expect(recordPrice({ price_per_unit: 165.3, total_cost: 5000, fuel_amount: 30 })).toBe(165.3);
  });

  it("falls back to cost ÷ fuel rounded to 0.1 like calculateFuelMetrics", () => {
    expect(recordPrice({ price_per_unit: null, total_cost: 5000, fuel_amount: 30 })).toBe(166.7);
    expect(recordPrice({ price_per_unit: 0, total_cost: 4900, fuel_amount: 30 })).toBe(163.3);
  });

  it("returns null when no price can be derived", () => {
    expect(recordPrice({ price_per_unit: null, total_cost: 5000, fuel_amount: null })).toBeNull();
    expect(recordPrice({ price_per_unit: -1, total_cost: null, fuel_amount: 30 })).toBeNull();
    expect(recordPrice({ price_per_unit: NaN, total_cost: 0, fuel_amount: 0 })).toBeNull();
  });
});

describe("buildPriceSeries", () => {
  it("keeps dated records with a positive price, ascending by date then id, with M/D labels", () => {
    const out = buildPriceSeries([
      rec({ id: "c", date: "2026-10-03", price_per_unit: 168.5, gas_station: "ＥＮＥＯＳ　調布店" }),
      rec({ id: "b", date: "2026-09-01T09:00:00Z", price_per_unit: null, total_cost: 5000, fuel_amount: 30 }),
      rec({ id: "a", date: "2026-10-03", price_per_unit: 166.0, gas_station: "山田石油" }),
      rec({ id: "d", date: "2026-09-15", price_per_unit: 0 }), // excluded
      rec({ id: "e", date: "2026-09-16", price_per_unit: null, total_cost: 5000 }), // excluded (no fuel)
      rec({ id: "f", date: "2026-02-30", price_per_unit: 170 }), // invalid date
      rec({ id: "g", date: "", price_per_unit: 170 }), // missing date
    ]);
    expect(out).toEqual([
      { timestamp: local(2026, 9, 1).getTime(), name: "9/1", price: 166.7, station: null, brand: null },
      { timestamp: local(2026, 10, 3).getTime(), name: "10/3", price: 166.0, station: "山田石油", brand: null },
      { timestamp: local(2026, 10, 3).getTime(), name: "10/3", price: 168.5, station: "ENEOS 調布店", brand: "ENEOS" },
    ]);
  });

  it("returns an empty array for no usable data", () => {
    expect(buildPriceSeries([])).toEqual([]);
    expect(buildPriceSeries([rec({ total_cost: 1000 })])).toEqual([]);
  });
});

describe("buildPriceAxis / roundTo1", () => {
  it("rounds like toFixed(1)", () => {
    expect(roundTo1(165.25)).toBe(165.3);
    expect(roundTo1(160)).toBe(160);
  });

  it("pads the price range and inserts the average rounded to 0.1", () => {
    const axis = buildPriceAxis([{ price: 160 }, { price: 170 }], 166.666);
    expect(axis.domain).toEqual([158.5, 171.5]);
    expect(axis.averageTick).toBe(166.7);
    expect(axis.ticks).toEqual([158.5, 161.8, 165, 166.7, 168.3, 171.5]);
  });

  it("returns undefined domain/ticks for an empty series", () => {
    expect(buildPriceAxis([], 160)).toEqual({ domain: undefined, ticks: undefined, averageTick: null });
  });
});

describe("summarizeStations", () => {
  it("groups spelling variants of the same station and picks the most common name as the label", () => {
    const { groups } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "ENEOS セルフつつじヶ丘", price_per_unit: 165 }),
      rec({ date: "2026-09-10", gas_station: "ＥＮＥＯＳ　セルフつつじヶ丘店", price_per_unit: 166 }),
      rec({ date: "2026-09-20", gas_station: "ENEOS セルフつつじヶ丘店", price_per_unit: 167 }),
      rec({ date: "2026-09-25", gas_station: "出光 高尾", price_per_unit: 170 }),
    ]);
    expect(groups.map(g => [g.key, g.label, g.brand, g.visits])).toEqual([
      ["eneos|つつじケ丘", "ENEOS セルフつつじヶ丘店", "ENEOS", 3],
      ["idemitsu|高尾", "出光 高尾", "出光", 1],
    ]);
  });

  it("weights avgPrice by fuel (Σcost ÷ Σfuel) and tracks totals, last / min / max prices", () => {
    const { groups } = summarizeStations([
      rec({ id: "1", date: "2026-08-01", gas_station: "ENEOS 調布", fuel_amount: 10, total_cost: 1600, price_per_unit: 160 }),
      rec({ id: "2", date: "2026-09-01", gas_station: "ENEOS 調布店", fuel_amount: 40, total_cost: 6800, price_per_unit: 170 }),
      rec({ id: "3", date: "2026-07-01", gas_station: "ENEOS 調布", fuel_amount: 20, total_cost: null, price_per_unit: 150 }), // no cost
      rec({ id: "4", date: "", gas_station: "ENEOS 調布", fuel_amount: 5, total_cost: 900, price_per_unit: 180 }), // undated
    ]);
    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.visits).toBe(4);
    expect(g.pricedVisits).toBe(4); // 日付不明の記録も単価があれば数える
    expect(g.totalFuel).toBe(75);
    expect(g.totalCost).toBe(9300);
    // Σcost ÷ Σfuel over records with both: (1600 + 6800 + 900) / (10 + 40 + 5)。単純平均 (160+170+150+180)/4 = 165 ではない
    expect(g.avgPrice).toBeCloseTo(9300 / 55, 10);
    expect(g.lastPrice).toBe(170);
    expect(g.lastDate).toBe("2026-09-01");
    expect(g.minPrice).toBe(150); // 日付の有効な記録だけ（日付不明の 180 は含めない）
    expect(g.maxPrice).toBe(170);
  });

  it("falls back to the simple mean of prices when no record has both cost and fuel", () => {
    const { groups, overallAvgPrice } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "山田石油", price_per_unit: 160 }),
      rec({ date: "2026-09-02", gas_station: "山田石油", price_per_unit: 170 }),
      rec({ date: "2026-09-03", gas_station: "山田石油" }), // no price
    ]);
    expect(groups[0].avgPrice).toBe(165);
    expect(groups[0].visits).toBe(3);
    expect(groups[0].pricedVisits).toBe(2);
    expect(groups[0].lastPrice).toBe(170);
    expect(groups[0].lastDate).toBe("2026-09-02");
    expect(overallAvgPrice).toBe(165);
  });

  it("uses the last visit date when no visit has a price", () => {
    const { groups } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "山田石油" }),
      rec({ date: "2026-09-05", gas_station: "山田石油" }),
    ]);
    expect(groups[0]).toMatchObject({ avgPrice: null, lastPrice: null, lastDate: "2026-09-05", minPrice: null, maxPrice: null });
  });

  it("skips records without a station name but counts them in overallAvgPrice", () => {
    const { groups, overallAvgPrice } = summarizeStations([
      rec({ gas_station: null, fuel_amount: 10, total_cost: 1500 }),
      rec({ gas_station: "  ", fuel_amount: 10, total_cost: 1500 }),
      rec({ gas_station: "ENEOS", fuel_amount: 10, total_cost: 1800 }),
    ]);
    expect(groups.map(g => g.key)).toEqual(["eneos|"]);
    expect(overallAvgPrice).toBe(160);
  });

  it("sorts by visits desc, then by the latest date", () => {
    const { groups } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "A石油" }),
      rec({ date: "2026-09-10", gas_station: "B石油" }),
      rec({ date: "2026-09-02", gas_station: "C石油" }),
      rec({ date: "2026-09-03", gas_station: "C石油" }),
    ]);
    expect(groups.map(g => g.label)).toEqual(["C石油", "B石油", "A石油"]);
  });

  it("picks the cheapest only among stations with 2+ visits, and only when there are 2+ such stations", () => {
    const records = [
      rec({ date: "2026-09-01", gas_station: "ENEOS 調布", fuel_amount: 10, total_cost: 1700 }),
      rec({ date: "2026-09-08", gas_station: "ENEOS 調布", fuel_amount: 10, total_cost: 1700 }),
      rec({ date: "2026-09-02", gas_station: "出光 府中", fuel_amount: 10, total_cost: 1650 }),
      rec({ date: "2026-09-09", gas_station: "出光 府中", fuel_amount: 10, total_cost: 1650 }),
      rec({ date: "2026-09-03", gas_station: "コストコ 多摩境", fuel_amount: 10, total_cost: 1500 }), // 1 回だけ（最安でも対象外）
    ];
    expect(summarizeStations(records).cheapestKey).toBe("idemitsu|府中");

    // 2 回以上のスタンドが 1 件だけなら比べる相手がいないので null
    expect(summarizeStations(records.slice(2)).cheapestKey).toBeNull();
    // 全部 1 回だけでも null
    expect(summarizeStations([records[0], records[2], records[4]]).cheapestKey).toBeNull();
  });

  it("requires 2+ priced visits for the cheapest rule (visits without a price do not count)", () => {
    const records = [
      // ENEOS: 3 回給油したが単価が分かるのは 1 回だけ → 最安の対象外
      rec({ date: "2026-09-01", gas_station: "ENEOS 調布", fuel_amount: 10, total_cost: 1500 }),
      rec({ date: "2026-09-08", gas_station: "ENEOS 調布" }),
      rec({ date: "2026-09-15", gas_station: "ENEOS 調布", fuel_amount: 20 }),
      rec({ date: "2026-09-02", gas_station: "出光 府中", fuel_amount: 10, total_cost: 1700 }),
      rec({ date: "2026-09-09", gas_station: "出光 府中", price_per_unit: 172 }),
      rec({ date: "2026-09-03", gas_station: "コスモ石油 稲城", fuel_amount: 10, total_cost: 1650 }),
      rec({ date: "2026-09-10", gas_station: "コスモ石油 稲城", fuel_amount: 10, total_cost: 1650 }),
    ];
    const { groups, cheapestKey } = summarizeStations(records);
    const byKey = Object.fromEntries(groups.map(g => [g.key, g]));
    expect(byKey["eneos|調布"]).toMatchObject({ visits: 3, pricedVisits: 1, avgPrice: 150 });
    expect(byKey["idemitsu|府中"]).toMatchObject({ visits: 2, pricedVisits: 2 });
    expect(byKey["cosmo|稲城"]).toMatchObject({ visits: 2, pricedVisits: 2 });
    // ENEOS の 150 円が最も安いが、単価の分かる給油が 1 回だけなので選ばない
    expect(cheapestKey).toBe("cosmo|稲城");

    // 単価の分かる給油が 2 回以上のスタンドが 1 件だけなら null
    expect(summarizeStations(records.slice(0, 5)).cheapestKey).toBeNull();
  });

  it("breaks a cheapest tie by priced visits, then by visits", () => {
    const { cheapestKey } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "A石油", price_per_unit: 160 }),
      rec({ date: "2026-09-02", gas_station: "A石油", price_per_unit: 160 }),
      rec({ date: "2026-09-03", gas_station: "A石油", price_per_unit: 160 }),
      rec({ date: "2026-09-04", gas_station: "B石油", price_per_unit: 160 }),
      rec({ date: "2026-09-05", gas_station: "B石油", price_per_unit: 160 }),
      rec({ date: "2026-09-06", gas_station: "B石油" }),
      rec({ date: "2026-09-07", gas_station: "B石油" }),
    ]);
    // B は給油 4 回だが単価が分かるのは 2 回。A（3 回とも単価あり）を採る
    expect(cheapestKey).toBe("|a石油");
  });

  it("breaks a cheapest tie by visits", () => {
    const { cheapestKey } = summarizeStations([
      rec({ date: "2026-09-01", gas_station: "A石油", price_per_unit: 160 }),
      rec({ date: "2026-09-02", gas_station: "A石油", price_per_unit: 160 }),
      rec({ date: "2026-09-03", gas_station: "B石油", price_per_unit: 160 }),
      rec({ date: "2026-09-04", gas_station: "B石油", price_per_unit: 160 }),
      rec({ date: "2026-09-05", gas_station: "B石油", price_per_unit: 160 }),
    ]);
    expect(cheapestKey).toBe("|b石油");
  });

  it("returns empty groups for no records", () => {
    expect(summarizeStations([])).toEqual({ groups: [], cheapestKey: null, overallAvgPrice: null });
  });
});

describe("priceDelta", () => {
  it("returns nulls when there is no price", () => {
    expect(priceDelta([rec({ total_cost: 1000 })])).toEqual({
      latest: null,
      previous: null,
      diffFromPrevious: null,
      avg30: null,
      diffFromAvg30: null,
      avg90: null,
      diffFromAvg90: null,
    });
  });

  it("with a single price only reports the latest", () => {
    const d = priceDelta([rec({ date: "2026-10-01", price_per_unit: 165 })]);
    expect(d.latest).toEqual({ price: 165, date: "2026-10-01" });
    expect(d.previous).toBeNull();
    expect(d.diffFromPrevious).toBeNull();
    expect(d.avg30).toBeNull();
    expect(d.avg90).toBeNull();
  });

  it("compares the latest with the previous and the 30 / 90-day means before it (latest excluded)", () => {
    const d = priceDelta([
      rec({ id: "a", date: "2026-10-01", price_per_unit: 170 }), // latest
      rec({ id: "b", date: "2026-09-25", price_per_unit: 166 }), // previous, in 30 days
      rec({ id: "c", date: "2026-09-01", price_per_unit: 164 }), // 30 days before (boundary, included)
      rec({ id: "d", date: "2026-08-31", price_per_unit: 160 }), // 31 days: 90 only
      rec({ id: "e", date: "2026-07-03", price_per_unit: 150 }), // 90 days before (boundary, included)
      rec({ id: "f", date: "2026-07-02", price_per_unit: 100 }), // 91 days: excluded
      rec({ id: "g", date: "", price_per_unit: 999 }), // undated: ignored
    ]);
    expect(d.latest).toEqual({ price: 170, date: "2026-10-01" });
    expect(d.previous).toEqual({ price: 166, date: "2026-09-25" });
    expect(d.diffFromPrevious).toBe(4);
    expect(d.avg30).toBe(165); // (166 + 164) / 2
    expect(d.diffFromAvg30).toBe(5);
    expect(d.avg90).toBe(160); // (166 + 164 + 160 + 150) / 4
    expect(d.diffFromAvg90).toBe(10);
  });

  it("uses the id order for same-day records and derives missing prices from cost ÷ fuel", () => {
    const d = priceDelta([
      rec({ id: "b", date: "2026-10-01", price_per_unit: null, total_cost: 1680, fuel_amount: 10 }),
      rec({ id: "a", date: "2026-10-01", price_per_unit: 170 }),
    ]);
    expect(d.latest).toEqual({ price: 168, date: "2026-10-01" });
    expect(d.previous).toEqual({ price: 170, date: "2026-10-01" });
    expect(d.diffFromPrevious).toBe(-2);
    expect(d.avg30).toBe(170);
  });
});
