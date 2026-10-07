import { describe, expect, it } from "vitest";
import type { FuelRecord } from "@/lib/useFuelRecords";
import { previousOdometer } from "@/lib/fillChain";
import { plausibilityWarnings } from "@/lib/analyze";
import {
  MISSED_PREVIOUS_EFFICIENCY_NOTE,
  ODOMETER_OPTIONAL_HINT,
  ODOMETER_REQUIRED_MESSAGE,
  PARTIAL_FILL_EFFICIENCY_NOTE,
  buildRecordInput,
  countChars,
  deriveOdometerDistance,
  efficiencyFallbackOf,
  efficiencyNoteOf,
  findDuplicateRecord,
  formTargetOf,
  normalizeNumericInput,
  odometerHintOf,
  odometerRequiredFor,
  parseDraft,
  parseDraftNumber,
  recordToDraft,
  resolvePreviousOdometer,
  visibleScanWarnings,
  type RecordDraft,
  type RecordFormContext,
} from "@/lib/useRecordForm";

function draft(overrides: Partial<RecordDraft> = {}): RecordDraft {
  return {
    date: "2025-01-05",
    fuel_amount: "30",
    total_cost: "4800",
    total_distance: "450",
    odometer: "",
    gas_station: "",
    memo: "",
    is_full: true,
    missed_previous: false,
    fuel_type: null,
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
      odometer: null,
      gas_station: "ENEOS",
      is_full: true,
      missed_previous: false,
      fuel_type: null,
      memo: null,
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

describe("buildRecordInput / efficiencyFallbackOf", () => {
  it("keeps a stored null efficiency (imported partial fill) when only the station is edited", () => {
    const stored = rec({ fuel_efficiency: null, gas_station: "ENEOS" });
    const d = { ...recordToDraft(stored), gas_station: "出光" };
    const out = buildRecordInput(d, stored.price_per_unit, efficiencyFallbackOf(stored));
    expect(out.fuel_efficiency).toBeNull();
    expect(out.gas_station).toBe("出光");
  });

  it("keeps a stored run efficiency (Σdistance/Σfuel) that differs from distance/fuel of the row", () => {
    const stored = rec({ total_distance: 200, fuel_amount: 20, fuel_efficiency: 14.29 });
    const out = buildRecordInput(recordToDraft(stored), stored.price_per_unit, efficiencyFallbackOf(stored));
    expect(out.fuel_efficiency).toBe(14.29);
  });

  it("recomputes once distance or fuel has been edited (fallback cleared)", () => {
    const stored = rec({ total_distance: 200, fuel_amount: 20, fuel_efficiency: null });
    const d = { ...recordToDraft(stored), total_distance: "300" };
    expect(buildRecordInput(d, null, null).fuel_efficiency).toBe(15);
  });

  it("does not carry over efficiency for new records or scan results (fuel_efficiency undefined)", () => {
    expect(efficiencyFallbackOf(undefined)).toBeNull();
    expect(efficiencyFallbackOf({ date: "2025-01-05", fuel_amount: 30 })).toBeNull();
    expect(efficiencyFallbackOf(rec({ fuel_efficiency: null }))).toEqual({ value: null });
    expect(efficiencyFallbackOf(rec({ fuel_efficiency: 15 }))).toEqual({ value: 15 });
    const out = buildRecordInput(draft(), null, efficiencyFallbackOf({ date: "2025-01-05" }));
    expect(out.fuel_efficiency).toBe(15);
  });
});

const ODO_VEHICLE: RecordFormContext["vehicle"] = { distance_mode: "odometer", default_fuel_type: null };
const TRIP_VEHICLE: RecordFormContext["vehicle"] = { distance_mode: "trip", default_fuel_type: "premium" };

describe("recordToDraft (new fields)", () => {
  it("defaults to full fill, no missed record, empty odometer/memo", () => {
    expect(recordToDraft({ date: "2025-01-05" })).toMatchObject({
      odometer: "",
      memo: "",
      is_full: true,
      missed_previous: false,
      fuel_type: null,
    });
  });

  it("uses the vehicle's default fuel type only for new records", () => {
    expect(recordToDraft({ date: "2025-01-05" }, { vehicle: TRIP_VEHICLE }).fuel_type).toBe("premium");
    // スキャン結果で読めた燃料種別は車両の既定値より優先
    expect(recordToDraft({ date: "2025-01-05", fuel_type: "diesel" }, { vehicle: TRIP_VEHICLE }).fuel_type).toBe("diesel");
    // スキャン結果で読めなかった（null）なら車両の既定値
    expect(recordToDraft({ date: "2025-01-05", fuel_type: null }, { vehicle: TRIP_VEHICLE }).fuel_type).toBe("premium");
    // 既存の記録の編集では未指定のまま
    expect(recordToDraft(rec({ fuel_type: null }), { vehicle: TRIP_VEHICLE }).fuel_type).toBeNull();
  });

  it("copies stored odometer, flags, fuel type and memo", () => {
    const d = recordToDraft(
      rec({ odometer: 12345.6, is_full: false, missed_previous: true, fuel_type: "regular", memo: "高速" })
    );
    expect(d).toMatchObject({
      odometer: "12345.6",
      is_full: false,
      missed_previous: true,
      fuel_type: "regular",
      memo: "高速",
    });
  });
});

describe("deriveOdometerDistance", () => {
  it("returns the difference rounded to 0.01 km", () => {
    expect(deriveOdometerDistance(12450.3, 12000.1)).toBe(450.2);
  });

  it("returns null when either value is missing or the difference is not positive", () => {
    expect(deriveOdometerDistance(null, 12000)).toBeNull();
    expect(deriveOdometerDistance(12000, null)).toBeNull();
    expect(deriveOdometerDistance(12000, 12000)).toBeNull();
    expect(deriveOdometerDistance(11000, 12000)).toBeNull();
  });
});

describe("parseDraft (distance modes)", () => {
  it("trip mode: keeps the entered distance and ignores the odometer", () => {
    const { parsed, errors } = parseDraft(draft({ odometer: "x" }), { vehicle: TRIP_VEHICLE });
    expect(errors).toEqual({});
    expect(parsed.total_distance).toBe(450);
  });

  it("odometer mode: derives the distance from the previous odometer", () => {
    const { parsed, errors } = parseDraft(draft({ odometer: "12,450", total_distance: "999" }), {
      vehicle: ODO_VEHICLE,
      previousOdometer: 12000,
    });
    expect(errors).toEqual({});
    expect(parsed.odometer).toBe(12450);
    expect(parsed.total_distance).toBe(450);
  });

  it("odometer mode: distance is null without a previous odometer or with a smaller value", () => {
    expect(parseDraft(draft({ odometer: "12450" }), { vehicle: ODO_VEHICLE }).parsed.total_distance).toBeNull();
    expect(
      parseDraft(draft({ odometer: "11000" }), { vehicle: ODO_VEHICLE, previousOdometer: 12000 }).parsed.total_distance
    ).toBeNull();
  });

  it("odometer mode: requires a non-negative numeric odometer", () => {
    expect(parseDraft(draft(), { vehicle: ODO_VEHICLE }).errors.odometer).toBe(ODOMETER_REQUIRED_MESSAGE);
    expect(parseDraft(draft({ odometer: "-1" }), { vehicle: ODO_VEHICLE }).errors.odometer).toBe(
      "0以上の値を入力してください"
    );
    expect(parseDraft(draft({ odometer: "abc" }), { vehicle: ODO_VEHICLE }).errors.odometer).toBe("数値を入力してください");
    // 画面に出ていない走行距離欄のエラーでは保存を止めない
    expect(parseDraft(draft({ odometer: "100", total_distance: "x" }), { vehicle: ODO_VEHICLE }).errors).toEqual({});
  });

  it("limits the memo to 200 code points (trimmed) and maps empty to null", () => {
    expect(parseDraft(draft({ memo: "   " })).parsed.memo).toBeNull();
    expect(parseDraft(draft({ memo: "  メモ  " })).parsed.memo).toBe("メモ");
    expect(parseDraft(draft({ memo: "あ".repeat(200) })).errors.memo).toBeUndefined();
    expect(parseDraft(draft({ memo: "あ".repeat(201) })).errors.memo).toBe("メモは200文字以内で入力してください");
    // 絵文字（サロゲートペア）も 1 文字として数える
    expect(countChars("⛽".repeat(3) + "😀")).toBe(4);
    expect(parseDraft(draft({ memo: "😀".repeat(200) })).errors.memo).toBeUndefined();
  });
});

describe("buildRecordInput (new fields)", () => {
  it("includes odometer, flags, fuel type and trimmed memo", () => {
    const out = buildRecordInput(
      draft({ odometer: "12345", fuel_type: "regular", memo: "  家族旅行  " }),
      null,
      null
    );
    expect(out).toMatchObject({
      odometer: 12345,
      is_full: true,
      missed_previous: false,
      fuel_type: "regular",
      memo: "家族旅行",
      total_distance: 450,
      fuel_efficiency: 15,
    });
    expect(buildRecordInput(draft({ memo: "   " }), null, null).memo).toBeNull();
  });

  it("odometer mode: saves the derived distance and its efficiency", () => {
    const out = buildRecordInput(draft({ odometer: "12450", total_distance: "999" }), null, null, {
      vehicle: ODO_VEHICLE,
      previousOdometer: 12000,
    });
    expect(out.total_distance).toBe(450);
    expect(out.odometer).toBe(12450);
    expect(out.fuel_efficiency).toBe(15);
  });

  it("partial fill and missed previous have no efficiency (even with a stored fallback)", () => {
    expect(buildRecordInput(draft({ is_full: false }), null, null).fuel_efficiency).toBeNull();
    expect(buildRecordInput(draft({ missed_previous: true }), null, null).fuel_efficiency).toBeNull();
    expect(buildRecordInput(draft({ is_full: false }), null, { value: 15 }).fuel_efficiency).toBeNull();
    // 部分給油でも区間距離は保存する（連鎖計算で次の満タン給油に積み上がる）
    expect(buildRecordInput(draft({ is_full: false }), null, null).total_distance).toBe(450);
  });
});

describe("efficiencyNoteOf", () => {
  it("explains why the efficiency is not shown", () => {
    expect(efficiencyNoteOf({ is_full: false, missed_previous: false })).toBe(PARTIAL_FILL_EFFICIENCY_NOTE);
    expect(efficiencyNoteOf({ is_full: true, missed_previous: true })).toBe(MISSED_PREVIOUS_EFFICIENCY_NOTE);
    expect(efficiencyNoteOf({ is_full: true, missed_previous: false })).toBeNull();
  });
});

describe("odometer requirement (new manual records only)", () => {
  const NEW = formTargetOf({ date: "2025-01-05" });
  const EDIT = formTargetOf(rec({ id: "r9" }));

  it("formTargetOf: records without an id are new", () => {
    expect(NEW).toEqual({ recordId: null, initialDate: "2025-01-05" });
    expect(EDIT).toEqual({ recordId: "r9", initialDate: "2025-01-05" });
    expect(formTargetOf(null)).toEqual({ recordId: null, initialDate: "" });
  });

  it("is required only for new manual records in odometer mode", () => {
    expect(odometerRequiredFor({ vehicle: ODO_VEHICLE }, NEW)).toBe(true);
    expect(odometerRequiredFor({ vehicle: ODO_VEHICLE }, EDIT)).toBe(false); // 既存の記録の編集
    expect(odometerRequiredFor({ vehicle: ODO_VEHICLE, odometerOptional: true }, NEW)).toBe(false); // スキャン結果
    expect(odometerRequiredFor({ vehicle: TRIP_VEHICLE }, NEW)).toBe(false);
    expect(odometerRequiredFor(null, NEW)).toBe(false);
  });

  it("an optional odometer may be empty: no error, null distance, and an amber hint instead", () => {
    const ctx = { vehicle: ODO_VEHICLE, previousOdometer: 12000 };
    const { parsed, errors } = parseDraft(draft(), ctx, { odometerRequired: false });
    expect(errors).toEqual({});
    expect(parsed.odometer).toBeNull();
    expect(parsed.total_distance).toBeNull();
    expect(odometerHintOf("odometer", parsed, errors)).toBe(ODOMETER_OPTIONAL_HINT);
    // 保存値: 区間距離 null（連鎖計算では持ち越し行）・燃費 null
    const out = buildRecordInput(draft(), null, null, ctx);
    expect(out).toMatchObject({ odometer: null, total_distance: null, fuel_efficiency: null });
    // 不正な値はエラーのまま
    expect(parseDraft(draft({ odometer: "abc" }), ctx, { odometerRequired: false }).errors.odometer).toBe(
      "数値を入力してください"
    );
  });

  it("the hint is not shown when required (the error is), when filled, or in trip mode", () => {
    const required = parseDraft(draft(), { vehicle: ODO_VEHICLE });
    expect(required.errors.odometer).toBe(ODOMETER_REQUIRED_MESSAGE);
    expect(odometerHintOf("odometer", required.parsed, required.errors)).toBeNull();
    expect(odometerHintOf("odometer", { odometer: 100 }, {})).toBeNull();
    expect(odometerHintOf("trip", { odometer: null }, {})).toBeNull();
  });
});

describe("resolvePreviousOdometer (date changed inside the form)", () => {
  const records: FuelRecord[] = [
    rec({ id: "a", date: "2025-01-01", odometer: 1000 }),
    rec({ id: "b", date: "2025-02-01", odometer: 1500 }),
    rec({ id: "c", date: "2025-03-01", odometer: 2000 }),
  ];
  const getPreviousOdometer = (date: string, excludeRecordId?: string) =>
    previousOdometer(excludeRecordId ? records.filter(r => r.id !== excludeRecordId) : records, { date });

  it("uses the fixed value while the date is unchanged, and recomputes when it changes", () => {
    const target = formTargetOf({ date: "2025-03-10" });
    const ctx: RecordFormContext = { vehicle: ODO_VEHICLE, previousOdometer: 2000, getPreviousOdometer };
    expect(resolvePreviousOdometer(ctx, "2025-03-10", target)).toBe(2000);
    expect(resolvePreviousOdometer(ctx, "2025-02-10", target)).toBe(1500);
    expect(resolvePreviousOdometer(ctx, "2024-12-31", target)).toBeNull();
    // 入力途中・空の日付では取り直さない
    expect(resolvePreviousOdometer(ctx, "", target)).toBe(2000);
    // getPreviousOdometer が無ければ固定値
    expect(resolvePreviousOdometer({ previousOdometer: 2000 }, "2025-02-10", target)).toBe(2000);
  });

  it("excludes the record being edited", () => {
    const target = formTargetOf(records[2]); // c（2025-03-01、2000）
    const ctx: RecordFormContext = {
      vehicle: ODO_VEHICLE,
      previousOdometer: previousOdometer(records, { recordId: "c" }),
      getPreviousOdometer,
    };
    expect(resolvePreviousOdometer(ctx, "2025-03-01", target)).toBe(1500);
    // 後ろの日付へ動かしても、自分自身（2000）は前回として数えない
    expect(resolvePreviousOdometer(ctx, "2025-04-01", target)).toBe(1500);
    expect(resolvePreviousOdometer(ctx, "2025-01-15", target)).toBe(1000);
  });

  it("the parsed distance follows the recomputed previous odometer", () => {
    const target = formTargetOf({ date: "2025-03-10" });
    const ctx: RecordFormContext = { vehicle: ODO_VEHICLE, previousOdometer: 2000, getPreviousOdometer };
    const prev = resolvePreviousOdometer(ctx, "2025-02-10", target);
    const { parsed } = parseDraft(draft({ date: "2025-02-10", odometer: "1800" }), { ...ctx, previousOdometer: prev });
    expect(parsed.total_distance).toBe(300);
  });
});

describe("visibleScanWarnings", () => {
  it("hides distance / trip meter warnings in odometer mode and keeps the others", () => {
    const warnings = plausibilityWarnings({ fuel_amount: 250, total_distance: 20000 });
    expect(warnings).toHaveLength(3);
    expect(visibleScanWarnings(warnings, "trip")).toEqual(warnings);
    const odo = visibleScanWarnings(warnings, "odometer");
    expect(odo).toHaveLength(1);
    expect(odo[0]).toContain("給油量");
    expect(odo.some(w => /走行距離|トリップ/.test(w))).toBe(false);
  });

  it("ignores non-array input and non-string items", () => {
    expect(visibleScanWarnings(undefined, "trip")).toEqual([]);
    expect(visibleScanWarnings(["a", 1, null], "trip")).toEqual(["a"]);
  });
});
