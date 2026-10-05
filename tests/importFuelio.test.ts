import { describe, expect, it } from "vitest";

import { finalizeRestoreRecords, parseBackup, planRestore } from "@/lib/backup";
import { calculateFuelMetrics } from "@/lib/calculations";
import { buildRecordsCsv } from "@/lib/csv";
import {
  fuelioToBackup,
  guessFuelioVehicleType,
  isFuelioCsv,
  parseCsvRows,
  parseFlexibleDate,
  parseFuelioCsv,
  type ParsedFuelio,
} from "@/lib/importers/fuelio";
import {
  detectFuelLensCsv,
  fuelLensCsvToBackup,
  parseFuelLensCsv,
  type ParsedFuelLensCsv,
} from "@/lib/importers/fuellensCsv";
import type { FuelRecord } from "@/lib/useFuelRecords";
import type { Vehicle } from "@/lib/useVehicles";

// ------------------------------------------------------------------
// 合成データ（実データは使わない）
// ------------------------------------------------------------------

const VEHICLE_HEADER =
  '"Name","Description","DistUnit","FuelUnit","ConsumptionUnit","ImportCSVDateFormat","VIN","Insurance","Plate","Make","Model","Year","TankCount","Tank1Type","Tank2Type","Active","Tank1Capacity","Tank2Capacity","FuelUnitTank2","FuelConsumptionTank2","guid","lastupdated"';
const LOG_HEADER =
  '"Data","Odo (km)","Fuel (litres)","Full","Price (optional)","km/l (optional)","latitude (optional)","longitude (optional)","City (optional)","Notes (optional)","Missed","TankNumber","FuelType","VolumePrice","StationID (optional)","ExcludeDistance","UniqueId","TankCalc","Weather","guid","lastupdated"';

type LogRow = {
  date: string;
  odo: string;
  fuel: string;
  full?: string;
  price?: string;
  city?: string;
  notes?: string;
  missed?: string;
  volumePrice?: string;
  uniqueId?: string;
};

const q = (v: string) => `"${v.replace(/"/g, '""')}"`;

function vehicleRow(opts: { name?: string; dateFormat?: string; model?: string; capacity?: string } = {}): string {
  const values = [
    opts.name ?? "Test Car",
    "",
    "0",
    "0",
    "3",
    opts.dateFormat ?? "yyyy-MM-dd",
    "",
    "",
    "",
    "",
    opts.model ?? "",
    "",
    "0",
    "1",
    "0",
    "0.0",
    opts.capacity ?? "0",
    "0",
    "0",
    "0",
    "guid-vehicle",
    "0",
  ];
  return values.map(q).join(",");
}

function logRow(r: LogRow): string {
  const values = [
    r.date,
    r.odo,
    r.fuel,
    r.full ?? "1",
    r.price ?? "",
    "",
    "0.0",
    "0.0",
    r.city ?? "",
    r.notes ?? "",
    r.missed ?? "0",
    "1",
    "100",
    r.volumePrice ?? "",
    "0",
    "0.0",
    r.uniqueId ?? "",
    "0.0",
    "0",
    "guid-row",
    "0",
  ];
  return values.map(q).join(",");
}

function fuelioCsv(rows: LogRow[], vehicle: Parameters<typeof vehicleRow>[0] = {}, eol = "\n"): string {
  return [
    '"## Vehicle"',
    VEHICLE_HEADER,
    vehicleRow(vehicle),
    "",
    '"## Log"',
    LOG_HEADER,
    ...rows.map(logRow),
    '"## CostCategories"',
    '"CostTypeID","Name","priority","color","guid","lastupdated"',
    '"1","Service","0","0","g","0"',
    '"## Costs"',
    '"CostTitle","Date","Odo","CostTypeID","Notes","Cost"',
    '"Oil","2024-01-01","1000","1","","3000"',
    "",
  ].join(eol);
}

