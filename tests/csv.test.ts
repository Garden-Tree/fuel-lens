import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  RECORDS_CSV_BASE_HEADERS,
  RECORDS_CSV_HEADERS,
  buildCsv,
  buildRecordsCsv,
  escapeCsvField,
  formatCsvNumber,
  formatRecordExtraCsvFields,
  toSafeFilenamePart,
} from "@/lib/csv";
import { parseCsvRows } from "@/lib/importers/fuelio";
import { parseFuelLensCsv } from "@/lib/importers/fuellensCsv";
import type { FuelRecord } from "@/lib/useFuelRecords";

const record = (overrides: Partial<FuelRecord> = {}): FuelRecord => ({
  id: "r1",
  date: "2026-01-15",
  total_distance: 512.3,
  fuel_amount: 30.12,
  gas_station: "ENEOS 渋谷店",
  price_per_unit: 172,
  total_cost: 5181,
  fuel_efficiency: 17.01,
  vehicle_id: "v1",
  ...overrides,
});

describe("escapeCsvField", () => {
  it("quotes plain values", () => {
    expect(escapeCsvField("ENEOS")).toBe('"ENEOS"');
    expect(escapeCsvField("2026-01-15")).toBe('"2026-01-15"');
  });

  it("returns an empty quoted field for null / undefined / empty", () => {
    expect(escapeCsvField(null)).toBe('""');
    expect(escapeCsvField(undefined)).toBe('""');
    expect(escapeCsvField("")).toBe('""');
  });

  it("doubles embedded quotes", () => {
    expect(escapeCsvField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("keeps commas and newlines inside the quoted field", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])("neutralizes formula-like value %j", value => {
    expect(escapeCsvField(value)).toBe(`"'${value}"`);
  });

  it("neutralizes and escapes quotes at the same time", () => {
    expect(escapeCsvField('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("does not prefix values that only contain those characters later", () => {
    expect(escapeCsvField("a=b")).toBe('"a=b"');
    expect(escapeCsvField("2026-01-15")).toBe('"2026-01-15"');
  });
});

describe("formatCsvNumber", () => {
  it("formats finite numbers and leaves null / non-finite empty", () => {
    expect(formatCsvNumber(12.5)).toBe("12.5");
    expect(formatCsvNumber(0)).toBe("0");
    expect(formatCsvNumber(null)).toBe("");
    expect(formatCsvNumber(undefined)).toBe("");
    expect(formatCsvNumber(Number.NaN)).toBe("");
    expect(formatCsvNumber(Number.POSITIVE_INFINITY)).toBe("");
  });
});

describe("buildCsv", () => {
  it("prefixes a BOM and joins with LF", () => {
    const csv = buildCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a,b\n1,2\n3,4");
  });

  it("encodes the BOM as EF BB BF in UTF-8", () => {
    const bytes = new TextEncoder().encode(buildCsv(["a"], []));
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe("buildRecordsCsv", () => {
  it("outputs the documented columns in order", () => {
    const csv = buildRecordsCsv([], new Map());
    expect(csv.slice(1)).toBe(RECORDS_CSV_HEADERS.join(","));
    expect(RECORDS_CSV_HEADERS).toEqual([
      "車両",
      "日付",
      "給油量(L)",
      "支払総額(円)",
      "単価(円/L)",
      "走行距離(km)",
      "燃費(km/L)",
      "店舗名",
      "オドメーター(km)",
      "満タン",
      "記録漏れ",
      "燃料種別",
      "メモ",
    ]);
    // 既存の列の並びは変えない（追加列は後ろ）
    expect(RECORDS_CSV_HEADERS.slice(0, RECORDS_CSV_BASE_HEADERS.length)).toEqual([...RECORDS_CSV_BASE_HEADERS]);
  });

  it("writes one row per record with the vehicle name", () => {
    const csv = buildRecordsCsv([record()], new Map([["v1", { name: "マイカー" }]]));
    const lines = csv.slice(1).split("\n");
    expect(lines).toHaveLength(2);
    // 新しい列が無い（古い）記録は既定値: オドメーターなし・満タン・記録漏れなし・燃料種別なし・メモなし
    expect(lines[1]).toBe(
      '"マイカー","2026-01-15",30.12,5181,172,512.3,17.01,"ENEOS 渋谷店",,"はい","いいえ","",""'
    );
  });

  it("leaves null numbers empty and uses the fallback name for unknown vehicles", () => {
    const csv = buildRecordsCsv(
      [
        record({
          vehicle_id: null,
          total_distance: null,
          fuel_amount: null,
          price_per_unit: null,
          total_cost: null,
          fuel_efficiency: null,
          gas_station: null,
        }),
      ],
      { v1: { name: "マイカー" } },
      "メインカー"
    );
    expect(csv.slice(1).split("\n")[1]).toBe('"メインカー","2026-01-15",,,,,,"",,"はい","いいえ","",""');
  });

  it("does not resolve prototype keys as vehicle names", () => {
    const csv = buildRecordsCsv([record({ vehicle_id: "constructor" })], {});
    expect(csv.slice(1).split("\n")[1].startsWith('"未分類",')).toBe(true);
  });

  it("escapes injection in vehicle and station names", () => {
    const csv = buildRecordsCsv(
      [record({ gas_station: "=cmd|' /C calc'!A0" })],
      new Map([["v1", { name: '@evil "car"' }]])
    );
    const row = csv.slice(1).split("\n")[1];
    expect(row.startsWith('"\'@evil ""car""",')).toBe(true);
    expect(row).toContain(',"\'=cmd|\' /C calc\'!A0",');
  });

  it("writes odometer, flags, fuel type label and memo", () => {
    const csv = buildRecordsCsv(
      [
        record({
          odometer: 12345.6,
          is_full: false,
          missed_previous: true,
          fuel_type: "premium",
          memo: "オイル交換\n空気圧 \"2.4\"",
        }),
      ],
      new Map([["v1", { name: "マイカー" }]])
    );
    const rows = parseCsvRows(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].slice(8)).toEqual(["12345.6", "いいえ", "はい", "ハイオク", 'オイル交換\n空気圧 "2.4"']);
  });

  it("formats the extra fields with defaults and escapes formula-like memos", () => {
    expect(formatRecordExtraCsvFields({})).toEqual(["", '"はい"', '"いいえ"', '""', '""']);
    expect(
      formatRecordExtraCsvFields({ odometer: null, is_full: true, missed_previous: false, fuel_type: null, memo: null })
    ).toEqual(["", '"はい"', '"いいえ"', '""', '""']);
    expect(formatRecordExtraCsvFields({ fuel_type: "diesel", memo: "=1+1" }).slice(3)).toEqual(['"軽油"', '"\'=1+1"']);
    // 不明な燃料種別は空欄
    expect(formatRecordExtraCsvFields({ fuel_type: "jet" as unknown as FuelRecord["fuel_type"] })[3]).toBe('""');
  });

  it("round-trips the new columns through the FuelLens CSV importer", () => {
    const records: FuelRecord[] = [
      record({ id: "a", odometer: 1000, is_full: true, missed_previous: false, fuel_type: "regular", memo: null }),
      record({
        id: "b",
        date: "2026-01-20",
        odometer: 1250.5,
        is_full: false,
        missed_previous: true,
        fuel_type: "diesel",
        memo: "-部分給油\r\n2 行目, カンマ",
      }),
      record({ id: "c", date: "2026-02-01", odometer: null, fuel_type: "other", memo: "  " }),
      // 新しい列の無い古い記録
      record({ id: "d", date: "2026-02-10" }),
    ];
    const csv = buildRecordsCsv(records, new Map([["v1", { name: "マイカー" }]]));
    const parsed = parseFuelLensCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      parsed.records.map(r => [r.odometer, r.is_full, r.missed_previous, r.fuel_type, r.memo])
    ).toEqual([
      [1000, true, false, "regular", null],
      [1250.5, false, true, "diesel", "-部分給油\r\n2 行目, カンマ"],
      [null, true, false, "other", null],
      [null, true, false, null, null],
    ]);
  });
});

describe("toSafeFilenamePart", () => {
  it("keeps Japanese and alphanumerics and replaces the rest", () => {
    expect(toSafeFilenamePart("マイカー 1/2")).toBe("マイカー_1_2");
    expect(toSafeFilenamePart("軽トラ")).toBe("軽トラ");
  });
});
