import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { parseBackup, planRestore } from "@/lib/backup";
import { applyFillChain } from "@/lib/fillChain";
import { decodeCsvBytes } from "@/lib/importers/csvParse";
import {
  EMPTY_GENERIC_CSV_MAPPING,
  genericCsvMappingError,
  genericCsvToBackup,
  guessGenericCsvMapping,
  parseFullTankFlag,
  parseGenericCsv,
  parseGenericDate,
  parseGenericNumber,
  readGenericCsvTable,
  type GenericCsvMapping,
  type GenericCsvTable,
} from "@/lib/importers/genericCsv";
import { isFuelioCsv } from "@/lib/importers/fuelio";
import { detectFuelLensCsv } from "@/lib/importers/fuellensCsv";
import type { FuelRecord } from "@/lib/types";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name));

function table(text: string): GenericCsvTable {
  const t = readGenericCsvTable(text);
  if (!t.ok) throw new Error(t.error);
  return t;
}

describe("decodeCsvBytes", () => {
  it("UTF-8（BOM 付き）はそのまま読み、BOM を除く", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("日付,給油量\n")]);
    expect(decodeCsvBytes(bytes)).toBe("日付,給油量\n");
  });

  it("Shift_JIS（日本語版 Excel の「CSV (コンマ区切り)」）を読める", () => {
    // 「日付,数量」の Shift_JIS
    const bytes = new Uint8Array([0x93, 0xfa, 0x95, 0x74, 0x2c, 0x90, 0x94, 0x97, 0xca]);
    expect(decodeCsvBytes(bytes)).toBe("日付,数量");
    expect(decodeCsvBytes(bytes.buffer)).toBe("日付,数量");
  });

  it("Shift_JIS のサンプル CSV を読み、列名を推測できる", () => {
    const text = decodeCsvBytes(fixture("generic-excel-sjis.csv"));
    expect(text.startsWith("日付,走行距離(km),給油量(L)")).toBe(true);
    expect(isFuelioCsv(text)).toBe(false);
    expect(detectFuelLensCsv(text)).toBeNull();
  });
});

describe("guessGenericCsvMapping", () => {
  it("日本語の列名（全角を含む）から推測し、燃費の列は使わない", () => {
    const m = guessGenericCsvMapping(["給油日", "区間距離（ｋｍ）", "給油量（Ｌ）", "合計金額", "単価", "満タン", "給油所", "備考", "燃費"]);
    expect(m).toEqual({
      date: 0,
      distance: 1,
      distanceKind: "trip",
      fuel: 2,
      totalCost: 3,
      pricePerUnit: 4,
      isFull: 5,
      station: 6,
      memo: 7,
    });
  });

  it("英語の列名（Drivvo 風）では Odometer をオドメーターとして選び、燃料の種類の列を給油量にしない", () => {
    const m = guessGenericCsvMapping(["Odometer", "Date", "Fuel", "Price/L", "Total cost", "Liters", "Full tank", "Gas station", "Notes"]);
    expect(m).toEqual({
      date: 1,
      distance: 0,
      distanceKind: "odometer",
      fuel: 5,
      totalCost: 4,
      pricePerUnit: 3,
      isFull: 6,
      station: 7,
      memo: 8,
    });
  });

  it("積算距離と区間距離の両方があれば区間距離を選ぶ。総走行距離・ODO はオドメーター", () => {
    expect(guessGenericCsvMapping(["日付", "積算距離", "トリップ", "数量"])).toMatchObject({ distance: 2, distanceKind: "trip", fuel: 3 });
    expect(guessGenericCsvMapping(["日付", "総走行距離", "リットル"])).toMatchObject({ distance: 1, distanceKind: "odometer", fuel: 2 });
    expect(guessGenericCsvMapping(["Date", "ODO", "Volume"])).toMatchObject({ distance: 1, distanceKind: "odometer" });
  });

  it("走行距離・Distance は区間距離、Fuel だけなら給油量", () => {
    expect(guessGenericCsvMapping(["Date", "Distance", "Fuel", "Cost"])).toMatchObject({
      distance: 1,
      distanceKind: "trip",
      fuel: 2,
      totalCost: 3,
    });
  });

  it("当てはまらない列は「使わない」（null）", () => {
    expect(guessGenericCsvMapping(["a", "b"])).toEqual(EMPTY_GENERIC_CSV_MAPPING);
  });
});

