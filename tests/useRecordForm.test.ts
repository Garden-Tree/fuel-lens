import { describe, expect, it } from "vitest";
import type { FuelRecord } from "@/lib/types";
import { applyFillChain, openRunBefore, previousOdometer, type OpenRun } from "@/lib/fillChain";
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
  mergedRunCountOf,
  mergedRunNote,
  normalizeNumericInput,
  odometerHintOf,
  odometerRequiredFor,
  parseDraft,
  parseDraftNumber,
  recordToDraft,
  resolveEfficiency,
  resolveOpenRun,
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
    expect(NEW).toEqual({ recordId: null, initialDate: "2025-01-05", initialOdometer: null });
    expect(EDIT).toEqual({ recordId: "r9", initialDate: "2025-01-05", initialOdometer: null });
    expect(formTargetOf(null)).toEqual({ recordId: null, initialDate: "", initialOdometer: null });
    expect(formTargetOf(rec({ id: "r9", odometer: 12000 })).initialOdometer).toBe(12000);
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
    expect(odo.map(w => w.code)).toEqual(["FUEL_TOO_LARGE"]);
    expect(odo[0].message).toContain("給油量");
  });

  it("filters by code, not by the message text", () => {
    const warnings = [
      { code: "FUEL_TOO_LARGE", message: "走行距離という言葉を含む給油量の注意" },
      { code: "DISTANCE_TOO_LARGE", message: "x" },
    ];
    expect(visibleScanWarnings(warnings, "odometer")).toEqual([warnings[0]]);
  });

  it("ignores non-array input and malformed items", () => {
    expect(visibleScanWarnings(undefined, "trip")).toEqual([]);
    const ok = { code: "FUEL_TOO_LARGE", message: "a" };
    expect(visibleScanWarnings(["a", 1, null, { code: 1, message: "b" }, { code: "X" }, ok], "trip")).toEqual([ok]);
  });
});

describe("parseDraft: missed_previous in odometer mode", () => {
  it("odometer mode: the derived distance is null (matches the chain); the odometer itself is kept", () => {
    const { parsed } = parseDraft(draft({ odometer: "12,450", missed_previous: true }), {
      vehicle: ODO_VEHICLE,
      previousOdometer: 12000,
    });
    expect(parsed.total_distance).toBeNull();
    expect(parsed.odometer).toBe(12450);
    expect(buildRecordInput(draft({ odometer: "12450", missed_previous: true }), null, null, { vehicle: ODO_VEHICLE, previousOdometer: 12000 })
      .total_distance).toBeNull();
  });

  it("trip mode: the entered distance is kept", () => {
    const { parsed } = parseDraft(draft({ missed_previous: true }), { vehicle: TRIP_VEHICLE });
    expect(parsed.total_distance).toBe(450);
  });
});

