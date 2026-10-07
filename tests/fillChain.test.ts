import { describe, expect, it } from "vitest";
import { calculateFuelMetrics } from "@/lib/calculations";
import {
  FUEL_TYPE_LABELS,
  applyFillChain,
  compareForChain,
  isFuelType,
  normalizeRecord,
  normalizeVehicle,
  previousOdometer,
  sanitizeMemo,
  sortForChain,
} from "@/lib/fillChain";
import { applyFillChainByVehicle, pickRecordColumns, type FuelRecord } from "@/lib/useFuelRecords";
import type { Vehicle } from "@/lib/useVehicles";

let seq = 0;
const rec = (overrides: Partial<FuelRecord> = {}): FuelRecord => {
  seq += 1;
  return {
    id: `r${String(seq).padStart(3, "0")}`,
    date: "2026-01-01",
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    vehicle_id: "v1",
    created_at: null,
    ...overrides,
  };
};

const TRIP = { distance_mode: "trip" as const };
const ODO = { distance_mode: "odometer" as const };

const effById = (list: FuelRecord[]) => Object.fromEntries(list.map(r => [r.id, r.fuel_efficiency]));
const distById = (list: FuelRecord[]) => Object.fromEntries(list.map(r => [r.id, r.total_distance]));

describe("normalizeRecord / normalizeVehicle", () => {
  it("fills defaults for legacy records and keeps other keys", () => {
    const legacy = { ...rec({ id: "x", total_distance: 300 }), user_id: "u" } as FuelRecord;
    const n = normalizeRecord(legacy);
    expect(n).toMatchObject({
      id: "x",
      total_distance: 300,
      odometer: null,
      is_full: true,
      missed_previous: false,
      fuel_type: null,
      memo: null,
    });
    expect((n as unknown as { user_id: string }).user_id).toBe("u");
    expect(legacy).not.toHaveProperty("is_full"); // 入力は変更しない
  });

  it("sanitizes invalid values of the new fields", () => {
    const n = normalizeRecord({
      ...rec(),
      odometer: -3,
      is_full: "false",
      missed_previous: "yes",
      fuel_type: "gasoline",
      memo: `  ${"あ".repeat(250)}  `,
    } as unknown as FuelRecord);
    expect(n.odometer).toBeNull();
    expect(n.is_full).toBe(true); // false 以外は満タン
    expect(n.missed_previous).toBe(false); // true 以外は false
    expect(n.fuel_type).toBeNull();
    expect(n.memo).toBe("あ".repeat(200));
    expect(normalizeRecord(rec({ memo: "   " })).memo).toBeNull();
    expect(normalizeRecord(rec({ is_full: false, missed_previous: true, fuel_type: "diesel", odometer: 0 }))).toMatchObject({
      is_full: false,
      missed_previous: true,
      fuel_type: "diesel",
      odometer: 0,
    });
  });

  it("normalizeVehicle defaults to trip mode and no fuel type", () => {
    const base: Vehicle = { id: "v", user_id: "u", name: "A", type: "car" };
    expect(normalizeVehicle(base)).toEqual({ ...base, distance_mode: "trip", default_fuel_type: null });
    expect(normalizeVehicle({ ...base, distance_mode: "odometer", default_fuel_type: "premium" })).toMatchObject({
      distance_mode: "odometer",
      default_fuel_type: "premium",
    });
    expect(
      normalizeVehicle({ ...base, distance_mode: "gps", default_fuel_type: "x" } as unknown as Vehicle)
    ).toMatchObject({ distance_mode: "trip", default_fuel_type: null });
  });

  it("fuel type labels and guard", () => {
    expect(FUEL_TYPE_LABELS).toEqual({ regular: "レギュラー", premium: "ハイオク", diesel: "軽油", other: "その他" });
    expect(["regular", "premium", "diesel", "other"].every(isFuelType)).toBe(true);
    expect(isFuelType("gasoline")).toBe(false);
    expect(isFuelType(null)).toBe(false);
  });
});

