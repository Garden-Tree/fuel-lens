/**
 * Fuelio の CSV → 取り込み → 保存 → 連鎖計算 → 履歴・ホーム・統計の通しテスト。
 * 実際のユーザーが 2 台分の Fuelio CSV（26 件 + 1 件）を取り込んだ状況を再現し、画面が使うセレクタの値を確かめる。
 * フィクスチャ（tests/fixtures/*.csv）は合成データ（Fuelio の書き出し形式。実データではない）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseBackup } from "@/lib/backup";
import { calculateFuelMetrics } from "@/lib/calculations";
import { applyFillChain, distanceModeOf, normalizeRecord } from "@/lib/fillChain";
import { groupByMonth } from "@/lib/history/groupByMonth";
import { formatYen as formatHistoryYen } from "@/lib/history/recordList";
import { heroModelOf } from "@/lib/home/hero";
import { monthSummaryOf } from "@/lib/home/month";
import { formatYen as formatHomeYen } from "@/lib/home/recent";
import { fuelioToBackup, parseFuelioCsv, type ParsedFuelio } from "@/lib/importers/fuelio";
import { isUnclassifiedRecord, matchesSelectedVehicle, sortRecordsByDateDesc } from "@/lib/recordFilters";
import { executeRestore, type AddRecords, type AddVehicles } from "@/lib/restore";
import { buildStatsModel } from "@/lib/stats";
import type { DistanceMode, FuelRecord, Vehicle } from "@/lib/types";
import { applyFillChainByVehicle } from "@/lib/useFuelRecords";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const BIKE_CSV = fixture("fuelio-bike.csv");
const CAR_CSV = fixture("fuelio-car-one.csv");

const TODAY = new Date(2026, 9, 22, 12, 0, 0);

function parse(text: string): ParsedFuelio {
  const r = parseFuelioCsv(text);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** 設定画面の取り込みと同じく、JSON を通して parseBackup で検証した形にする */
function backupOf(parsed: ParsedFuelio, options: Parameters<typeof fuelioToBackup>[1] = {}) {
  const r = parseBackup(JSON.stringify(fuelioToBackup(parsed, options)));
  if (!r.ok) throw new Error(r.error);
  return r.backup;
}

/** useVehicles / useFuelRecords の保存先の代わり（メモリ）。ストアは新しい列の既定値補完 + distance_mode の保存をする */
function memoryStores(initialVehicles: Vehicle[] = [], initialRecords: FuelRecord[] = []) {
  const vehicles = [...initialVehicles];
  const records = [...initialRecords];
  let seq = 0;
  const addVehicles: AddVehicles = async items => {
    const created = items.map(
      (v): Vehicle => ({
        id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
        user_id: "user_123",
        name: v.name,
        type: v.type,
        distance_mode: v.distance_mode ?? "trip",
        default_fuel_type: v.default_fuel_type ?? null,
        created_at: `2026-10-22T00:00:0${seq}.000Z`,
      })
    );
    vehicles.push(...created);
    return created;
  };
  const addRecords: AddRecords = async items => {
    for (const item of items) records.push(normalizeRecord({ ...item, id: `rec-${records.length + 1}` } as FuelRecord));
    return items.length;
  };
  const deps = () => ({ vehicles, fetchAllRecords: async () => [...records], addVehicles, addRecords });
  return { vehicles, records, deps };
}

/** useFuelRecords が画面に返す、選択中の車両の記録（連鎖計算済み・日付の降順） */
function screenRecords(vehicles: readonly Vehicle[], allRecords: readonly FuelRecord[], selectedId: string): FuelRecord[] {
  const defaultId = vehicles[0]?.id;
  const mode = (id: string | null): DistanceMode => distanceModeOf(vehicles.find(v => v.id === id));
  const chained = applyFillChainByVehicle(allRecords, mode, defaultId);
  return sortRecordsByDateDesc(chained.filter(r => matchesSelectedVehicle(r, selectedId, defaultId)));
}

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** 取り込んだ記録（日付昇順）から、期待する区間距離・燃費を独立に計算する */
function expectedChain(parsed: ParsedFuelio) {
  return parsed.records.map((r, i) => {
    if (i === 0) return { distance: null, efficiency: null };
    const prev = parsed.records[i - 1];
    const distance = Math.round(((r.odometer as number) - (prev.odometer as number)) * 10) / 10;
    return { distance, efficiency: calculateFuelMetrics(distance, r.fuel_amount, null).fuel_efficiency };
  });
}