describe("efficiency preview with an open run (partial fills)", () => {
  // 部分給油 (149.5 km, 2.0 L) の後の満タン給油 (250 km, 5.2 L) → 保存後は (149.5 + 250) / (2 + 5.2) = 55.49
  const run: OpenRun = { distance: 149.5, fuel: 2, valid: true, count: 1 };
  const full = () => parseDraft(draft({ total_distance: "250", fuel_amount: "5.2" }), { vehicle: TRIP_VEHICLE }).parsed;

  it("merges the open run into a full fill", () => {
    expect(resolveEfficiency(full(), null, run)).toBe(55.49);
    expect(resolveEfficiency(full(), null, null)).toBe(48.08);
    expect(resolveEfficiency(full(), null, undefined)).toBe(48.08);
    expect(mergedRunCountOf(full(), null, run)).toBe(1);
    expect(mergedRunCountOf(full(), null, null)).toBe(0);
    expect(mergedRunCountOf(full(), null, { ...run, count: 3 })).toBe(3);
  });

  it("does not merge an empty run; an invalid run gives null like the chain", () => {
    expect(resolveEfficiency(full(), null, { distance: 0, fuel: 0, valid: true, count: 0 })).toBe(48.08);
    // 直前の run に距離や給油量が不明な記録があると連鎖計算は null を保存するので、プレビューも null
    expect(resolveEfficiency(full(), null, { ...run, valid: false })).toBeNull();
    expect(mergedRunCountOf(full(), null, { ...run, valid: false })).toBe(0);
  });

  it("partial fills and missed records stay null; a missing distance or fuel falls back to the plain calculation", () => {
    const partial = parseDraft(draft({ total_distance: "250", fuel_amount: "5.2", is_full: false }), { vehicle: TRIP_VEHICLE }).parsed;
    expect(resolveEfficiency(partial, null, run)).toBeNull();
    const missed = parseDraft(draft({ total_distance: "250", fuel_amount: "5.2", missed_previous: true }), { vehicle: TRIP_VEHICLE }).parsed;
    expect(resolveEfficiency(missed, null, run)).toBeNull();
    expect(mergedRunCountOf(missed, null, run)).toBe(0);
    const noDistance = parseDraft(draft({ total_distance: "", fuel_amount: "5.2" }), { vehicle: TRIP_VEHICLE }).parsed;
    expect(resolveEfficiency(noDistance, null, run)).toBeNull();
    expect(mergedRunCountOf(noDistance, null, run)).toBe(0);
  });

  it("keeps the stored efficiency for untouched edits (fallback wins over the open run)", () => {
    expect(resolveEfficiency(full(), { value: 55.49 }, run)).toBe(55.49);
    expect(resolveEfficiency(full(), { value: null }, run)).toBeNull();
    expect(mergedRunCountOf(full(), { value: 55.49 }, run)).toBe(0);
  });

  it("odometer mode merges the derived distance", () => {
    const { parsed } = parseDraft(draft({ odometer: "12250", fuel_amount: "5.2" }), { vehicle: ODO_VEHICLE, previousOdometer: 12000 });
    expect(resolveEfficiency(parsed, null, run)).toBe(55.49);
  });

  it("merges when the combined fuel is positive even if this fill is 0 L (same as the chain's Σfuel > 0)", () => {
    const zero = parseDraft(draft({ total_distance: "250", fuel_amount: "0" }), { vehicle: TRIP_VEHICLE }).parsed;
    expect(resolveEfficiency(zero, null, run)).toBe(199.75); // (149.5 + 250) ÷ (2 + 0)
    expect(mergedRunCountOf(zero, null, run)).toBe(1);
    // 合算しても 0 L なら合算しない（燃費は出ない）
    expect(mergedRunCountOf(zero, null, { ...run, fuel: 0 })).toBe(0);
    expect(resolveEfficiency(zero, null, { ...run, fuel: 0 })).toBeNull();
  });

  it("the note mentions partial fills and carry rows", () => {
    expect(mergedRunNote(2)).toBe("部分給油・持ち越し 2 件分と合算");
  });

  it("buildRecordInput stores the merged efficiency when context.openRun is given", () => {
    const d = draft({ total_distance: "250", fuel_amount: "5.2" });
    expect(buildRecordInput(d, null, null, { vehicle: TRIP_VEHICLE, openRun: run }).fuel_efficiency).toBe(55.49);
    expect(buildRecordInput(d, null, null, { vehicle: TRIP_VEHICLE }).fuel_efficiency).toBe(48.08);
  });
});