describe("sanitizeMemo", () => {
  it("limits to 200 Unicode code points without splitting surrogate pairs", () => {
    const keep = "😀".repeat(200);
    expect(sanitizeMemo(keep)).toBe(keep);
    expect(Array.from(sanitizeMemo(keep)!)).toHaveLength(200);
    expect(sanitizeMemo(`  ${"😀".repeat(201)}  `)).toBe(keep);
    expect(sanitizeMemo("   ")).toBeNull();
    expect(sanitizeMemo(5)).toBeNull();
  });
});

describe("sortForChain", () => {
  it("orders by date → odometer → created_at → id, with missing odometer / created_at last", () => {
    const a = rec({ id: "a", date: "2026-01-02" });
    const b = rec({ id: "b", date: "2026-01-01", odometer: 200 });
    const c = rec({ id: "c", date: "2026-01-01", odometer: 100 });
    const d = rec({ id: "d", date: "2026-01-01", odometer: null, created_at: "2026-01-01T09:00:00Z" });
    const e = rec({ id: "e", date: "2026-01-01", odometer: null, created_at: "2026-01-01T08:00:00Z" });
    const f = rec({ id: "f", date: "2026-01-01", odometer: null, created_at: null });
    const g = rec({ id: "g", date: "2026-01-01", odometer: null, created_at: null });
    const input = [a, g, d, b, f, e, c];
    const sorted = sortForChain(input);
    expect(sorted.map(r => r.id)).toEqual(["c", "b", "e", "d", "f", "g", "a"]);
    expect(input.map(r => r.id)).toEqual(["a", "g", "d", "b", "f", "e", "c"]); // 入力は変更しない
    expect(compareForChain(a, a)).toBe(0);
  });
});

describe("applyFillChain — trip mode", () => {
  it("all full fills: equals distance / fuel (same as calculateFuelMetrics)", () => {
    const list = [
      rec({ date: "2026-01-01", total_distance: 512.3, fuel_amount: 31.7 }),
      rec({ date: "2026-01-10", total_distance: 480, fuel_amount: 29.95 }),
      rec({ date: "2026-01-20", total_distance: 333.3, fuel_amount: 20 }),
      rec({ date: "2026-01-25", total_distance: 100, fuel_amount: null }),
      rec({ date: "2026-01-26", total_distance: null, fuel_amount: 10 }),
      rec({ date: "2026-01-27", total_distance: 100, fuel_amount: 0 }),
    ];
    const out = applyFillChain(list, TRIP);
    out.forEach((r, i) => {
      expect(r.fuel_efficiency).toBe(
        calculateFuelMetrics(list[i].total_distance, list[i].fuel_amount, null).fuel_efficiency
      );
      expect(r.total_distance).toBe(list[i].total_distance); // トリップモードでは距離を上書きしない
    });
    expect(out[0].fuel_efficiency).toBe(16.16);
  });

  it("defaults to trip mode when no vehicle is given and overwrites stale stored efficiency", () => {
    const r = rec({ total_distance: 300, fuel_amount: 20, fuel_efficiency: 99 });
    expect(applyFillChain([r])[0].fuel_efficiency).toBe(15);
    expect(applyFillChain([r], null)[0].fuel_efficiency).toBe(15);
  });

  it("partial fill run: 300km/10L partial + 300km/25L full → null, 17.14", () => {
    const partial = rec({ date: "2026-02-01", total_distance: 300, fuel_amount: 10, is_full: false });
    const full = rec({ date: "2026-02-05", total_distance: 300, fuel_amount: 25 });
    const out = applyFillChain([partial, full], TRIP);
    expect(out[0].fuel_efficiency).toBeNull();
    expect(out[1].fuel_efficiency).toBe(17.14);
  });

  it("multiple partials accumulate until the next full fill; the run resets after a full fill", () => {
    const list = [
      rec({ date: "2026-03-01", total_distance: 200, fuel_amount: 5, is_full: false }),
      rec({ date: "2026-03-02", total_distance: 200, fuel_amount: 5, is_full: false }),
      rec({ date: "2026-03-03", total_distance: 200, fuel_amount: 20 }),
      rec({ date: "2026-03-04", total_distance: 400, fuel_amount: 25 }),
    ];
    const out = applyFillChain(list, TRIP);
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, null, 20, 16]);
  });

  it("missed_previous breaks the run: the record itself and the run it starts are unknown", () => {
    const list = [
      rec({ date: "2026-04-01", total_distance: 300, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-04-02", total_distance: 300, fuel_amount: 20, missed_previous: true }),
      rec({ date: "2026-04-03", total_distance: 300, fuel_amount: 20 }),
      rec({ date: "2026-04-04", total_distance: 300, fuel_amount: 10, missed_previous: true, is_full: false }),
      rec({ date: "2026-04-05", total_distance: 300, fuel_amount: 20 }),
      rec({ date: "2026-04-06", total_distance: 450, fuel_amount: 30 }),
    ];
    const out = applyFillChain(list, TRIP);
    // 1: 部分 → null / 2: 記録漏れ（満タン）→ null（区間不明）/ 3: 新しい run → 15
    // 4: 記録漏れの部分 → null、run は不明のまま / 5: 4 と同じ run → null / 6: 15
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, null, 15, null, null, 15]);
    expect(out[1].total_distance).toBe(300); // トリップモードの保存値は残す
  });

  it("a null distance in the middle of a run makes the closing full fill unknown", () => {
    const list = [
      rec({ date: "2026-05-01", total_distance: 300, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-05-02", total_distance: null, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-05-03", total_distance: 300, fuel_amount: 20 }),
    ];
    expect(applyFillChain(list, TRIP).map(r => r.fuel_efficiency)).toEqual([null, null, null]);
  });

  it("a partial fill with unknown fuel makes the closing full fill unknown", () => {
    const list = [
      rec({ date: "2026-05-01", total_distance: 300, fuel_amount: null, is_full: false }),
      rec({ date: "2026-05-03", total_distance: 300, fuel_amount: 20 }),
    ];
    expect(applyFillChain(list, TRIP).map(r => r.fuel_efficiency)).toEqual([null, null]);
  });
});