describe("Fuelio CSV（バイク 26 件）の読み取り", () => {
  const parsed = parse(BIKE_CSV);

  it("26 件を読み、車両は小型のバイク・満タン・記録漏れなし", () => {
    expect(parsed.vehicleName).toBe("Ninja 250");
    expect(parsed.vehicleType).toBe("bike");
    expect(parsed.stats).toEqual({
      rows: 26,
      partial: 0,
      missed: 0,
      odometerNotIncreasing: 0,
      skippedInvalid: 0,
      skippedOtherTank: 0,
    });
    expect(parsed.records.every(r => r.is_full === true && r.missed_previous === false)).toBe(true);
    expect(parsed.records.every(r => r.total_distance === null && r.fuel_efficiency === null)).toBe(true);
    expect(parsed.records.every(r => finite(r.odometer) && finite(r.fuel_amount))).toBe(true);
    expect(parsed.records[0].date).toBe("2026-03-14");
    expect(parsed.records[25].date).toBe("2026-10-18");
  });

  it("小数点・桁区切りカンマ、日付形式のばらつきを正しく読む", () => {
    const [r0, , r2, , r4, , r6, , r8, , , r11] = parsed.records;
    expect(r0.odometer).toBe(12350.4); // 日付に時刻付き
    expect(r4.fuel_amount).toBe(6); // "6,00"（小数点がカンマ）
    expect(r6.odometer).toBe(13832.2); // "13,832.2"（桁区切りのカンマ）
    expect(r2.memo).toBe("ハイオク入れた"); // Notes はメモ
    expect(r2.gas_station).toBeNull(); // 店舗名は City だけ
    expect(parsed.records[17].memo).toBe("ツーリング, 箱根");
    expect(r11.date).toMatch(/^2026-\d{2}-\d{2}$/); // dd.MM.yyyy も読める
    // 日付が昇順（スラッシュ区切り・ドット区切り・時刻付きが混在しても並びが崩れない）
    const dates = parsed.records.map(r => r.date);
    expect([...dates].sort()).toEqual(dates);
    // 積算距離が単調増加
    const odos = parsed.records.map(r => r.odometer as number);
    expect(odos.every((o, i) => i === 0 || o > odos[i - 1])).toBe(true);
    // Price 空 + VolumePrice あり → 単価 × 給油量。円は整数（1117.23 円のような端数を画面に出さない）
    expect(r8.total_cost).toBeGreaterThan(0);
    expect(parsed.records.every(r => Number.isInteger(r.total_cost))).toBe(true);
    expect(r8.price_per_unit as number).toBeGreaterThanOrEqual(164.5);
    expect(r8.price_per_unit as number).toBeLessThanOrEqual(185.5);
  });
});