describe("resolveOpenRun (date changed inside the form)", () => {
  const list: FuelRecord[] = [
    rec({ id: "a", date: "2025-01-01", total_distance: 400, fuel_amount: 30 }),
    rec({ id: "b", date: "2025-02-01", total_distance: 100, fuel_amount: 5, is_full: false }),
    rec({ id: "c", date: "2025-03-01", total_distance: 300, fuel_amount: 20 }),
  ];
  const getOpenRun = (date: string, excludeRecordId?: string) =>
    openRunBefore(excludeRecordId ? list.filter(r => r.id !== excludeRecordId) : list, TRIP_VEHICLE, { date });

  it("uses the fixed value while the date is unchanged, and recomputes when it changes", () => {
    const target = formTargetOf({ id: "c", date: "2025-03-01" });
    const ctx: RecordFormContext = {
      vehicle: TRIP_VEHICLE,
      openRun: openRunBefore(list, TRIP_VEHICLE, { recordId: "c" }),
      getOpenRun,
    };
    expect(resolveOpenRun(ctx, "2025-03-01", target)).toMatchObject({ count: 1, fuel: 5 });
    expect(resolveOpenRun(ctx, "2025-01-15", target)).toMatchObject({ count: 0 });
    expect(resolveOpenRun(ctx, "2025-02-15", target)).toMatchObject({ count: 1, distance: 100 });
    // 入力途中・空の日付では取り直さない。getOpenRun が無ければ固定値、どちらも無ければ null
    expect(resolveOpenRun(ctx, "", target)).toMatchObject({ count: 1 });
    expect(resolveOpenRun({ openRun: ctx.openRun }, "2025-01-15", target)).toMatchObject({ count: 1 });
    expect(resolveOpenRun(null, "2025-01-15", target)).toBeNull();
  });

  it("excludes the record being edited", () => {
    const target = formTargetOf({ id: "b", date: "2025-02-01" });
    // b 自身を除くと、2025-02-15 の前に開いている run は無い（a は満タン）
    expect(resolveOpenRun({ vehicle: TRIP_VEHICLE, getOpenRun }, "2025-02-15", target)).toMatchObject({ count: 0 });
  });
});

