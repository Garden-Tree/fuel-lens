import { describe, expect, it } from "vitest";
import type { FuelRecord } from "@/lib/useFuelRecords";
import {
  findDuplicateRecord,
  normalizeNumericInput,
  parseDraft,
  parseDraftNumber,
  recordToDraft,
  type RecordDraft,
} from "@/lib/useRecordForm";

function draft(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return {
    date: "2025-01-05",
    fuel_amount: "30",
    total_cost: "4800",
    total_distance: "450",
    gas_station: "",
    ...overrides,
  };
}

function rec(overrides: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id: "r1",
    date: "2025-01-05",
    total_distance: 450,
    fuel_amount: 30,
    gas_station: null,
    price_per_unit: 160,
    total_cost: 4800,
    fuel_efficiency: 15,
    ...overrides,
  };
}

describe("normalizeNumericInput", () => {
  it("converts full-width digits/period/minus and strips commas and spaces", () => {
    expect(normalizeNumericInput("１２．５")).toBe("12.5");
    expect(normalizeNumericInput("－３")).toBe("-3");
    expect(normalizeNumericInput(" 4,800 ")).toBe("4800");
  });
});

describe("parseDraftNumber", () => {
  it("treats empty input as null without error", () => {
    expect(parseDraftNumber("")).toEqual({ value: null });
    expect(parseDraftNumber("   ")).toEqual({ value: null });
  });

  it("accepts in-progress decimals and normal numbers", () => {
    expect(parseDraftNumber("4.")).toEqual({ value: 4 });
    expect(parseDraftNumber("4.78")).toEqual({ value: 4.78 });
    expect(parseDraftNumber(".5")).toEqual({ value: 0.5 });
    expect(parseDraftNumber("0")).toEqual({ value: 0 });
    expect(parseDraftNumber("１,２３４")).toEqual({ value: 1234 });
  });

  it("rejects non-numeric input", () => {
    for (const raw of ["abc", "1e3", "1.2.3", "-", ".", "-."]) {
      const r = parseDraftNumber(raw);
      expect(r.value).toBeNull();
      expect(r.error).toBe("数値を入力してください");
    }
  });

  it("rejects negative numbers", () => {
    expect(parseDraftNumber("-1")).toEqual({ value: null, error: "0以上の値を入力してください" });
  });
});

describe("parseDraft", () => {
  it("parses a valid draft without errors", () => {
    const { parsed, errors } = parseDraft(draft({ gas_station: "  ENEOS  " }));
    expect(errors).toEqual({});
    expect(parsed).toEqual({
      date: "2025-01-05",
      fuel_amount: 30,
      total_cost: 4800,
      total_distance: 450,
      gas_station: "ENEOS",
    });
  });

  it("requires a date (empty or whitespace-only is an error)", () => {
    expect(parseDraft(draft({ date: "" })).errors.date).toBe("日付を入力してください");
    expect(parseDraft(draft({ date: "   " })).errors.date).toBe("日付を入力してください");
  });

  it("flags a malformed date", () => {
    expect(parseDraft(draft({ date: "2025/01/05" })).errors.date).toBe("日付の形式が正しくありません");
  });

  it("collects per-field numeric errors and maps empty station to null", () => {
    const { parsed, errors } = parseDraft(draft({ fuel_amount: "x", total_cost: "-5", total_distance: "" }));
    expect(errors.fuel_amount).toBe("数値を入力してください");
    expect(errors.total_cost).toBe("0以上の値を入力してください");
    expect(errors.total_distance).toBeUndefined();
    expect(parsed.total_distance).toBeNull();
    expect(parsed.gas_station).toBeNull();
  });

  it("round-trips a record through recordToDraft", () => {
    const { parsed, errors } = parseDraft(recordToDraft(rec({ gas_station: "出光" })));
    expect(errors).toEqual({});
    expect(parsed).toMatchObject({ date: "2025-01-05", fuel_amount: 30, total_cost: 4800, gas_station: "出光" });
  });
});

describe("findDuplicateRecord", () => {
  const records = [rec({ id: "a" }), rec({ id: "b", date: "2025-02-01", total_cost: null })];

  it("finds a record with the same date, amount (within 0.01) and cost", () => {
    expect(findDuplicateRecord(records, { date: "2025-01-05", fuel_amount: 30.005, total_cost: 4800 })?.id).toBe("a");
  });

  it("does not match when date, amount or cost differ", () => {
    expect(findDuplicateRecord(records, { date: "2025-01-06", fuel_amount: 30, total_cost: 4800 })).toBeNull();
    expect(findDuplicateRecord(records, { date: "2025-01-05", fuel_amount: 30.02, total_cost: 4800 })).toBeNull();
    expect(findDuplicateRecord(records, { date: "2025-01-05", fuel_amount: 30, total_cost: 4801 })).toBeNull();
  });

  it("treats null costs (and null amounts) as equal to each other only", () => {
    expect(findDuplicateRecord(records, { date: "2025-02-01", fuel_amount: 30, total_cost: null })?.id).toBe("b");
    expect(findDuplicateRecord(records, { date: "2025-02-01", fuel_amount: 30, total_cost: 0 })).toBeNull();
    const withNullAmount = [rec({ id: "c", fuel_amount: null })];
    expect(findDuplicateRecord(withNullAmount, { date: "2025-01-05", fuel_amount: null, total_cost: 4800 })?.id).toBe("c");
    expect(findDuplicateRecord(withNullAmount, { date: "2025-01-05", fuel_amount: 0, total_cost: 4800 })).toBeNull();
  });

  it("skips the excluded record id (editing itself)", () => {
    expect(findDuplicateRecord(records, { date: "2025-01-05", fuel_amount: 30, total_cost: 4800 }, "a")).toBeNull();
  });
});