function parseOk(text: string): ParsedFuelio {
  const result = parseFuelioCsv(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const BASIC_ROWS: LogRow[] = [
  { date: "2024-01-10", odo: "1000.0", fuel: "20.00", price: "3400", uniqueId: "1" },
  { date: "2024-02-01", odo: "1300.5", fuel: "15.50", price: "2635", uniqueId: "2", city: "Shibuya" },
  { date: "2024-03-01", odo: "1600.0", fuel: "18.00", price: "3060", uniqueId: "3" },
];

const vehicle = (id: string, name: string, type: "car" | "bike" = "car"): Vehicle => ({
  id,
  user_id: "user_123",
  name,
  type,
});

/** 計画どおりに追加された状態（既存車両 + 既存記録）を作る */
function applyPlan(
  backupText: string,
  existingVehicles: Vehicle[],
  existingRecords: FuelRecord[]
): { vehicles: Vehicle[]; records: FuelRecord[] } {
  const parsed = parseBackup(backupText);
  if (!parsed.ok) throw new Error(parsed.error);
  const plan = planRestore(parsed.backup, existingVehicles, existingRecords);
  const created = plan.vehiclesToCreate.map((v, i) => vehicle(`new-${i}`, v.name, v.type));
  const createdIdMap: Record<string, string> = {};
  plan.vehiclesToCreate.forEach((v, i) => (createdIdMap[v.backupId] = created[i].id));
  const added = finalizeRestoreRecords(plan, createdIdMap).map((r, i) => ({ ...r, id: `restored-${i}` }));
  return { vehicles: [...existingVehicles, ...created], records: [...existingRecords, ...added] };
}

// ------------------------------------------------------------------
// CSV の基本
// ------------------------------------------------------------------

describe("parseCsvRows", () => {
  it("クォート内のカンマ・改行・エスケープした引用符と CRLF を扱う", () => {
    const rows = parseCsvRows('﻿a,"b,c","d ""e""",\r\n"x\ny",2\r\n');
    expect(rows).toEqual([
      ["a", "b,c", 'd "e"', ""],
      ["x\ny", "2"],
    ]);
  });

  it("最終行に改行が無くても読める", () => {
    expect(parseCsvRows("1,2\n3,4")).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("parseFlexibleDate", () => {
  it("yyyy-MM-dd（時刻付きも）を読む", () => {
    expect(parseFlexibleDate("2024-12-01")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("2024-12-01 08:05")).toEqual({ date: "2024-12-01", sortKey: "2024-12-01 08:05:00" });
    expect(parseFlexibleDate("2024/3/9")?.date).toBe("2024-03-09");
  });

  it("dd.MM.yyyy と MM/dd/yyyy・dd/MM/yyyy を読む", () => {
    expect(parseFlexibleDate("01.12.2024")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("12/01/2024")?.date).toBe("2024-12-01");
    expect(parseFlexibleDate("12/01/2024", "dd/MM/yyyy")?.date).toBe("2024-01-12");
    // 片方が 12 を超えればヒントより優先
    expect(parseFlexibleDate("25/12/2024")?.date).toBe("2024-12-25");
  });

  it("存在しない日付や形式外は null", () => {
    expect(parseFlexibleDate("2024-02-30")).toBeNull();
    expect(parseFlexibleDate("yesterday")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
});

// ------------------------------------------------------------------
// Fuelio
// ------------------------------------------------------------------

describe("parseFuelioCsv", () => {
  it("Fuelio の CSV を判定し、ヘッダー名で列を読む", () => {
    const text = fuelioCsv(BASIC_ROWS);
    expect(isFuelioCsv(text)).toBe(true);
    expect(isFuelioCsv("車両,日付\n")).toBe(false);

    const parsed = parseOk(text);
    expect(parsed.vehicleName).toBe("Test Car");
    expect(parsed.vehicleType).toBe("car");
    expect(parsed.stats).toEqual({ rows: 3, partial: 0, missed: 0, skippedInvalid: 0 });
    expect(parsed.records.map(r => r.date)).toEqual(["2024-01-10", "2024-02-01", "2024-03-01"]);
    expect(parsed.records[1]).toMatchObject({
      fuel_amount: 15.5,
      total_cost: 2635,
      gas_station: "Shibuya",
      price_per_unit: calculateFuelMetrics(null, 15.5, 2635).price_per_unit,
    });
  });

  it("列の順番が違っても読める（ヘッダー名で探す）", () => {
    const text = [
      '"## Vehicle"',
      '"Name","Tank1Capacity"',
      '"Reordered","45"',
      '"## Log"',
      '"UniqueId","Fuel (litres)","Price (optional)","Full","Odo (km)","Data","Missed"',
      '"7","10","1500","1","500","2024-05-01","0"',
      '"8","20","3000","1","800","2024-05-20","0"',
    ].join("\r\n");
    const parsed = parseOk(text);
    expect(parsed.records.map(r => [r.date, r.fuel_amount, r.total_cost, r.total_distance])).toEqual([
      ["2024-05-01", 10, 1500, null],
      ["2024-05-20", 20, 3000, 300],
    ]);
  });

  it("クォート内のカンマを含む店舗名・CRLF を扱う", () => {
    const parsed = parseOk(fuelioCsv([{ ...BASIC_ROWS[0], city: 'ENEOS, "Shibuya"' }], {}, "\r\n"));
    expect(parsed.records[0].gas_station).toBe('ENEOS, "Shibuya"');
  });

  it("日付 → 積算距離の順に並べ替えてから区間距離（トリップ）を求める", () => {
    // ファイル内の順序はばらばら。同じ日付の 2 件は積算距離で並ぶ
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-03-01", odo: "1600", fuel: "18", price: "3060", uniqueId: "3" },
        { date: "2024-01-10", odo: "1000", fuel: "20", price: "3400", uniqueId: "1" },
        { date: "2024-02-01", odo: "1450.4", fuel: "5", price: "850", uniqueId: "2b" },
        { date: "2024-02-01", odo: "1300.5", fuel: "15.5", price: "2635", uniqueId: "2a" },
      ])
    );
    expect(parsed.records.map(r => [r.date, r.odometer, r.total_distance])).toEqual([
      ["2024-01-10", 1000, null],
      ["2024-02-01", 1300.5, 300.5],
      ["2024-02-01", 1450.4, 149.9],
      ["2024-03-01", 1600, 149.6],
    ]);
    expect(parsed.records[1].fuel_efficiency).toBe(calculateFuelMetrics(300.5, 15.5, null).fuel_efficiency);
    expect(parsed.records[0].fuel_efficiency).toBeNull();
  });

  it("積算距離の浮動小数点の誤差は 0.1km に丸める", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-01-01", odo: "1000.1", fuel: "10", price: "1700" },
        { date: "2024-01-15", odo: "1200.300000000001", fuel: "10", price: "1700" },
      ])
    );
    expect(parsed.records[1].total_distance).toBe(200.2);
  });

  it("Missed=1 の行は区間距離・燃費が null", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-01-01", odo: "1000", fuel: "20", price: "3400" },
        { date: "2024-02-01", odo: "1800", fuel: "20", price: "3400", missed: "1" },
        { date: "2024-03-01", odo: "2100", fuel: "15", price: "2550" },
      ])
    );
    expect(parsed.stats.missed).toBe(1);
    expect(parsed.records[1]).toMatchObject({ missed: true, total_distance: null, fuel_efficiency: null });
    // 次の行は記録漏れの行からの差分で計算できる
    expect(parsed.records[2]).toMatchObject({ total_distance: 300, fuel_efficiency: 20 });
  });

  it("部分給油（Full=0）は取り込むが燃費は null。次の満タンで前回の満タン以降をまとめて計算する", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-01-01", odo: "1000", fuel: "30", price: "5100" },
        { date: "2024-01-10", odo: "1200", fuel: "10", price: "1700", full: "0" },
        { date: "2024-01-20", odo: "1500", fuel: "20", price: "3400" },
      ])
    );
    expect(parsed.stats.partial).toBe(1);
    expect(parsed.records[1]).toMatchObject({ full: false, total_distance: 200, fuel_efficiency: null });
    // (200 + 300) km ÷ (10 + 20) L
    expect(parsed.records[2]).toMatchObject({
      full: true,
      total_distance: 300,
      fuel_efficiency: calculateFuelMetrics(500, 30, null).fuel_efficiency,
    });
  });

  it("先頭の満タン給油より前の部分給油からは燃費を計算しない", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-01-01", odo: "1000", fuel: "10", price: "1700", full: "0" },
        { date: "2024-01-10", odo: "1200", fuel: "20", price: "3400" },
        { date: "2024-01-20", odo: "1500", fuel: "20", price: "3400" },
      ])
    );
    expect(parsed.records.map(r => r.fuel_efficiency)).toEqual([null, null, 15]);
  });

  it("Price が空なら VolumePrice × 給油量で支払総額を補う", () => {
    const parsed = parseOk(fuelioCsv([{ date: "2024-01-01", odo: "1000", fuel: "10", volumePrice: "171.5" }]));
    expect(parsed.records[0].total_cost).toBe(1715);
    expect(parsed.records[0].price_per_unit).toBe(calculateFuelMetrics(null, 10, 1715).price_per_unit);
  });

  it("店舗名は City → Notes の順。日付だけのメモは使わない", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "2024-01-01", odo: "1000", fuel: "10", price: "1700", city: "Tokyo", notes: "Station A" },
        { date: "2024-01-02", odo: "1100", fuel: "10", price: "1700", notes: "Station B" },
        { date: "2024-01-03", odo: "1200", fuel: "10", price: "1700", notes: "2024/1/3" },
      ])
    );
    expect(parsed.records.map(r => r.gas_station)).toEqual(["Tokyo", "Station B", null]);
  });

  it("日付が読めない行・給油量も金額も無い行は読み飛ばす", () => {
    const parsed = parseOk(
      fuelioCsv([
        { date: "not a date", odo: "1000", fuel: "10", price: "1700" },
        { date: "2024-01-02", odo: "1100", fuel: "", price: "" },
        { date: "2024-01-03", odo: "1200", fuel: "10", price: "1700" },
      ])
    );
    expect(parsed.stats).toEqual({ rows: 1, partial: 0, missed: 0, skippedInvalid: 2 });
  });

  it("ImportCSVDateFormat のヒントで日付を解釈する", () => {
    const parsed = parseOk(
      fuelioCsv(
        [
          { date: "02/03/2024", odo: "1000", fuel: "10", price: "1700" },
          { date: "31.03.2024", odo: "1100", fuel: "10", price: "1700" },
        ],
        { dateFormat: "dd/MM/yyyy" }
      )
    );
    expect(parsed.records.map(r => r.date)).toEqual(["2024-03-02", "2024-03-31"]);
  });

  it("Fuelio 以外・必要な列が無い・マイル単位はエラー", () => {
    expect(parseFuelioCsv("").ok).toBe(false);
    expect(parseFuelioCsv("a,b\n1,2").ok).toBe(false);
    expect(parseFuelioCsv('"## Vehicle"\n"Name"\n"x"\n"## Log"\n"Odo (km)"\n"100"').ok).toBe(false);
    const miles = fuelioCsv(BASIC_ROWS).replace('"Odo (km)"', '"Odo (mi)"');
    expect(parseFuelioCsv(miles).ok).toBe(false);
  });

  it("同じ入力からは同じ ID。UniqueId が無い行はハッシュ、重複は連番で一意にする", () => {
    const rows: LogRow[] = [
      { date: "2024-01-01", odo: "1000", fuel: "10", price: "1700", uniqueId: "5" },
      { date: "2024-01-02", odo: "1100", fuel: "10", price: "1700" },
      { date: "2024-01-03", odo: "1200", fuel: "10", price: "1700", uniqueId: "5" },
    ];
    const a = parseOk(fuelioCsv(rows));
    const b = parseOk(fuelioCsv(rows, {}, "\r\n"));
    expect(a.records.map(r => r.id)).toEqual(b.records.map(r => r.id));
    expect(new Set(a.records.map(r => r.id)).size).toBe(3);
    expect(a.records[0].id).toBe(`fuelio-${a.vehicleKey}-5`);
    expect(a.records[1].id).toMatch(new RegExp(`^fuelio-${a.vehicleKey}-h[0-9a-f]{8}$`));
    expect(a.records[2].id).toBe(`fuelio-${a.vehicleKey}-5-2`);
    // 車両名が違えば（別の車両の書き出しなら）UniqueId が同じでも ID は別
    const other = parseOk(fuelioCsv(rows, { name: "Other" }));
    expect(other.records[0].id).not.toBe(a.records[0].id);
  });
});