describe("same-date position follows the odometer being typed (preview = chain)", () => {
  /** 画面（app/app/page.tsx など）の getter と同じ形。odometer を位置に使う */
  const gettersFor = (records: FuelRecord[], vehicle: RecordFormContext["vehicle"]) => ({
    getPreviousOdometer: (date: string, excludeRecordId?: string, odometer?: number | null) =>
      previousOdometer(excludeRecordId ? records.filter(r => r.id !== excludeRecordId) : records, { date, odometer }),
    getOpenRun: (date: string, excludeRecordId?: string, odometer?: number | null) =>
      openRunBefore(excludeRecordId ? records.filter(r => r.id !== excludeRecordId) : records, vehicle, { date, odometer }),
  });
  /** フォームの燃費プレビュー（useRecordForm と同じ手順） */
  const preview = (records: FuelRecord[], vehicle: RecordFormContext["vehicle"], d: RecordDraft) => {
    const target = formTargetOf({ date: d.date });
    const getters = gettersFor(records, vehicle);
    const ctx: RecordFormContext = {
      vehicle,
      previousOdometer: previousOdometer(records, { date: d.date }),
      openRun: openRunBefore(records, vehicle, { date: d.date }),
      ...getters,
    };
    const odometer = parseDraftNumber(d.odometer).value;
    const prev = resolvePreviousOdometer(ctx, d.date, target, odometer);
    const openRun = resolveOpenRun(ctx, d.date, target, odometer);
    const { parsed } = parseDraft(d, { ...ctx, previousOdometer: prev, openRun });
    return resolveEfficiency(parsed, null, openRun);
  };
  /** 保存後に連鎖計算が出す燃費 */
  const chained = (records: FuelRecord[], vehicle: RecordFormContext["vehicle"], d: RecordDraft) => {
    const odometer = parseDraftNumber(d.odometer).value;
    const added = rec({
      id: "new",
      date: d.date,
      odometer,
      total_distance: vehicle?.distance_mode === "odometer" ? null : parseDraftNumber(d.total_distance).value,
      fuel_amount: parseDraftNumber(d.fuel_amount).value,
      is_full: d.is_full,
      created_at: "2026-12-31T12:00:00Z",
    });
    return applyFillChain([...records, added], vehicle).find(r => r.id === "new")!.fuel_efficiency;
  };

  it("same-date record without an odometer + new 1600: preview and chain agree (30.00)", () => {
    const records = [
      rec({ id: "a", date: "2026-12-01", odometer: 1000, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "x", date: "2026-12-10", odometer: null, fuel_amount: 20, created_at: "2026-12-10T09:00:00Z" }),
    ];
    const d = draft({ date: "2026-12-10", odometer: "1600", fuel_amount: "20" });
    expect(chained(records, ODO_VEHICLE, d)).toBe(30);
    expect(preview(records, ODO_VEHICLE, d)).toBe(30);
  });

  it("same-date partial at 1500 + new 1400: preview 20.00 (not null)", () => {
    const records = [
      rec({ id: "a", date: "2026-12-01", odometer: 1000, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "p", date: "2026-12-10", odometer: 1500, fuel_amount: 5, is_full: false, created_at: "2026-12-10T09:00:00Z" }),
    ];
    const d = draft({ date: "2026-12-10", odometer: "1400", fuel_amount: "20" });
    expect(preview(records, ODO_VEHICLE, d)).toBe(20);
    expect(chained(records, ODO_VEHICLE, d)).toBe(20);
  });

  it("trip mode: a legacy same-date record without created_at is not merged (it is chained after the new one)", () => {
    const records = [
      rec({ id: "f", date: "2026-12-01", total_distance: 400, fuel_amount: 30, created_at: "2026-12-01T00:00:00Z" }),
      rec({ id: "l", date: "2026-12-10", total_distance: 100, fuel_amount: 10, is_full: false, created_at: null }),
    ];
    const d = draft({ date: "2026-12-10", total_distance: "300", fuel_amount: "20" });
    expect(chained(records, TRIP_VEHICLE, d)).toBe(15);
    expect(preview(records, TRIP_VEHICLE, d)).toBe(15);
  });

  it("recomputes for a new record once an odometer is typed, and for an edit only when the odometer changes", () => {
    const calls: unknown[][] = [];
    const ctx: RecordFormContext = {
      vehicle: ODO_VEHICLE,
      previousOdometer: 2000,
      getPreviousOdometer: (...args) => {
        calls.push(args);
        return 1500;
      },
    };
    const NEW = formTargetOf({ date: "2025-03-10" });
    expect(resolvePreviousOdometer(ctx, "2025-03-10", NEW, null)).toBe(2000); // 未入力: 開いたときの値
    expect(resolvePreviousOdometer(ctx, "2025-03-10", NEW)).toBe(2000); // odometer を渡さない
    expect(resolvePreviousOdometer(ctx, "2025-03-10", NEW, 1800)).toBe(1500);
    expect(calls.at(-1)).toEqual(["2025-03-10", undefined, 1800]);

    const EDIT = formTargetOf(rec({ id: "e", date: "2025-03-10", odometer: 2100 }));
    expect(resolvePreviousOdometer(ctx, "2025-03-10", EDIT, 2100)).toBe(2000); // 変えていない
    expect(resolvePreviousOdometer(ctx, "2025-03-10", EDIT, 2050)).toBe(1500);
    expect(calls.at(-1)).toEqual(["2025-03-10", "e", 2050]);
    expect(resolvePreviousOdometer(ctx, "2025-03-10", EDIT, null)).toBe(1500); // 消した
    // 入力途中の日付では取り直さない
    expect(resolvePreviousOdometer(ctx, "2025-03", NEW, 1800)).toBe(2000);
  });

  it("resolveOpenRun follows the same rule and keeps baseStale from the getter", () => {
    const stale: OpenRun = { distance: 0, fuel: 0, valid: true, count: 0, baseStale: true };
    const ctx: RecordFormContext = { vehicle: ODO_VEHICLE, openRun: null, getOpenRun: () => stale };
    const NEW = formTargetOf({ date: "2025-03-10" });
    expect(resolveOpenRun(ctx, "2025-03-10", NEW, null)).toBeNull();
    expect(resolveOpenRun(ctx, "2025-03-10", NEW, 1800)?.baseStale).toBe(true);
  });
});
