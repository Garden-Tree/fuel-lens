import { describe, expect, it } from "vitest";
import { applyFillChain } from "@/lib/fillChain";
import type { FuelRecord } from "@/lib/useFuelRecords";
import {
  PERIOD_MONTHS,
  buildEfficiencyAxis,
  buildEfficiencySeries,
  buildMonthlyCostSeries,
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
  roundTo2,
  sortByDateAsc,
  subtractMonthsClamped,
  summarize,
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