describe("parseGenericDate", () => {
  it.each([
    ["2026/1/5", "2026-01-05"],
    ["2026-01-05", "2026-01-05"],
    ["2026.1.5", "2026-01-05"],
    ["2026年1月5日", "2026-01-05"],
    ["２０２６／１／５", "2026-01-05"],
    ["2026/1/5 8:30", "2026-01-05"],
    ["2026-01-05T08:30:00", "2026-01-05"],
    ["2026/1/5(月)", "2026-01-05"],
    ["2026年1月5日 8時", "2026-01-05"],
    ["46027", "2026-01-05"],
    ["46027.5", "2026-01-05"],
    ["25569", "1970-01-01"],
  ])("%s → %s", (raw, expected) => {
    expect(parseGenericDate(raw)).toBe(expected);
  });

  it.each(["", "不明", "2026/2/30", "1/5/2026", "05.01.2026", "12345", "99999", "2026/13/1", "20260105"])("%s は読めない", raw => {
    expect(parseGenericDate(raw)).toBeNull();
  });
});

describe("parseGenericNumber", () => {
  it.each([
    ["30", 30],
    ["30.5L", 30.5],
    ["30.5ℓ", 30.5],
    ["5,100円", 5100],
    ["¥5,100", 5100],
    ["￥５，１００", 5100],
    ["４１２．３km", 412.3],
    [" 1 234 ", 1234],
    ["12,345.6", 12345.6],
    ["30リットル", 30],
  ])("%s → %d", (raw, expected) => {
    expect(parseGenericNumber(raw)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1e99", "30L+"])("%s は読めない", raw => {
    expect(parseGenericNumber(raw)).toBeNull();
  });
});

describe("parseFullTankFlag", () => {
  it.each(["はい", "○", "◯", "TRUE", "true", "1", "満タン", "Yes", "ｙｅｓ", "FULL"])("%s は満タン", raw => {
    expect(parseFullTankFlag(raw)).toBe(true);
  });
  it.each(["いいえ", "×", "FALSE", "0", "部分", "部分給油", "No", "Ｘ"])("%s は部分給油", raw => {
    expect(parseFullTankFlag(raw)).toBe(false);
  });
  it("空は null（満タン扱い）、読めない値は undefined", () => {
    expect(parseFullTankFlag("")).toBeNull();
    expect(parseFullTankFlag("たぶん")).toBeUndefined();
  });
});

describe("readGenericCsvTable", () => {
  it("最初の空でない行を列名にし、空行を除く", () => {
    const t = table("\n日付,給油量\n\n2026/1/1,30\n");
    expect(t.headers).toEqual(["日付", "給油量"]);
    expect(t.rows).toEqual([["2026/1/1", "30"]]);
    expect(t.lineNumbers).toEqual([4]);
  });

  it("空・データ行なし・1 列だけはエラー", () => {
    expect(readGenericCsvTable("").ok).toBe(false);
    expect(readGenericCsvTable("日付,給油量\n").ok).toBe(false);
    expect(readGenericCsvTable("日付\n2026/1/1\n").ok).toBe(false);
  });

  it("空の列名は「列 N」", () => {
    expect(table(",給油量\n1,2").headers).toEqual(["列 1", "給油量"]);
  });
});

describe("parseGenericCsv", () => {
  const base: GenericCsvMapping = { ...EMPTY_GENERIC_CSV_MAPPING, date: 0, distance: 1, fuel: 2 };

  it("必須の列（日付・給油量・距離）が選ばれていなければエラー", () => {
    expect(genericCsvMappingError(EMPTY_GENERIC_CSV_MAPPING)).toBe("日付・給油量・距離の列を選んでください。");
    const r = parseGenericCsv(table("a,b,c\n1,2,3"), { ...base, fuel: null });
    expect(r).toEqual({ ok: false, error: "給油量の列を選んでください。" });
  });

  it("Shift_JIS のサンプル（区間距離）を読み、読めない行は理由つきで読み飛ばす", () => {
    const t = table(decodeCsvBytes(fixture("generic-excel-sjis.csv")));
    const mapping = guessGenericCsvMapping(t.headers);
    expect(mapping.distanceKind).toBe("trip");
    const r = parseGenericCsv(t, mapping);
    if (!r.ok) throw new Error(r.error);
    expect(r.records).toHaveLength(5);
    expect(r.skipped).toEqual([{ line: 7, reason: "日付が読めません" }]);
    expect(r.stats).toEqual({ rows: 5, partial: 1, emptyDistance: 1 });
    expect(r.records[0]).toMatchObject({
      date: "2026-09-01",
      total_distance: null,
      odometer: null,
      fuel_amount: 32.5,
      total_cost: 5525,
      price_per_unit: 170,
      is_full: true,
      gas_station: "駅前SS",
      fuel_efficiency: null,
    });
    expect(r.records[2]).toMatchObject({ is_full: false, memo: "部分給油" });
    // 全角数字・「円」付きの行
    expect(r.records[4]).toMatchObject({ date: "2026-10-20", total_distance: 398, fuel_amount: 29.5, total_cost: 5163 });
  });

  it("Drivvo 風のサンプル（積算距離）は odometer に入れ、区間距離は入れない", () => {
    const t = table(decodeCsvBytes(fixture("generic-drivvo-like.csv")));
    const r = parseGenericCsv(t, guessGenericCsvMapping(t.headers));
    if (!r.ok) throw new Error(r.error);
    expect(r.distanceKind).toBe("odometer");
    expect(r.records).toHaveLength(5);
    expect(r.records[0]).toMatchObject({ date: "2026-08-03", odometer: 12034, total_distance: null, fuel_amount: 32.4, total_cost: 5573, price_per_unit: 172 });
    expect(r.records[2]).toMatchObject({ is_full: false, memo: "half tank" });
  });

  it("燃費は CSV の列ではなく applyFillChain で出る（オドメーターの差分・部分給油の合算）", () => {
    const t = table(decodeCsvBytes(fixture("generic-drivvo-like.csv")));
    const r = parseGenericCsv(t, guessGenericCsvMapping(t.headers));
    if (!r.ok) throw new Error(r.error);
    const backup = genericCsvToBackup(r, { vehicleName: "テスト車" });
    const chained = applyFillChain(backup.records, backup.vehicles[0]);
    expect(chained.map(c => c.total_distance)).toEqual([null, 422, 184, 250, 415]);
    expect(chained[1].fuel_efficiency).toBeCloseTo(422 / 30.27, 2);
    expect(chained[2].fuel_efficiency).toBeNull();
    // 部分給油（12L）と次の満タン（18.5L）で合算
    expect(chained[3].fuel_efficiency).toBeCloseTo((184 + 250) / (12 + 18.5), 2);
  });

  it("金額だけなら単価を計算し、単価だけなら金額は作らない", () => {
    const t = table("日付,距離,給油量,金額,単価\n2026/1/1,300,30,5100,\n2026/1/2,300,30,,171.5\n2026/1/3,300,30,,");
    const r = parseGenericCsv(t, { ...base, totalCost: 3, pricePerUnit: 4 });
    if (!r.ok) throw new Error(r.error);
    expect(r.records.map(x => [x.total_cost, x.price_per_unit])).toEqual([
      [5100, 170],
      [null, 171.5],
      [null, null],
    ]);
  });

  it("満タンの列が無ければ全件満タン。空のセルも満タン", () => {
    const t = table("日付,距離,給油量,満タン\n2026/1/1,300,30,\n2026/1/2,300,30,×");
    const noCol = parseGenericCsv(t, base);
    const withCol = parseGenericCsv(t, { ...base, isFull: 3 });
    if (!noCol.ok || !withCol.ok) throw new Error();
    expect(noCol.records.map(x => x.is_full)).toEqual([true, true]);
    expect(withCol.records.map(x => x.is_full)).toEqual([true, false]);
  });

  it("推測で埋めない: 給油量が空・0、距離・金額・単価・満タンの値が読めない行は読み飛ばす", () => {
    const t = table(
      [
        "日付,距離,給油量,金額,単価,満タン",
        "2026/1/1,300,,5100,,",
        "2026/1/2,300,0,5100,,",
        "2026/1/3,abc,30,5100,,",
        "2026/1/4,300,30,たくさん,,",
        "2026/1/5,300,30,5100,高い,",
        "2026/1/6,300,30,5100,,たぶん",
        "2026/1/7,300,30,5100,,はい",
      ].join("\n")
    );
    const r = parseGenericCsv(t, { ...base, totalCost: 3, pricePerUnit: 4, isFull: 5 });
    if (!r.ok) throw new Error(r.error);
    expect(r.records).toHaveLength(1);
    expect(r.skipped.map(s => s.reason)).toEqual([
      "給油量が読めません",
      "給油量が読めません",
      "距離が読めません",
      "金額が読めません",
      "単価が読めません",
      "満タンの値が読めません",
    ]);
    expect(r.skipped.map(s => s.line)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("同じ内容の行は ID が重ならず、同じファイルからは同じ ID になる", () => {
    const t = table("日付,距離,給油量\n2026/1/1,300,30\n2026/1/1,300,30");
    const a = parseGenericCsv(t, base);
    const b = parseGenericCsv(t, base);
    if (!a.ok || !b.ok) throw new Error();
    expect(new Set(a.records.map(x => x.id)).size).toBe(2);
    expect(a.records.map(x => x.id)).toEqual(b.records.map(x => x.id));
  });
});

describe("genericCsvToBackup", () => {
  it("車両 1 台（距離の入力方式 = 選んだ距離の意味）のバックアップになり、parseBackup・planRestore を通る", () => {
    const t = table("日付,積算距離,給油量\n2026/1/1,1000,30\n2026/1/15,1400,28");
    const r = parseGenericCsv(t, { ...EMPTY_GENERIC_CSV_MAPPING, date: 0, distance: 1, distanceKind: "odometer", fuel: 2 });
    if (!r.ok) throw new Error(r.error);
    const backup = genericCsvToBackup(r, { vehicleName: "  マイカー ", vehicleType: "bike", now: new Date("2026-11-01T00:00:00Z") });
    expect(backup.vehicles).toEqual([
      { id: expect.stringMatching(/^generic-csv-v-/), name: "マイカー", type: "bike", distance_mode: "odometer", default_fuel_type: null },
    ]);
    expect(backup.records.every(x => x.source === "import" && x.vehicle_id === backup.vehicles[0].id)).toBe(true);

    const reparsed = parseBackup(JSON.stringify(backup));
    expect(reparsed.ok).toBe(true);

    const existingVehicle = { id: "v1", name: "既定", type: "car" as const };
    const plan = planRestore(backup, [existingVehicle], []);
    expect(plan.counts).toEqual({ vehiclesNew: 1, vehiclesMatched: 0, recordsNew: 2, recordsSkipped: 0 });
    expect(plan.vehiclesToCreate[0].distance_mode).toBe("odometer");

    // 2 回目は重複としてスキップされる（追記のみ）
    const existing: FuelRecord[] = plan.records.map((d, i) => ({ ...d, id: `x${i}`, vehicle_id: "v2" }));
    const again = planRestore(backup, [existingVehicle, { id: "v2", name: "マイカー", type: "bike" }], existing);
    expect(again.counts).toMatchObject({ vehiclesNew: 0, vehiclesMatched: 1, recordsNew: 0, recordsSkipped: 2 });
  });

  it("車両名が空なら既定名", () => {
    const r = parseGenericCsv(table("日付,距離,給油量\n2026/1/1,300,30"), { ...EMPTY_GENERIC_CSV_MAPPING, date: 0, distance: 1, fuel: 2 });
    if (!r.ok) throw new Error(r.error);
    expect(genericCsvToBackup(r, { vehicleName: " " }).vehicles[0]).toMatchObject({ name: "インポートした車両", distance_mode: "trip" });
  });
});