describe("取り込み → 保存 → 画面の値（空のストアへ取り込み）", () => {
  const bike = parse(BIKE_CSV);
  const car = parse(CAR_CSV);

  async function run() {
    const stores = memoryStores();
    // 設定画面と同じく、ファイルごとに取り込む（バイク → クルマ）
    const r1 = await executeRestore(backupOf(bike), stores.deps());
    const r2 = await executeRestore(backupOf(car), stores.deps());
    return { stores, r1, r2 };
  }

  it("車両 2 台・記録 26 + 1 件が追加され、車両は odometer 方式", async () => {
    const { stores, r1, r2 } = await run();
    expect(r1).toMatchObject({ vehiclesAdded: 1, recordsAdded: 26, skipped: 0 });
    expect(r2).toMatchObject({ vehiclesAdded: 1, recordsAdded: 1, skipped: 0 });
    expect(stores.vehicles.map(v => [v.name, v.type, v.distance_mode])).toEqual([
      ["Ninja 250", "bike", "odometer"],
      ["Prius", "car", "odometer"],
    ]);
    // 未分類（vehicle_id が null）の記録は作られない
    expect(stores.records).toHaveLength(27);
    expect(stores.records.some(r => isUnclassifiedRecord(r))).toBe(false);
    expect(stores.records.filter(r => r.vehicle_id === stores.vehicles[0].id)).toHaveLength(26);
    expect(stores.records.filter(r => r.vehicle_id === stores.vehicles[1].id)).toHaveLength(1);
    expect(stores.records.every(r => r.source === "import")).toBe(true);
  });

  it("もう一度同じファイルを取り込んでも二重登録されない", async () => {
    const { stores } = await run();
    const again = await executeRestore(backupOf(bike), stores.deps());
    expect(again).toMatchObject({ vehiclesAdded: 0, recordsAdded: 0, skipped: 26 });
  });

  it("バイクの履歴・ホーム・統計: 26 件中 25 件に燃費があり、値は 積算距離の差 ÷ 給油量", async () => {
    const { stores } = await run();
    const bikeVehicle = stores.vehicles[0];
    const asc = [...screenRecords(stores.vehicles, stores.records, bikeVehicle.id)].reverse();
    expect(asc).toHaveLength(26);

    const expected = expectedChain(bike);
    asc.forEach((r, i) => {
      expect(r.total_distance).toBe(expected[i].distance);
      expect(r.fuel_efficiency).toBe(expected[i].efficiency);
    });
    expect(asc[0].fuel_efficiency).toBeNull();
    const withEff = asc.filter(r => finite(r.fuel_efficiency));
    expect(withEff).toHaveLength(25);
    // バイクとして現実的な燃費（30〜50 km/L）で、NaN / Infinity が無い
    for (const r of withEff) {
      expect(r.fuel_efficiency as number).toBeGreaterThan(30);
      expect(r.fuel_efficiency as number).toBeLessThan(50);
    }
    for (const r of asc) {
      for (const key of ["total_distance", "fuel_efficiency", "fuel_amount", "total_cost", "price_per_unit"] as const) {
        const v = r[key];
        expect(v === null || finite(v)).toBe(true);
      }
    }

    // ---- 統計 ----
    const model = buildStatsModel(asc, "all", TODAY);
    const s = model.summary;
    const sumDistance = expected.reduce((a, e) => a + (e.distance ?? 0), 0);
    const sumFuelExceptFirst = bike.records.slice(1).reduce((a, r) => a + (r.fuel_amount as number), 0);
    expect(model.validRecordCount).toBe(26);
    expect(model.efficiency.series).toHaveLength(25);
    // 平均燃費 = Σ区間距離 ÷ Σ給油量（初回の給油量は分母に入らない）
    expect(s.avgEfficiency).toBeCloseTo(sumDistance / sumFuelExceptFirst, 9);
    expect(s.avgEfficiency as number).toBeGreaterThan(30);
    expect(s.meanEfficiency as number).toBeGreaterThan(30);
    // 合計は全記録分
    expect(s.totalDistance).toBeCloseTo(sumDistance, 6);
    expect(s.totalFuel).toBeCloseTo(
      bike.records.reduce((a, r) => a + (r.fuel_amount as number), 0),
      6
    );
    expect(s.totalCost).toBe(bike.records.reduce((a, r) => a + (r.total_cost as number), 0));
    expect(s.totalCost).toBeGreaterThan(0);
    // 平均単価は 165〜185 円/L
    expect(s.avgPricePerUnit as number).toBeGreaterThanOrEqual(164.5);
    expect(s.avgPricePerUnit as number).toBeLessThanOrEqual(185.5);
    expect(s.costPerKm as number).toBeGreaterThan(0);
    for (const v of Object.values(s)) expect(v === null || finite(v)).toBe(true);

    // 月別の給油代: 3 月〜10 月の 8 か月で、合計が総額と一致
    expect(model.monthlyCost.map(m => m.key)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(model.monthlyCost.reduce((a, m) => a + m.cost, 0)).toBe(s.totalCost);
    const byMonth = new Map<string, number>();
    for (const r of bike.records) byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + (r.total_cost as number));
    for (const m of model.monthlyCost) expect(m.cost).toBe(byMonth.get(m.key));

    // ---- 履歴（月ごとのまとまり）----
    const groups = groupByMonth(asc.slice().reverse());
    expect(groups.map(g => g.key)).toEqual([...model.monthlyCost.map(m => m.key)].reverse());
    expect(groups.reduce((a, g) => a + g.count, 0)).toBe(26);
    for (const g of groups) expect(g.totalCost).toBe(byMonth.get(g.key));

    // ---- ホーム ----
    const desc = asc.slice().reverse();
    const hero = heroModelOf(desc, desc[0]);
    expect(hero.efficiency).toBe(expected[25].efficiency);
    expect(hero.delta).not.toBeNull();
    expect(hero.average).toBeCloseTo(s.avgEfficiency as number, 9);
    expect(finite(hero.scale.min) && finite(hero.scale.max) && hero.scale.max > hero.scale.min).toBe(true);
    const octoberRecords = bike.records.filter(r => r.date.startsWith("2026-10"));
    const month = monthSummaryOf(desc, TODAY);
    expect(month.monthKey).toBe("2026-10");
    expect(month.count).toBe(octoberRecords.length);
    expect(month.totalCost).toBe(octoberRecords.reduce((a, r) => a + (r.total_cost as number), 0));
    expect(month.totalFuel).toBeCloseTo(octoberRecords.reduce((a, r) => a + (r.fuel_amount as number), 0), 9);
  });

  it("クルマ（1 件だけ）: 燃費なし・クラッシュなし・統計は空の状態", async () => {
    const { stores } = await run();
    const carVehicle = stores.vehicles[1];
    const recs = screenRecords(stores.vehicles, stores.records, carVehicle.id);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ fuel_amount: 36.4, total_cost: 6370, total_distance: null, fuel_efficiency: null });
    // 別の車両（バイク）の記録は混ざらない
    expect(recs[0].vehicle_id).toBe(carVehicle.id);

    const model = buildStatsModel(recs, "all", TODAY);
    expect(model.efficiency.series).toEqual([]);
    expect(model.summary.avgEfficiency).toBeNull();
    expect(model.summary.meanEfficiency).toBeNull();
    expect(model.summary.costPerKm).toBeNull();
    expect(model.summary.totalCost).toBe(6370);
    expect(model.summary.totalFuel).toBe(36.4);
    expect(model.summary.totalDistance).toBe(0);
    expect(model.summary.avgPricePerUnit).toBeCloseTo(175, 0);
    expect(model.monthlyCost).toEqual([{ key: "2026-08", month: "2026/8月", cost: 6370 }]);

    const hero = heroModelOf(recs, recs[0]);
    expect(hero.efficiency).toBeNull();
    expect(hero.delta).toBeNull();
    expect(hero.average).toBeNull();
    expect(finite(hero.scale.min) && finite(hero.scale.max)).toBe(true);
    expect(monthSummaryOf(recs, TODAY)).toMatchObject({ count: 0, totalCost: null, totalFuel: 0 });
    expect(groupByMonth(recs).map(g => [g.key, g.count, g.totalCost])).toEqual([["2026-08", 1, 6370]]);
  });

  it("全車両をまとめて計算しても車両をまたいで連鎖しない（バイクの最古の記録は燃費なし、クルマも燃費なし）", async () => {
    const { stores } = await run();
    const all = applyFillChainByVehicle(
      stores.records,
      id => distanceModeOf(stores.vehicles.find(v => v.id === id)),
      stores.vehicles[0].id
    );
    expect(all.filter(r => finite(r.fuel_efficiency))).toHaveLength(25);
    expect(all.filter(r => r.vehicle_id === stores.vehicles[1].id).every(r => r.fuel_efficiency === null)).toBe(true);
  });
});

