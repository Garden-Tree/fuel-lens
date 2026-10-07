import { describe, expect, it } from "vitest";
import { calculateFuelMetrics } from "@/lib/calculations";
import {
  FUEL_TYPE_LABELS,
  applyFillChain,
  chainBaseBefore,
  compareForChain,
  isFuelType,
  normalizeRecord,
  normalizeVehicle,
  openRunBefore,
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

  it("missed_previous ends the run: the record itself is unknown and the next run starts at the following record", () => {
    const list = [
      rec({ date: "2026-04-01", total_distance: 300, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-04-02", total_distance: 300, fuel_amount: 20, missed_previous: true }),
      rec({ date: "2026-04-03", total_distance: 300, fuel_amount: 20 }),
      rec({ date: "2026-04-04", total_distance: 300, fuel_amount: 10, missed_previous: true, is_full: false }),
      rec({ date: "2026-04-05", total_distance: 300, fuel_amount: 20 }),
      rec({ date: "2026-04-06", total_distance: 450, fuel_amount: 30 }),
    ];
    const out = applyFillChain(list, TRIP);
    // 1: 部分 → null / 2: 記録漏れ（満タン）→ null（区間不明。1 の run は捨てる）/ 3: 新しい run → 15
    // 4: 記録漏れの部分 → null（run に含めず、給油量も持ち越さない）/ 5: 4 の次から始まる run → 300 ÷ 20 = 15 / 6: 15
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, null, 15, null, 15, 15]);
    // トリップモードでは missed_previous の記録も入力した区間距離を保持する（編集で消さない）。燃費だけ null
    expect(out.map(r => r.total_distance)).toEqual([300, 300, 300, 300, 300, 450]);
  });

  it("a null distance cuts the run like missed_previous: the row is excluded and the next run starts after it", () => {
    const list = [
      rec({ date: "2026-05-01", total_distance: 300, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-05-02", total_distance: null, fuel_amount: 10, is_full: false }),
      rec({ date: "2026-05-03", total_distance: 300, fuel_amount: 20 }),
    ];
    // 2 で run が切れる（1 の部分給油は捨てる）。3 は 2 の次から始まる run: 300 ÷ 20 = 15
    expect(applyFillChain(list, TRIP).map(r => r.fuel_efficiency)).toEqual([null, null, 15]);
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

  it("non-positive difference and missing odometers are carry rows: null distance, but their fuel stays in the run", () => {
    const list = [
      rec({ id: "o1", date: "2026-07-01", odometer: 5000, fuel_amount: 30 }),
      rec({ id: "o2", date: "2026-07-02", odometer: 5000, fuel_amount: 5 }), // 差 0 → 持ち越し
      rec({ id: "o3", date: "2026-07-03", odometer: null, fuel_amount: 20 }), // オドメーターなし → 持ち越し
      rec({ id: "o4", date: "2026-07-04", odometer: 5600, fuel_amount: 30 }), // 基準（最大値 5000）との差 600
      rec({ id: "o5", date: "2026-07-05", odometer: 6000, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ o1: null, o2: null, o3: null, o4: 600, o5: 400 });
    // o4: 600 ÷ (5 + 20 + 30) = 10.91（持ち越し行の給油量も含める）。o5 は新しい run
    expect(effById(out)).toEqual({ o1: null, o2: null, o3: null, o4: 10.91, o5: 20 });
  });

  it("spec example: A(1000 km, 30 L) → B(no odometer, 20 L) → C(1600 km, 20 L) gives C 600 km and 15.00", () => {
    const list = [
      rec({ id: "A", date: "2026-07-10", odometer: 1000, fuel_amount: 30 }),
      rec({ id: "B", date: "2026-07-11", odometer: null, fuel_amount: 20 }),
      rec({ id: "C", date: "2026-07-12", odometer: 1600, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ A: null, B: null, C: 600 });
    expect(effById(out)).toEqual({ A: null, B: null, C: 15 });
  });

  it("a carry row with unknown fuel makes the closing full fill unknown", () => {
    const list = [
      rec({ id: "x1", date: "2026-07-10", odometer: 1000, fuel_amount: 30 }),
      rec({ id: "x2", date: "2026-07-11", odometer: null, fuel_amount: null }),
      rec({ id: "x3", date: "2026-07-12", odometer: 1600, fuel_amount: 20 }),
      rec({ id: "x4", date: "2026-07-13", odometer: 1900, fuel_amount: 20 }),
    ];
    expect(effById(applyFillChain(list, ODO))).toEqual({ x1: null, x2: null, x3: null, x4: 15 });
  });

  it("carry rows combine with partial fills in the same run", () => {
    const list = [
      rec({ id: "y1", date: "2026-07-20", odometer: 2000, fuel_amount: 40 }),
      rec({ id: "y2", date: "2026-07-21", odometer: 2300, fuel_amount: 10, is_full: false }),
      rec({ id: "y3", date: "2026-07-22", odometer: null, fuel_amount: 10 }),
      rec({ id: "y4", date: "2026-07-23", odometer: 2800, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ y1: null, y2: 300, y3: null, y4: 500 });
    // (300 + 500) ÷ (10 + 10 + 20) = 20
    expect(effById(out)).toEqual({ y1: null, y2: null, y3: null, y4: 20 });
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

  it("a decreased odometer does not move the base: 1000 → 1300 → 130 → 1600 gives null / 300 / null / 300 (15.00 / 7.50)", () => {
    const list = [
      rec({ id: "d1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "d2", date: "2026-10-02", odometer: 1300, fuel_amount: 20 }),
      rec({ id: "d3", date: "2026-10-03", odometer: 130, fuel_amount: 20 }),
      rec({ id: "d4", date: "2026-10-04", odometer: 1600, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ d1: null, d2: 300, d3: null, d4: 300 });
    // d3 は持ち越し行: 給油量 20 L は d4 の run に入る → 300 ÷ (20 + 20) = 7.50
    expect(effById(out)).toEqual({ d1: null, d2: 15, d3: null, d4: 7.5 });
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

  it("a missed row ends the run; the next run starts at the following record and the missed fuel is not carried", () => {
    const list = [
      rec({ id: "n1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "n2", date: "2026-10-02", odometer: null, fuel_amount: 10 }), // 持ち越し（n3 で run が切れて捨てられる）
      rec({ id: "n3", date: "2026-10-03", odometer: 1600, fuel_amount: 20, missed_previous: true }),
      rec({ id: "n4", date: "2026-10-04", odometer: 1900, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ n1: null, n2: null, n3: null, n4: 300 });
    expect(effById(out)).toEqual({ n1: null, n2: null, n3: null, n4: 15 });

    // 記録漏れの部分給油も run に含めない: 次の満タン給油は記録漏れの行を基準にした区間だけで計算する
    const partial = [
      rec({ id: "w1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "w2", date: "2026-10-02", odometer: 1600, fuel_amount: 10, missed_previous: true, is_full: false }),
      rec({ id: "w3", date: "2026-10-03", odometer: 1900, fuel_amount: 20 }),
      rec({ id: "w4", date: "2026-10-04", odometer: 2200, fuel_amount: 20 }),
    ];
    expect(effById(applyFillChain(partial, ODO))).toEqual({ w1: null, w2: null, w3: 15, w4: 15 });
  });

  it("spec example: 5000/4 L → 5200/4.5 L → 5300 (missed, partial 1.5 L) → 5500/4 L gives null / 44.44 / null / 50.00", () => {
    const list = [
      rec({ id: "e1", date: "2026-11-01", odometer: 5000, fuel_amount: 4 }),
      rec({ id: "e2", date: "2026-11-02", odometer: 5200, fuel_amount: 4.5 }),
      rec({ id: "e3", date: "2026-11-03", odometer: 5300, fuel_amount: 1.5, missed_previous: true, is_full: false }),
      rec({ id: "e4", date: "2026-11-04", odometer: 5500, fuel_amount: 4 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(out.map(r => r.fuel_efficiency)).toEqual([null, 44.44, null, 50]);
    // 5500 の区間は 200 km（基準は記録漏れの 5300）。記録漏れの 1.5 L は持ち越さない
    expect(out.map(r => r.total_distance)).toEqual([null, 200, null, 200]);
    // フォームのプレビュー: 5500 の直前の run は空、基準は 5300
    expect(openRunBefore(list, ODO, { recordId: "e4" })).toEqual({ distance: 0, fuel: 0, valid: true, count: 0, baseStale: false });
    expect(previousOdometer(list, { recordId: "e4" })).toBe(5300);
  });

  it("missed_previous rows are never carry rows; one that cannot advance the base makes the next record a first record", () => {
    const list = [
      rec({ id: "z1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "z2", date: "2026-10-02", odometer: 900, fuel_amount: 50, missed_previous: true }),
      rec({ id: "z3", date: "2026-10-03", odometer: 1300, fuel_amount: 20 }),
      rec({ id: "z4", date: "2026-10-04", odometer: 1600, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    // z3 は先頭扱い（距離 null、基準 1300）。z2 の 50 L はどこの run にも入らない
    expect(distById(out)).toEqual({ z1: null, z2: null, z3: null, z4: 300 });
    expect(effById(out)).toEqual({ z1: null, z2: null, z3: null, z4: 15 });
  });

  it.each([
    ["no odometer", null, null],
    ["an odometer below the base", 900, null],
    ["an odometer above the base (advances it: unchanged behaviour)", 1300, 300],
  ])("A(1000) → M(missed, %s) → C(1600): C distance", (_label, mOdo, expected) => {
    const list = [
      rec({ id: "A", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "M", date: "2026-10-02", odometer: mOdo, fuel_amount: 20, missed_previous: true }),
      rec({ id: "C", date: "2026-10-03", odometer: 1600, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ A: null, M: null, C: expected });
    expect(effById(out).C).toBe(expected === null ? null : 15);
  });

  it("the stale base survives carry rows until a record advances it", () => {
    const list = [
      rec({ id: "s1", date: "2026-10-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "s2", date: "2026-10-02", odometer: null, fuel_amount: 20, missed_previous: true }),
      rec({ id: "s3", date: "2026-10-03", odometer: null, fuel_amount: 20 }), // 持ち越し行
      rec({ id: "s4", date: "2026-10-04", odometer: 1600, fuel_amount: 20 }), // 先頭扱い
      rec({ id: "s5", date: "2026-10-05", odometer: 1900, fuel_amount: 20 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(distById(out)).toEqual({ s1: null, s2: null, s3: null, s4: null, s5: 300 });
    expect(effById(out)).toEqual({ s1: null, s2: null, s3: null, s4: null, s5: 15 });
    // フォームの「前回のオドメーター」も同じく、基準が進むまでは無い
    expect(previousOdometer(list, { recordId: "s3" })).toBeNull();
    expect(previousOdometer(list, { recordId: "s4" })).toBeNull();
    expect(previousOdometer(list, { recordId: "s5" })).toBe(1600);
    expect(previousOdometer(list.slice(0, 3), { date: "2026-10-30" })).toBeNull();
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

describe("openRunBefore", () => {
  const EMPTY = { distance: 0, fuel: 0, valid: true, count: 0, baseStale: false };

  it("is empty and valid when there is no open run", () => {
    expect(openRunBefore([], TRIP, { date: "2026-05-01" })).toEqual(EMPTY);
    const afterFull = [rec({ id: "f1", date: "2026-05-01", total_distance: 400, fuel_amount: 30 })];
    expect(openRunBefore(afterFull, TRIP, { date: "2026-05-10" })).toEqual(EMPTY);
    expect(openRunBefore(afterFull, TRIP, { recordId: "f1" })).toEqual(EMPTY);
    expect(openRunBefore(afterFull, TRIP, { recordId: "missing" })).toEqual(EMPTY);
  });

  it("sums the partial fills since the last full fill", () => {
    const list = [
      rec({ id: "f1", date: "2026-05-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2026-05-05", total_distance: 149.5, fuel_amount: 2, is_full: false }),
      rec({ id: "p2", date: "2026-05-07", total_distance: 100, fuel_amount: 8, is_full: false }),
      rec({ id: "f2", date: "2026-05-10", total_distance: 250, fuel_amount: 5.2 }),
    ];
    expect(openRunBefore(list, TRIP, { recordId: "p1" })).toEqual(EMPTY);
    expect(openRunBefore(list, TRIP, { recordId: "p2" })).toEqual({ ...EMPTY, distance: 149.5, fuel: 2, count: 1 });
    expect(openRunBefore(list, TRIP, { recordId: "f2" })).toEqual({ ...EMPTY, distance: 249.5, fuel: 10, count: 2 });
    expect(openRunBefore(list, TRIP, { date: "2026-05-08" })).toEqual({ ...EMPTY, distance: 249.5, fuel: 10, count: 2 });
    expect(openRunBefore(list, TRIP, { date: "2026-05-06" })).toEqual({ ...EMPTY, distance: 149.5, fuel: 2, count: 1 });
  });

  it("matches the efficiency the chain stores for the following full fill (149.5 km / 2.0 L + 250 km / 5.2 L)", () => {
    const list = [
      rec({ id: "f1", date: "2026-05-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2026-05-05", total_distance: 149.5, fuel_amount: 2, is_full: false }),
      rec({ id: "f2", date: "2026-05-10", total_distance: 250, fuel_amount: 5.2 }),
    ];
    const run = openRunBefore(list, TRIP, { recordId: "f2" });
    const preview = calculateFuelMetrics((run.distance + 250), 5.2 + run.fuel, null).fuel_efficiency;
    expect(preview).toBe(55.49);
    expect(effById(applyFillChain(list, TRIP)).f2).toBe(55.49);
  });

  it("is invalid when a record in the run has a null fuel amount; a null distance (trip mode) cuts the run instead", () => {
    const nullFuel = [
      rec({ id: "f1", date: "2026-06-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2026-06-05", total_distance: 100, fuel_amount: null, is_full: false }),
    ];
    expect(openRunBefore(nullFuel, TRIP, { date: "2026-06-10" })).toMatchObject({ valid: false, count: 1 });
    const nullDistance = [
      rec({ id: "f1", date: "2026-06-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2026-06-05", total_distance: null, fuel_amount: 5, is_full: false }),
    ];
    // トリップモードで距離の無い記録は run を切り、その記録自身も run に含めない
    expect(openRunBefore(nullDistance, TRIP, { date: "2026-06-10" })).toEqual(EMPTY);
  });

  it("odometer mode: a carry row with null fuel makes the run invalid, a carry row with fuel is counted", () => {
    const base = rec({ id: "a", date: "2026-07-01", odometer: 1000, fuel_amount: 30 });
    const carryNoFuel = rec({ id: "b", date: "2026-07-05", odometer: null, fuel_amount: null });
    expect(openRunBefore([base, carryNoFuel], ODO, { date: "2026-07-10" })).toMatchObject({ valid: false, count: 1 });
    const carry = rec({ id: "b", date: "2026-07-05", odometer: null, fuel_amount: 20 });
    // 満タンの a の後の持ち越し行: 距離は次の記録の差分に含まれるので run は給油量だけ積む
    const first = rec({ id: "z", date: "2026-06-20", odometer: 500, fuel_amount: 30 });
    const chain = [first, rec({ id: "a", date: "2026-07-01", odometer: 1000, fuel_amount: 30 }), carry];
    expect(openRunBefore(chain, ODO, { date: "2026-07-10" })).toEqual({ ...EMPTY, fuel: 20, count: 1 });
    // C(1600) の区間 600 km は持ち越し行の分を含む: (0 + 600) / (20 + 20) = 15
    const next = rec({ id: "c", date: "2026-07-10", odometer: 1600, fuel_amount: 20 });
    expect(effById(applyFillChain([...chain, next], ODO)).c).toBe(15);
  });

  it("resets the run after a full fill and at a missed_previous record", () => {
    const list = [
      rec({ id: "f1", date: "2026-08-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2026-08-03", total_distance: 100, fuel_amount: 5, is_full: false }),
      rec({ id: "f2", date: "2026-08-05", total_distance: 200, fuel_amount: 10 }),
    ];
    expect(openRunBefore(list, TRIP, { date: "2026-08-10" })).toEqual(EMPTY);
    // 記録漏れの満タン給油は run を閉じる（その記録自身の分は残らない）
    const missedFull = [...list, rec({ id: "m1", date: "2026-08-07", total_distance: 300, fuel_amount: 20, missed_previous: true })];
    expect(openRunBefore(missedFull, TRIP, { date: "2026-08-10" })).toEqual(EMPTY);
    // 記録漏れの部分給油: それ以前の run は捨て、その記録自身も run に含めない（新しい run は次の記録から）
    const before = rec({ id: "p0", date: "2026-08-06", total_distance: 90, fuel_amount: 4, is_full: false });
    const missedPartial = rec({ id: "m2", date: "2026-08-07", total_distance: 300, fuel_amount: 20, missed_previous: true, is_full: false });
    expect(openRunBefore([...list, before, missedPartial], TRIP, { date: "2026-08-10" })).toEqual(EMPTY);
  });

  it("reports baseStale after a missed row that could not advance the base (odometer mode)", () => {
    const list = [
      rec({ id: "a", date: "2026-09-01", odometer: 1000, fuel_amount: 20 }),
      rec({ id: "m", date: "2026-09-02", odometer: null, fuel_amount: 20, missed_previous: true }),
      rec({ id: "c", date: "2026-09-03", odometer: null, fuel_amount: 10 }), // 持ち越し行
      rec({ id: "d", date: "2026-09-04", odometer: 1600, fuel_amount: 20 }), // 先頭扱い
    ];
    expect(openRunBefore(list, ODO, { recordId: "c" })).toMatchObject({ baseStale: true, count: 0 });
    expect(openRunBefore(list, ODO, { recordId: "d" })).toMatchObject({ baseStale: true, count: 1, fuel: 10 });
    expect(openRunBefore(list, ODO, { date: "2026-09-30" })).toMatchObject({ baseStale: false });
    expect(chainBaseBefore(list, { recordId: "d" })).toEqual({ odometer: null, stale: true });
    expect(chainBaseBefore(list, { date: "2026-09-30" })).toEqual({ odometer: 1600, stale: false });
    expect(chainBaseBefore(list, { recordId: "a" })).toEqual({ odometer: null, stale: false }); // 先頭（理由は記録漏れではない）
    expect(chainBaseBefore(list, { recordId: "missing" })).toEqual({ odometer: null, stale: false });
    // 基準を進めた記録漏れの後は stale ではない
    const advanced = [list[0], rec({ id: "m2", date: "2026-09-02", odometer: 1300, missed_previous: true })];
    expect(chainBaseBefore(advanced, { date: "2026-09-30" })).toEqual({ odometer: 1300, stale: false });
    // トリップモードでは常に false
    expect(openRunBefore(list, TRIP, { date: "2026-09-30" }).baseStale).toBe(false);
  });
});

describe("same-date position of a new / moved record (matches the chain order)", () => {
  /** 新規の記録を保存したときの形（created_at はいま） */
  const saved = (overrides: Partial<FuelRecord>) => rec({ id: "new", created_at: "2026-12-31T12:00:00Z", ...overrides });

  it("a new record with an odometer goes before a same-date record without one (preview = chain)", () => {
    const list = [
      rec({ id: "a", date: "2026-12-01", odometer: 1000, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "x", date: "2026-12-10", odometer: null, fuel_amount: 20, created_at: "2026-12-10T09:00:00Z" }), // 持ち越し行
    ];
    const at = { date: "2026-12-10", odometer: 1600 };
    // 連鎖計算では新しい 1600 の記録が x（オドメーターなし）より前に並ぶ: 600 ÷ 20 = 30。x は次の run の持ち越し行
    const chained = applyFillChain([...list, saved({ date: "2026-12-10", odometer: 1600, fuel_amount: 20 })], ODO);
    expect(effById(chained).new).toBe(30);
    // プレビューも同じ位置: 基準 1000、直前の run は空（x の 20 L は合算しない）
    expect(previousOdometer(list, at)).toBe(1000);
    expect(openRunBefore(list, ODO, at)).toMatchObject({ count: 0, valid: true });
    const run = openRunBefore(list, ODO, at);
    expect((run.distance + 600) / (run.fuel + 20)).toBe(30);
    // オドメーターを渡さなければ、同じ日付の記録の後ろ（従来の位置）
    expect(openRunBefore(list, ODO, { date: "2026-12-10" })).toMatchObject({ count: 1, fuel: 20 });
  });

  it("a new 1400 goes before a same-date partial at 1500: preview 20.00 instead of null", () => {
    const list = [
      rec({ id: "a", date: "2026-12-01", odometer: 1000, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "p", date: "2026-12-10", odometer: 1500, fuel_amount: 5, is_full: false, created_at: "2026-12-10T09:00:00Z" }),
    ];
    const at = { date: "2026-12-10", odometer: 1400 };
    expect(previousOdometer(list, at)).toBe(1000);
    expect(openRunBefore(list, ODO, at)).toMatchObject({ count: 0 });
    const chained = applyFillChain([...list, saved({ date: "2026-12-10", odometer: 1400, fuel_amount: 20 })], ODO);
    expect(effById(chained).new).toBe(20); // 400 ÷ 20
    // 従来の位置（同じ日付の記録の後ろ）だと基準 1500 で区間が出なかった
    expect(previousOdometer(list, { date: "2026-12-10" })).toBe(1500);
  });

  it("trip mode: a legacy same-date record without created_at is chained after a new record", () => {
    const list = [
      rec({ id: "f", date: "2026-12-01", total_distance: 400, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "l", date: "2026-12-10", total_distance: 100, fuel_amount: 10, is_full: false, created_at: null }),
    ];
    // 新しい記録（created_at あり）は created_at の無い古い記録より前に並ぶので、l の部分給油は合算されない
    const chained = applyFillChain([...list, saved({ date: "2026-12-10", total_distance: 300, fuel_amount: 20 })], TRIP);
    expect(effById(chained).new).toBe(15);
    expect(openRunBefore(list, TRIP, { date: "2026-12-10" })).toMatchObject({ count: 0 });
    // created_at のある同じ日付の記録の後ろには並ぶ
    const withCreated = [list[0], { ...list[1], created_at: "2026-12-10T08:00:00Z" }];
    expect(openRunBefore(withCreated, TRIP, { date: "2026-12-10" })).toMatchObject({ count: 1, fuel: 10 });
  });

  it("{ recordId, date, odometer }: positions the edited record by its new values, excluding itself", () => {
    const list = [
      rec({ id: "a", date: "2026-12-01", odometer: 1000, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "b", date: "2026-12-10", odometer: 1500, created_at: "2026-12-10T00:00:00Z" }),
      rec({ id: "e", date: "2026-12-20", odometer: 2000, created_at: "2026-12-20T00:00:00Z" }),
    ];
    expect(previousOdometer(list, { recordId: "e" })).toBe(1500);
    // e を 12/10 の 1400 に動かす → a の後ろ、b の前
    expect(previousOdometer(list, { recordId: "e", date: "2026-12-10", odometer: 1400 })).toBe(1000);
    // e を 12/10 に動かす（オドメーターは保存値 2000）→ b の後ろ。自分自身は数えない
    expect(previousOdometer(list, { recordId: "e", date: "2026-12-10" })).toBe(1500);
    expect(previousOdometer(list, { recordId: "e", date: "2026-12-30" })).toBe(1500);
    // オドメーターだけ変える
    expect(previousOdometer(list, { recordId: "b", odometer: 900 })).toBe(1000); // 日付順は変わらない（a の後ろ）
    expect(previousOdometer(list, { recordId: "missing", date: "2026-12-30" })).toBeNull();
  });
});

describe("applyFillChain — closed run totals (derived run_* fields)", () => {
  it("attaches run_distance / run_fuel / run_cost to rows that close a run with an efficiency", () => {
    const list = [
      rec({ id: "A", date: "2026-07-10", odometer: 1000, fuel_amount: 30, total_cost: 4500 }),
      rec({ id: "B", date: "2026-07-11", odometer: null, fuel_amount: 20, total_cost: 3000 }),
      rec({ id: "C", date: "2026-07-12", odometer: 1600, fuel_amount: 20, total_cost: 3000 }),
    ];
    const out = applyFillChain(list, ODO);
    expect(out[2]).toMatchObject({ fuel_efficiency: 15, run_distance: 600, run_fuel: 40, run_cost: 6000 });
    expect(out[0]).not.toHaveProperty("run_distance");
    expect(out[1]).not.toHaveProperty("run_fuel");
  });

  it("run_cost is null when a row of the run has no cost; rows without an efficiency get no run fields", () => {
    const list = [
      rec({ id: "p", date: "2026-05-01", total_distance: 100, fuel_amount: 5, is_full: false, total_cost: null }),
      rec({ id: "f", date: "2026-05-02", total_distance: 200, fuel_amount: 10, total_cost: 1700 }),
      rec({ id: "n", date: "2026-05-03", total_distance: 200, fuel_amount: null, total_cost: 1700 }),
    ];
    const out = applyFillChain(list, TRIP);
    expect(out[1]).toMatchObject({ run_distance: 300, run_fuel: 15, run_cost: null });
    expect(out[2].fuel_efficiency).toBeNull();
    expect(out[2]).not.toHaveProperty("run_distance");
  });

  it("drops stale run fields from the input and never sends them to storage", () => {
    const stale = rec({ id: "s", total_distance: null, fuel_amount: 10, run_distance: 999, run_fuel: 1, run_cost: 5 });
    const out = applyFillChain([stale], TRIP)[0];
    expect(out).not.toHaveProperty("run_distance");
    expect(out).not.toHaveProperty("run_fuel");
    expect(out).not.toHaveProperty("run_cost");
    const closed = applyFillChain([rec({ total_distance: 300, fuel_amount: 20, total_cost: 3000 })], TRIP)[0];
    expect(closed).toMatchObject({ run_distance: 300, run_fuel: 20, run_cost: 3000 });
    expect(pickRecordColumns(closed)).not.toHaveProperty("run_distance");
    expect(pickRecordColumns(closed)).not.toHaveProperty("run_fuel");
    expect(pickRecordColumns(closed)).not.toHaveProperty("run_cost");
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