describe("guessFuelioVehicleType", () => {
  it("タンク容量で判定し、不明なら車種名のヒントで判定する", () => {
    expect(guessFuelioVehicleType({ tankCapacity: 12 })).toBe("bike");
    expect(guessFuelioVehicleType({ tankCapacity: 45, model: "CB400" })).toBe("car");
    expect(guessFuelioVehicleType({ tankCapacity: 0, model: "CBR600RR" })).toBe("bike");
    expect(guessFuelioVehicleType({ tankCapacity: 0, make: "Kawasaki" })).toBe("bike");
    expect(guessFuelioVehicleType({ tankCapacity: null, name: "スーパーカブ" })).toBe("bike");
    expect(guessFuelioVehicleType({ tankCapacity: 0, make: "Honda", model: "Civic" })).toBe("car");
    expect(guessFuelioVehicleType({ tankCapacity: null })).toBe("car");
  });

  it("parseFuelioCsv に反映される", () => {
    expect(parseOk(fuelioCsv(BASIC_ROWS, { capacity: "8.5" })).vehicleType).toBe("bike");
  });
});

describe("fuelioToBackup", () => {
  const NOW = new Date("2026-10-05T00:00:00.000Z");

  it("parseBackup を通るバックアップ（車両 1 台）になる", () => {
    const parsed = parseOk(fuelioCsv(BASIC_ROWS));
    const backup = fuelioToBackup(parsed, { now: NOW });
    const result = parseBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.vehicles).toEqual([{ id: `fuelio-${parsed.vehicleKey}`, name: "Test Car", type: "car" }]);
    expect(result.backup.records).toHaveLength(3);
    expect(result.backup.records.every(r => r.vehicle_id === `fuelio-${parsed.vehicleKey}`)).toBe(true);
    expect(result.backup.exportedAt).toBe(NOW.toISOString());
  });

  it("車両名・種別を上書きできる（ID は変わらない）", () => {
    const parsed = parseOk(fuelioCsv(BASIC_ROWS));
    const a = fuelioToBackup(parsed, { now: NOW });
    const b = fuelioToBackup(parsed, { vehicleName: "  マイカー  ", vehicleType: "bike", now: NOW });
    expect(b.vehicles[0]).toMatchObject({ id: a.vehicles[0].id, name: "マイカー", type: "bike" });
    expect(b.records.map(r => r.id)).toEqual(a.records.map(r => r.id));
  });

  it("同じファイルを 2 回取り込んでも 2 回目は何も追加されない（planRestore の重複判定）", () => {
    const text = JSON.stringify(fuelioToBackup(parseOk(fuelioCsv(BASIC_ROWS)), { now: NOW }));
    const existingVehicles = [vehicle("v-default", "既定の車両")];

    const first = applyPlan(text, existingVehicles, []);
    expect(first.vehicles).toHaveLength(2);
    expect(first.records).toHaveLength(3);

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error(parsed.error);
    const second = planRestore(parsed.backup, first.vehicles, first.records);
    expect(second.counts).toEqual({ vehiclesNew: 0, vehiclesMatched: 1, recordsNew: 0, recordsSkipped: 3 });
  });

  it("名前と種別が一致する既存の車両に追加される", () => {
    const parsed = parseOk(fuelioCsv(BASIC_ROWS));
    const backup = fuelioToBackup(parsed, { vehicleName: "マイカー", vehicleType: "car", now: NOW });
    const plan = planRestore(backup, [vehicle("v1", "既定"), vehicle("v2", "マイカー")], []);
    expect(plan.counts).toMatchObject({ vehiclesNew: 0, vehiclesMatched: 1, recordsNew: 3 });
    expect(finalizeRestoreRecords(plan, {}).every(r => r.vehicle_id === "v2")).toBe(true);
  });
});