describe("既定車両がすでにある状態へ取り込み", () => {
  const bike = parse(BIKE_CSV);
  const existingDefault: Vehicle = {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    user_id: "user_123",
    name: "マイカー",
    type: "car",
    distance_mode: "trip",
    created_at: "2026-01-01T00:00:00.000Z",
  };

  it("別名の車両は新規作成（odometer 方式）され、既定車両の記録・未分類には混ざらない", async () => {
    const own: FuelRecord = normalizeRecord({
      id: "own-1",
      date: "2026-02-01",
      total_distance: 400,
      fuel_amount: 25,
      gas_station: null,
      price_per_unit: 170,
      total_cost: 4250,
      fuel_efficiency: 16,
      vehicle_id: null, // 既定車両に表示される未分類の既存記録
    });
    const stores = memoryStores([existingDefault], [own]);
    const result = await executeRestore(backupOf(bike), stores.deps());
    expect(result).toMatchObject({ vehiclesAdded: 1, recordsAdded: 26, skipped: 0 });
    expect(stores.vehicles).toHaveLength(2);
    const imported = stores.vehicles[1];
    expect(imported).toMatchObject({ name: "Ninja 250", type: "bike", distance_mode: "odometer" });

    // 既定車両: 既存の未分類 1 件だけ（インポートの 26 件は混ざらない）。トリップ入力の値がそのまま
    const defaultScreen = screenRecords(stores.vehicles, stores.records, existingDefault.id);
    expect(defaultScreen.map(r => r.id)).toEqual(["own-1"]);
    expect(defaultScreen[0]).toMatchObject({ total_distance: 400, fuel_efficiency: 16 });

    // 取り込んだ車両: 26 件、未分類は入らない
    const importedScreen = screenRecords(stores.vehicles, stores.records, imported.id);
    expect(importedScreen).toHaveLength(26);
    expect(importedScreen.every(r => r.vehicle_id === imported.id && !isUnclassifiedRecord(r))).toBe(true);
    expect(importedScreen.filter(r => finite(r.fuel_efficiency))).toHaveLength(25);
    const asc = [...importedScreen].reverse();
    const expected = expectedChain(bike);
    asc.forEach((r, i) => expect(r.fuel_efficiency).toBe(expected[i].efficiency));
  });

  it("Fuelio の車両名を既定車両と同じ名前・種別にすると既存車両へ追加される（既存の方式のまま）", async () => {
    const stores = memoryStores([{ ...existingDefault, name: "Ninja 250", type: "bike" }]);
    const result = await executeRestore(backupOf(bike), stores.deps());
    expect(result).toMatchObject({ vehiclesAdded: 0, recordsAdded: 26 });
    // 既存車両は trip 方式のまま。UI（ImportPanel）が「オドメーター入力方式に切り替える」案内を出す前提の挙動
    const screen = screenRecords(stores.vehicles, stores.records, existingDefault.id);
    expect(screen).toHaveLength(26);
    expect(screen.every(r => r.fuel_efficiency === null)).toBe(true);
    // 方式を odometer に切り替えると、保存データはそのままで燃費が出る
    const switched = applyFillChain(stores.records, { distance_mode: "odometer" });
    expect(switched.filter(r => finite(r.fuel_efficiency))).toHaveLength(25);
  });
});

describe("円の丸め", () => {
  it("Fuelio の Price が小数でも整数円で取り込む（単価は丸めた金額から導出）", () => {
    const csv = [
      '"## Vehicle"',
      '"Name","Tank1Capacity"',
      '"Frac","14"',
      '"## Log"',
      '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","UniqueId"',
      '"2026-05-01","1000","6.5","1","1117.23","a"',
      '"2026-05-10","1250","6.5","1","1117.5","b"',
    ].join("\n");
    const parsed = parse(csv);
    expect(parsed.records.map(r => r.total_cost)).toEqual([1117, 1118]);
    expect(parsed.records[0].price_per_unit).toBe(calculateFuelMetrics(null, 6.5, 1117).price_per_unit);
  });

  it("金額の表示は整数円（保存済みの小数も ¥1,117 と出す）", () => {
    expect(formatHistoryYen(1117.23)).toBe("¥1,117");
    expect(formatHistoryYen(1117.5)).toBe("¥1,118");
    expect(formatHistoryYen(null)).toBeNull();
    expect(formatHomeYen(1117.23)).toBe("¥1,117");
    expect(formatHomeYen(1117.5)).toBe("¥1,118");
  });
});