describe("applyFillChain — odometer mode", () => {
  it("derives distance from odometer differences; first record has no distance", () => {
    const list = [
      rec({ date: "2026-06-01", odometer: 10000, fuel_amount: 30, total_distance: 777 }),
      rec({ date: "2026-06-10", odometer: 10450.5, fuel_amount: 30 }),
      rec({ date: "2026-06-20", odometer: 10900.2, fuel_amount: 25 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(out.map(r => r.total_distance)).toEqual([null, 450.5, 449.7]); // 保存値 777 は上書き
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, 15.02, 17.99]);
  });

  it("non-positive difference and missing odometers give null distance and break the run (a missing odometer does not lose the base)", () => {
    const list = [
      rec({ id: "o1", date: "2026-07-01", odometer: 5000, fuel_amount: 30 }),
      rec({ id: "o2", date: "2026-07-02", odometer: 5000, fuel_amount: 5 }), // 差 0
      rec({ id: "o3", date: "2026-07-03", odometer: null, fuel_amount: 20 }), // オドメーターなし
      rec({ id: "o4", date: "2026-07-04", odometer: 5600, fuel_amount: 30 }), // 直前に無くても基準（最大値 5000）との差
      rec({ id: "o5", date: "2026-07-05", odometer: 6000, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ o1: null, o2: null, o3: null, o4: 600, o5: 400 });
    expect(effById(out)).toEqual({ o1: null, o2: null, o3: null, o4: 20, o5: 20 });
  });

  it("missed_previous nulls the distance even when odometers are known", () => {
    const list = [
      rec({ id: "m1", date: "2026-08-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "m2", date: "2026-08-10", odometer: 1600, fuel_amount: 20, missed_previous: true }),
      rec({ id: "m3", date: "2026-08-20", odometer: 1900, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ m1: null, m2: null, m3: 300 });
    expect(effById(out)).toEqual({ m1: null, m2: null, m3: 15 });
  });

  it("a decreased odometer does not move the base: 1000 → 1300 → 130 → 1600 gives null / 300 / null / 300", () => {
    const list = [
      rec({ id: "d1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "d2", date: "2026-10-02", odometer: 1300, fuel_amount: 20 }),
      rec({ id: "d3", date: "2026-10-03", odometer: 130, fuel_amount: 20 }),
      rec({ id: "d4", date: "2026-10-04", odometer: 1600, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ d1: null, d2: 300, d3: null, d4: 300 });
    expect(effById(out)).toEqual({ d1: null, d2: 15, d3: null, d4: 15 });
  });

  it("missed_previous with a higher odometer still advances the base (distance stays null)", () => {
    const list = [
      rec({ id: "k1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "k2", date: "2026-10-02", odometer: 1600, fuel_amount: 20, missed_previous: true }),
      rec({ id: "k3", date: "2026-10-03", odometer: 1900, fuel_amount: 20 }),
    ];
    expect(distById(applyFillChain(list, ODO))).toEqual({ k1: null, k2: null, k3: 300 });
    // 先頭が missed_previous でも、そのオドメーターが基準になる
    const first = [
      rec({ id: "f1", date: "2026-10-01", odometer: 500, fuel_amount: 20, missed_previous: true }),
      rec({ id: "f2", date: "2026-10-02", odometer: 800, fuel_amount: 20 }),
    ];
    expect(distById(applyFillChain(first, ODO))).toEqual({ f1: null, f2: 300 });
  });

  it("partial fills accumulate odometer distances", () => {
    const list = [
      rec({ date: "2026-09-01", odometer: 20000, fuel_amount: 40 }),
      rec({ date: "2026-09-05", odometer: 20300, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-09-09", odometer: 20600, fuel_amount: 25 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(out.map(r => r.total_distance)).toEqual([null, 300, 300]);
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, null, 17.14]);
  });
});

describe("applyFillChain — order and purity", () => {
  it("returns records in the same order as the input (e.g. date descending) without mutating it", () => {
    const oldest = rec({ id: "c1", date: "2026-01-01", odometer: 100, fuel_amount: 10 });
    const middle = rec({ id: "c2", date: "2026-01-05", odometer: 400, fuel_amount: 10, is_full: false });
    const newest = rec({ id: "c3", date: "2026-01-09", odometer: 700, fuel_amount: 20 });
    const input = [newest, oldest, middle];
    const snapshot = JSON.stringify(input);
    const out = applyFillChain(input, ODO);
    expect(out.map(r => r.id)).toEqual(["c3", "c1", "c2"]);
    expect(effById(out)).toEqual({ c1: null, c2: null, c3: 20 });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out[0]).not.toBe(newest);
  });

  it("same-day records are chained by odometer, then created_at", () => {
    const list = [
      rec({ id: "s2", date: "2026-02-01", odometer: 1300, fuel_amount: 20 }),
      rec({ id: "s1", date: "2026-02-01", odometer: 1000, fuel_amount: 20 }),
    ];
    expect(distById(applyFillChain(list, ODO))).toEqual({ s1: null, s2: 300 });

    const trip = [
      rec({ id: "t2", date: "2026-02-01", total_distance: 300, fuel_amount: 20, created_at: "2026-02-01T12:00:00Z" }),
      rec({ id: "t1", date: "2026-02-01", total_distance: 300, fuel_amount: 10, is_full: false, created_at: "2026-02-01T08:00:00Z" }),
    ];
    expect(effById(applyFillChain(trip, TRIP))).toEqual({ t1: null, t2: 20 });
  });

  it("is per vehicle: the caller groups records (applyFillChainByVehicle keeps vehicles separate)", () => {
    const list = [
      rec({ id: "a1", vehicle_id: "va", date: "2026-01-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "b1", vehicle_id: "vb", date: "2026-01-02", total_distance: 100, fuel_amount: 10, is_full: false }),
      rec({ id: "a2", vehicle_id: "va", date: "2026-01-03", odometer: 1300, fuel_amount: 20 }),
      rec({ id: "u1", vehicle_id: null, date: "2026-01-04", total_distance: 200, fuel_amount: 10, is_full: false }),
      rec({ id: "b2", vehicle_id: "vb", date: "2026-01-05", total_distance: 200, fuel_amount: 10 }),
      rec({ id: "u2", vehicle_id: "default-car", date: "2026-01-06", total_distance: 300, fuel_amount: 20 }),
      rec({ id: "d1", vehicle_id: "vd", date: "2026-01-07", total_distance: 300, fuel_amount: 20 }),
    ];
    const modes: Record<string, "trip" | "odometer"> = { va: "odometer", vb: "trip", vd: "trip" };
    const out = applyFillChainByVehicle(list, id => (id ? modes[id] : undefined) ?? "trip", "vd");
    expect(out.map(r => r.id)).toEqual(list.map(r => r.id));
    expect(distById(out)).toMatchObject({ a1: null, a2: 300 });
    // vb: 部分 100km/10L + 満タン 200km/10L = 15（va・未分類の記録は混ざらない）
    // 未分類（null / default-car）は既定車両 vd の連鎖: 部分 200/10 + 満タン 300/20 = 16.67、d1 は run が閉じた後 = 15
    expect(effById(out)).toEqual({ a1: null, a2: 15, b1: null, b2: 15, u1: null, u2: 16.67, d1: 15 });

    // 一緒に渡すと（誤用）、別車両の部分給油が混ざって結果が変わる
    const mixed = applyFillChain(list.filter(r => r.vehicle_id === "vb" || r.vehicle_id === null), TRIP);
    expect(effById(mixed).b2).not.toBe(15);
  });
});

describe("previousOdometer", () => {
  const list = [
    rec({ id: "p3", date: "2026-03-20", odometer: 1600 }),
    rec({ id: "p1", date: "2026-03-01", odometer: 1000 }),
    rec({ id: "p2", date: "2026-03-10", odometer: null }),
    rec({ id: "p4", date: "2026-03-20", odometer: 1800 }),
  ];

  it("returns the max odometer among records before the position (by record id)", () => {
    expect(previousOdometer(list, { recordId: "p1" })).toBeNull(); // 先頭
    expect(previousOdometer(list, { recordId: "p2" })).toBe(1000);
    expect(previousOdometer(list, { recordId: "p3" })).toBe(1000); // 直前（p2）に無くても、それ以前の最大値
    expect(previousOdometer(list, { recordId: "p4" })).toBe(1600);
    expect(previousOdometer(list, { recordId: "missing" })).toBeNull();
  });

  it("returns the max odometer among records on or before a date (for a new record)", () => {
    expect(previousOdometer(list, { date: "2026-02-28" })).toBeNull();
    expect(previousOdometer(list, { date: "2026-03-05" })).toBe(1000);
    expect(previousOdometer(list, { date: "2026-03-15" })).toBe(1000); // p2 に無くても、それ以前の最大値
    expect(previousOdometer(list, { date: "2026-03-20" })).toBe(1800); // 同じ日付の既存記録の後ろ
    expect(previousOdometer([], { date: "2026-03-20" })).toBeNull();
  });

  it("matches the base the chain uses after a decreased odometer (1000 → 1300 → 130 → 1600)", () => {
    const seqList = [
      rec({ id: "q1", date: "2026-11-01", odometer: 1000 }),
      rec({ id: "q2", date: "2026-11-02", odometer: 1300 }),
      rec({ id: "q3", date: "2026-11-03", odometer: 130 }),
      rec({ id: "q4", date: "2026-11-04", odometer: 1600 }),
    ];
    expect(previousOdometer(seqList, { date: "2026-11-30" })).toBe(1600);
    expect(previousOdometer(seqList, { recordId: "q3" })).toBe(1300);
    expect(previousOdometer(seqList, { recordId: "q4" })).toBe(1300); // 130 は基準にならない
  });
});

describe("pickRecordColumns", () => {
  it("keeps only known columns that are defined and validates the new ones", () => {
    const input = {
      id: "x",
      user_id: "someone",
      date: "2026-01-01",
      total_distance: 300,
      fuel_amount: undefined,
      odometer: -1,
      is_full: "yes",
      missed_previous: true,
      fuel_type: "gasoline",
      memo: "  メモ  ",
      extra: 1,
    } as unknown as Partial<FuelRecord>;
    expect(pickRecordColumns(input)).toEqual({
      date: "2026-01-01",
      total_distance: 300,
      odometer: null,
      missed_previous: true,
      fuel_type: null,
      memo: "メモ",
    });
  });

  it("returns an empty object when nothing known is given (old callers send no new columns)", () => {
    expect(pickRecordColumns({})).toEqual({});
    expect(Object.keys(pickRecordColumns({ gas_station: null }))).toEqual(["gas_station"]);
  });
});