// ------------------------------------------------------------------
// FuelLens CSV
// ------------------------------------------------------------------

function parseLensOk(text: string): ParsedFuelLensCsv {
  const result = parseFuelLensCsv(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

const record = (over: Partial<FuelRecord> & Pick<FuelRecord, "id" | "date">): FuelRecord => ({
  total_distance: null,
  fuel_amount: null,
  gas_station: null,
  price_per_unit: null,
  total_cost: null,
  fuel_efficiency: null,
  vehicle_id: null,
  created_at: null,
  ...over,
});

describe("FuelLens CSV", () => {
  const vehicles = [vehicle("v-car", "マイカー", "car"), vehicle("v-bike", "カブ", "bike")];
  const records: FuelRecord[] = [
    record({
      id: "r1",
      date: "2024-01-10",
      vehicle_id: "v-car",
      fuel_amount: 30.25,
      total_cost: 5143,
      price_per_unit: 170,
      total_distance: 420.5,
      fuel_efficiency: 13.9,
      gas_station: "ENEOS, 渋谷",
    }),
    record({
      id: "r2",
      date: "2024-01-12",
      vehicle_id: "v-bike",
      fuel_amount: 3.2,
      total_cost: 550,
      price_per_unit: 171.9,
      total_distance: 180,
      fuel_efficiency: 56.25,
      gas_station: "=HYPERLINK(\"x\")",
    }),
    record({ id: "r3", date: "2024-02-01", vehicle_id: "v-car", fuel_amount: 25, total_cost: 4250 }),
  ];
  const csv = buildRecordsCsv(records, new Map(vehicles.map(v => [v.id, v])));

  it("全車両 CSV を判定して読み込む（数式対策の ' を外す）", () => {
    expect(detectFuelLensCsv(csv)).toBe("all");
    expect(isFuelioCsv(csv)).toBe(false);
    const parsed = parseLensOk(csv);
    expect(parsed.format).toBe("all");
    expect(parsed.vehicleNames).toEqual(["マイカー", "カブ"]);
    expect(parsed.records[0]).toMatchObject({
      vehicleName: "マイカー",
      date: "2024-01-10",
      fuel_amount: 30.25,
      total_cost: 5143,
      price_per_unit: 170,
      total_distance: 420.5,
      fuel_efficiency: 13.9,
      gas_station: "ENEOS, 渋谷",
    });
    expect(parsed.records[1].gas_station).toBe('=HYPERLINK("x")');
    // 欠けた単価は計算で補う
    expect(parsed.records[2].price_per_unit).toBe(calculateFuelMetrics(null, 25, 4250).price_per_unit);
  });

  it("往復: buildRecordsCsv → 読み込み → バックアップ → 復元計画で元の記録と重複になる", () => {
    const parsed = parseLensOk(csv);
    const backup = fuelLensCsvToBackup(parsed, {
      typeByName: name => vehicles.find(v => v.name === name)?.type,
      now: new Date("2026-10-05T00:00:00.000Z"),
    });
    const result = parseBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.vehicles.map(v => [v.name, v.type])).toEqual([
      ["マイカー", "car"],
      ["カブ", "bike"],
    ]);
    const plan = planRestore(result.backup, vehicles, records);
    expect(plan.counts).toEqual({ vehiclesNew: 0, vehiclesMatched: 2, recordsNew: 0, recordsSkipped: 3 });

    // 空のデータへ取り込めば全件追加され、値は元と同じ
    const fresh = planRestore(result.backup, [vehicle("v0", "既定")], []);
    expect(fresh.counts).toMatchObject({ vehiclesNew: 2, recordsNew: 3 });
    const strip = (r: Partial<FuelRecord>) => ({
      date: r.date,
      fuel_amount: r.fuel_amount,
      total_cost: r.total_cost,
      total_distance: r.total_distance,
      fuel_efficiency: r.fuel_efficiency,
      gas_station: r.gas_station,
    });
    expect(fresh.records.map(strip)).toEqual(records.map(strip));
  });

  it("種別が分からない車両は car。ID は決定的", () => {
    const a = fuelLensCsvToBackup(parseLensOk(csv));
    const b = fuelLensCsvToBackup(parseLensOk(csv.replace(/\n/g, "\r\n")));
    expect(a.vehicles.every(v => v.type === "car")).toBe(true);
    expect(a.records.map(r => r.id)).toEqual(b.records.map(r => r.id));
    expect(a.vehicles.map(v => v.id)).toEqual(b.vehicles.map(v => v.id));
  });

  it("履歴画面の車両別 CSV も読み込める（車両名・種別は指定）", () => {
    const text =
      "﻿給油日,走行距離(km),給油量(L),単価(円/L),支払総額(円),燃費(km/L),ガソリンスタンド名\n" +
      '"2024/3/1",300,20,170,3400,15,"Shell"\n' +
      '"bad",1,1,1,1,1,""\n';
    expect(detectFuelLensCsv(text)).toBe("vehicle");
    const parsed = parseLensOk(text);
    expect(parsed.format).toBe("vehicle");
    expect(parsed.stats).toEqual({ rows: 1, skippedInvalid: 1 });
    const backup = fuelLensCsvToBackup(parsed, { vehicleName: "カブ", vehicleType: "bike" });
    expect(backup.vehicles).toEqual([expect.objectContaining({ name: "カブ", type: "bike" })]);
    expect(backup.records[0]).toMatchObject({ date: "2024-03-01", total_distance: 300, gas_station: "Shell" });
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(true);
  });

  it("FuelLens の CSV でなければエラー", () => {
    expect(detectFuelLensCsv("a,b,c\n1,2,3")).toBeNull();
    expect(parseFuelLensCsv("a,b,c\n1,2,3").ok).toBe(false);
    expect(parseFuelLensCsv("").ok).toBe(false);
  });
});
