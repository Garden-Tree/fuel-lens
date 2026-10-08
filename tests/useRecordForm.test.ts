import { describe, expect, it } from "vitest";
import type { FuelRecord } from "@/lib/types";
import { applyFillChain } from "@/lib/fillChain";
import { plausibilityWarnings } from "@/lib/analyze";
import {
  MISSED_PREVIOUS_EFFICIENCY_NOTE,
  ODOMETER_OPTIONAL_HINT,
  ODOMETER_REQUIRED_MESSAGE,
  PARTIAL_FILL_EFFICIENCY_NOTE,
  buildRecordInput,
  countChars,
  efficiencyFallbackOf,
  efficiencyNoteOf,
  findDuplicateRecord,
  formEfficiencyOf,
  formPreviewOf,
  formTargetOf,
  mergedRunNote,
  normalizeNumericInput,
  odometerHintOf,
  odometerRequiredFor,
  parseDraft,
  parseDraftNumber,
  previewCandidateOf,
  recordToDraft,
  visibleScanWarnings,
  type EfficiencyFallback,
  type RecordDraft,
  type RecordFormContext,
} from "@/lib/useRecordForm";
import * as recordDraftModule from "@/lib/recordDraft";
import * as useRecordFormModule from "@/lib/useRecordForm";

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

const ODO_VEHICLE: RecordFormContext["vehicle"] = { distance_mode: "odometer", default_fuel_type: null };
const TRIP_VEHICLE: RecordFormContext["vehicle"] = { distance_mode: "trip", default_fuel_type: "premium" };

/**
 * useRecordForm と同じ手順でフォームの状態を求める（フックは previewInChain → parseDraft → formEfficiencyOf を useMemo で包むだけ）。
 * record を省略すると、ドラフトの日付で開いた新規の記録
 */
function formState(
  d: RecordDraft,
  context: RecordFormContext,
  record?: Partial<FuelRecord> | null,
  fallback: EfficiencyFallback = null
) {
  const target = formTargetOf(record ?? { date: d.date });
  const preview = formPreviewOf(d, context, target);
  const { parsed, errors } = parseDraft(d, context, { odometerRequired: odometerRequiredFor(context, target), preview });
  return { target, preview, parsed, errors, ...formEfficiencyOf(parsed, fallback, preview) };
}

describe("module layout", () => {
  it("useRecordForm re-exports the pure helpers of lib/recordDraft.ts", () => {
    for (const name of Object.keys(recordDraftModule)) {
      expect(useRecordFormModule).toHaveProperty(name, recordDraftModule[name as keyof typeof recordDraftModule]);
    }
  });
});

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

describe("recordToDraft (defaults)", () => {
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

describe("distance modes (preview = chain)", () => {
  const prev12000 = [rec({ id: "p", date: "2025-01-01", odometer: 12000 })];

  it("trip mode: keeps the entered distance and ignores an invalid odometer", () => {
    const { parsed, errors } = formState(draft({ odometer: "x" }), { vehicle: TRIP_VEHICLE });
    expect(errors).toEqual({});
    expect(parsed.total_distance).toBe(450);
  });

  it("odometer mode: derives the distance from the chain's previous odometer", () => {
    const s = formState(draft({ odometer: "12,450", total_distance: "999" }), { vehicle: ODO_VEHICLE, records: prev12000 });
    expect(s.errors).toEqual({});
    expect(s.parsed.odometer).toBe(12450);
    expect(s.parsed.total_distance).toBe(450);
    expect(s.preview.base).toBe(12000);
    expect(s.fuel_efficiency).toBe(15);
  });

  it("odometer mode: distance is null without a previous odometer or with a smaller value", () => {
    expect(formState(draft({ odometer: "12450" }), { vehicle: ODO_VEHICLE }).parsed.total_distance).toBeNull();
    expect(
      formState(draft({ odometer: "11000" }), { vehicle: ODO_VEHICLE, records: prev12000 }).parsed.total_distance
    ).toBeNull();
    // parseDraft にプレビューを渡さなければ、オドメーターモードの区間距離は null
    expect(parseDraft(draft({ odometer: "12450" }), { vehicle: ODO_VEHICLE }).parsed.total_distance).toBeNull();
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

  it("odometer mode, missed_previous: the derived distance is null (the chain); the odometer itself is kept", () => {
    const d = draft({ odometer: "12,450", missed_previous: true });
    const s = formState(d, { vehicle: ODO_VEHICLE, records: prev12000 });
    expect(s.parsed.total_distance).toBeNull();
    expect(s.parsed.odometer).toBe(12450);
    expect(s.fuel_efficiency).toBeNull();
    expect(buildRecordInput(d, null, null, { vehicle: ODO_VEHICLE, records: prev12000 }).total_distance).toBeNull();
  });

  it("trip mode, missed_previous: the entered distance is kept, the efficiency is null", () => {
    const s = formState(draft({ missed_previous: true }), { vehicle: TRIP_VEHICLE });
    expect(s.parsed.total_distance).toBe(450);
    expect(s.fuel_efficiency).toBeNull();
  });
});

describe("buildRecordInput", () => {
  it("includes odometer, flags, fuel type and trimmed memo", () => {
    const out = buildRecordInput(draft({ odometer: "12345", fuel_type: "regular", memo: "  家族旅行  " }), null, null);
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
    const records = [rec({ id: "p", date: "2025-01-01", odometer: 12000 })];
    const out = buildRecordInput(draft({ odometer: "12450", total_distance: "999" }), null, null, {
      vehicle: ODO_VEHICLE,
      records,
    });
    expect(out).toMatchObject({ total_distance: 450, odometer: 12450, fuel_efficiency: 15 });
  });

  it("partial fill and missed previous have no efficiency (even with a stored fallback)", () => {
    expect(buildRecordInput(draft({ is_full: false }), null, null).fuel_efficiency).toBeNull();
    expect(buildRecordInput(draft({ missed_previous: true }), null, null).fuel_efficiency).toBeNull();
    expect(buildRecordInput(draft({ is_full: false }), null, { value: 15 }).fuel_efficiency).toBeNull();
    // 部分給油でも区間距離は保存する（連鎖計算で次の満タン給油に積み上がる）
    expect(buildRecordInput(draft({ is_full: false }), null, null).total_distance).toBe(450);
  });

  it("falls back to the stored price only while it cannot be recomputed", () => {
    expect(buildRecordInput(draft({ fuel_amount: "" }), 170, null).price_per_unit).toBe(170);
    expect(buildRecordInput(draft(), 170, null).price_per_unit).toBe(160);
  });

  it("stores the merged efficiency of the chain for an edited record (target)", () => {
    const records = [
      rec({ id: "f1", date: "2025-01-01", total_distance: 400, fuel_amount: 30 }),
      rec({ id: "p1", date: "2025-01-03", total_distance: 149.5, fuel_amount: 2, is_full: false, fuel_efficiency: null }),
      rec({ id: "f2", date: "2025-01-05", total_distance: 250, fuel_amount: 5.2, fuel_efficiency: 55.49 }),
    ];
    const d = { ...recordToDraft(records[2]), fuel_amount: "5.2" };
    const out = buildRecordInput(d, null, null, { vehicle: TRIP_VEHICLE, records }, formTargetOf(records[2]));
    expect(out.fuel_efficiency).toBe(55.49);
    // 新規として f2 を除いた記録に追加しても同じ位置・同じ値。記録が無ければ合算なし（250 ÷ 5.2）
    expect(buildRecordInput(d, null, null, { vehicle: TRIP_VEHICLE, records: records.slice(0, 2) }).fuel_efficiency).toBe(55.49);
    expect(buildRecordInput(d, null, null, { vehicle: TRIP_VEHICLE }).fuel_efficiency).toBe(48.08);
  });
});

describe("stored efficiency fallback (untouched edits)", () => {
  it("efficiencyFallbackOf: only records that have fuel_efficiency carry it over", () => {
    expect(efficiencyFallbackOf(undefined)).toBeNull();
    expect(efficiencyFallbackOf({ date: "2025-01-05", fuel_amount: 30 })).toBeNull();
    expect(efficiencyFallbackOf(rec({ fuel_efficiency: null }))).toEqual({ value: null });
    expect(efficiencyFallbackOf(rec({ fuel_efficiency: 15 }))).toEqual({ value: 15 });
    const out = buildRecordInput(draft(), null, efficiencyFallbackOf({ date: "2025-01-05" }));
    expect(out.fuel_efficiency).toBe(15);
  });

  it("keeps a stored null efficiency (imported partial fill) when only the station is edited", () => {
    const stored = rec({ fuel_efficiency: null, gas_station: "ENEOS" });
    const d = { ...recordToDraft(stored), gas_station: "出光" };
    const out = buildRecordInput(d, stored.price_per_unit, efficiencyFallbackOf(stored));
    expect(out.fuel_efficiency).toBeNull();
    expect(out.gas_station).toBe("出光");
  });

  it("keeps a stored efficiency that differs from the chain, and recomputes once it is cleared", () => {
    const stored = rec({ total_distance: 200, fuel_amount: 20, fuel_efficiency: 14.29 });
    expect(buildRecordInput(recordToDraft(stored), stored.price_per_unit, efficiencyFallbackOf(stored)).fuel_efficiency).toBe(14.29);
    const d = { ...recordToDraft(stored), total_distance: "300" };
    expect(buildRecordInput(d, null, null).fuel_efficiency).toBe(15);
  });

  it("the fallback wins over the chain preview (and reports no merged rows); partial / missed stay null", () => {
    const preview = { fuel_efficiency: 55.49, runCount: 1 };
    expect(formEfficiencyOf({ is_full: true, missed_previous: false }, { value: 50 }, preview)).toEqual({
      fuel_efficiency: 50,
      mergedRunCount: 0,
    });
    expect(formEfficiencyOf({ is_full: true, missed_previous: false }, { value: null }, preview)).toEqual({
      fuel_efficiency: null,
      mergedRunCount: 0,
    });
    expect(formEfficiencyOf({ is_full: true, missed_previous: false }, null, preview)).toEqual({
      fuel_efficiency: 55.49,
      mergedRunCount: 1,
    });
    expect(formEfficiencyOf({ is_full: false, missed_previous: false }, { value: 50 }, preview).fuel_efficiency).toBeNull();
    expect(formEfficiencyOf({ is_full: true, missed_previous: true }, { value: 50 }, preview).fuel_efficiency).toBeNull();
    // 燃費が出なければ合算件数も 0
    expect(formEfficiencyOf({ is_full: true, missed_previous: false }, null, { fuel_efficiency: null, runCount: 2 })).toEqual({
      fuel_efficiency: null,
      mergedRunCount: 0,
    });
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
    const ctx: RecordFormContext = {
      vehicle: ODO_VEHICLE,
      records: [rec({ id: "p", date: "2025-01-01", odometer: 12000 })],
      odometerOptional: true,
    };
    const { parsed, errors } = formState(draft(), ctx);
    expect(errors).toEqual({});
    expect(parsed.odometer).toBeNull();
    expect(parsed.total_distance).toBeNull();
    expect(odometerHintOf("odometer", parsed, errors)).toBe(ODOMETER_OPTIONAL_HINT);
    // 保存値: 区間距離 null（連鎖計算では持ち越し行）・燃費 null
    expect(buildRecordInput(draft(), null, null, ctx)).toMatchObject({ odometer: null, total_distance: null, fuel_efficiency: null });
    // 不正な値はエラーのまま
    expect(formState(draft({ odometer: "abc" }), ctx).errors.odometer).toBe("数値を入力してください");
  });

  it("the hint is not shown when required (the error is), when filled, or in trip mode", () => {
    const required = formState(draft(), { vehicle: ODO_VEHICLE });
    expect(required.errors.odometer).toBe(ODOMETER_REQUIRED_MESSAGE);
    expect(odometerHintOf("odometer", required.parsed, required.errors)).toBeNull();
    expect(odometerHintOf("odometer", { odometer: 100 }, {})).toBeNull();
    expect(odometerHintOf("trip", { odometer: null }, {})).toBeNull();
    // 既存の記録の編集では任意
    expect(formState(draft(), { vehicle: ODO_VEHICLE }, rec({ id: "r9" })).errors).toEqual({});
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

describe("efficiency preview with an open run (partial fills)", () => {
  // 部分給油 (149.5 km, 2.0 L) の後の満タン給油 (250 km, 5.2 L) → 保存後は (149.5 + 250) / (2 + 5.2) = 55.49
  const records = [
    rec({ id: "f1", date: "2025-01-01", total_distance: 400, fuel_amount: 30 }),
    rec({ id: "p1", date: "2025-01-03", total_distance: 149.5, fuel_amount: 2, is_full: false }),
  ];
  const ctx: RecordFormContext = { vehicle: TRIP_VEHICLE, records };
  const full = (overrides: Partial<RecordDraft> = {}) => draft({ total_distance: "250", fuel_amount: "5.2", ...overrides });

  it("merges the open run into a full fill and counts the merged rows", () => {
    expect(formState(full(), ctx)).toMatchObject({ fuel_efficiency: 55.49, mergedRunCount: 1 });
    expect(mergedRunNote(1)).toBe("部分給油・持ち越し 1 件分と合算");
    // 記録が無ければ合算なし
    expect(formState(full(), { vehicle: TRIP_VEHICLE })).toMatchObject({ fuel_efficiency: 48.08, mergedRunCount: 0 });
    // 2 件の部分給油: (149.5 + 100 + 250) / (2 + 8 + 5.2) = 32.86
    const two = [...records, rec({ id: "p2", date: "2025-01-04", total_distance: 100, fuel_amount: 8, is_full: false })];
    expect(formState(full(), { vehicle: TRIP_VEHICLE, records: two })).toMatchObject({ fuel_efficiency: 32.86, mergedRunCount: 2 });
  });

  it("an invalid run (unknown fuel amount) gives null like the chain", () => {
    const invalid = [records[0], { ...records[1], fuel_amount: null }];
    expect(formState(full(), { vehicle: TRIP_VEHICLE, records: invalid })).toMatchObject({
      fuel_efficiency: null,
      mergedRunCount: 0,
    });
  });

  it("partial fills and missed records stay null; a missing distance gives null", () => {
    expect(formState(full({ is_full: false }), ctx)).toMatchObject({ fuel_efficiency: null, mergedRunCount: 0 });
    expect(formState(full({ missed_previous: true }), ctx)).toMatchObject({ fuel_efficiency: null, mergedRunCount: 0 });
    expect(formState(full({ total_distance: "" }), ctx)).toMatchObject({ fuel_efficiency: null, mergedRunCount: 0 });
  });

  it("keeps the stored efficiency for untouched edits (fallback wins over the run)", () => {
    expect(formState(full(), ctx, undefined, { value: 50 })).toMatchObject({ fuel_efficiency: 50, mergedRunCount: 0 });
    expect(formState(full(), ctx, undefined, { value: null })).toMatchObject({ fuel_efficiency: null, mergedRunCount: 0 });
  });

  it("odometer mode merges the derived distance", () => {
    const odo = [
      rec({ id: "a", date: "2025-01-01", odometer: 11750.5, fuel_amount: 30 }),
      rec({ id: "b", date: "2025-01-03", odometer: 11900, fuel_amount: 2, is_full: false }),
    ];
    // b（部分給油）の区間 149.5 km + 新しい区間 100 km → 249.5 ÷ (2 + 5.2) = 34.65
    expect(formState(draft({ odometer: "12000", fuel_amount: "5.2" }), { vehicle: ODO_VEHICLE, records: odo })).toMatchObject({
      fuel_efficiency: 34.65,
      mergedRunCount: 1,
    });
    // 部分給油 (149.5 km, 2.0 L) の後の満タン給油 (250 km, 5.2 L) = 55.49
    expect(formState(draft({ odometer: "12150", fuel_amount: "5.2" }), { vehicle: ODO_VEHICLE, records: odo }).fuel_efficiency).toBe(
      55.49
    );
  });

  it("merges when the combined fuel is positive even if this fill is 0 L (same as the chain's Σfuel > 0)", () => {
    expect(formState(full({ fuel_amount: "0" }), ctx)).toMatchObject({ fuel_efficiency: 199.75, mergedRunCount: 1 });
    const zeroRun = [records[0], { ...records[1], fuel_amount: 0 }];
    expect(formState(full({ fuel_amount: "0" }), { vehicle: TRIP_VEHICLE, records: zeroRun })).toMatchObject({
      fuel_efficiency: null,
      mergedRunCount: 0,
    });
  });

  it("buildRecordInput stores the merged efficiency", () => {
    expect(buildRecordInput(full(), null, null, ctx).fuel_efficiency).toBe(55.49);
    expect(buildRecordInput(full(), null, null, { vehicle: TRIP_VEHICLE }).fuel_efficiency).toBe(48.08);
  });
});

describe("stale base after a missed record (odometer mode)", () => {
  const records = [
    rec({ id: "a", date: "2025-03-01", odometer: 1000, fuel_amount: 20 }),
    rec({ id: "m", date: "2025-03-02", odometer: null, fuel_amount: 20, missed_previous: true }),
  ];

  it("the base is null and marked stale until a record advances it (the form shows AFTER_MISSED_DISTANCE_NOTE)", () => {
    const s = formState(draft({ date: "2025-03-10", odometer: "1600", fuel_amount: "20" }), { vehicle: ODO_VEHICLE, records });
    expect(s.preview).toMatchObject({ base: null, baseStale: true });
    expect(s.parsed.total_distance).toBeNull();
    expect(s.fuel_efficiency).toBeNull();
    // 記録漏れより前の日付へ動かせば基準がある
    const before = formState(draft({ date: "2025-03-01", odometer: "1200", fuel_amount: "20" }), { vehicle: ODO_VEHICLE, records });
    expect(before.preview).toMatchObject({ base: 1000, baseStale: false });
    expect(before.parsed.total_distance).toBe(200);
  });
});

describe("date / odometer changes reposition the record (preview = chain)", () => {
  const records: FuelRecord[] = [
    rec({ id: "a", date: "2025-01-01", odometer: 1000, created_at: "2025-01-01T00:00:00Z" }),
    rec({ id: "b", date: "2025-02-01", odometer: 1500, created_at: "2025-02-01T00:00:00Z" }),
    rec({ id: "c", date: "2025-03-01", odometer: 2000, created_at: "2025-03-01T00:00:00Z" }),
  ];
  const ctx: RecordFormContext = { vehicle: ODO_VEHICLE, records };

  it("new record: the previous odometer follows the date", () => {
    const opened = { date: "2025-03-10" };
    expect(formState(draft({ date: "2025-03-10", odometer: "2100" }), ctx, opened).preview.base).toBe(2000);
    expect(formState(draft({ date: "2025-02-10", odometer: "1800" }), ctx, opened)).toMatchObject({
      preview: { base: 1500 },
      parsed: { total_distance: 300 },
    });
    expect(formState(draft({ date: "2024-12-31", odometer: "900" }), ctx, opened).preview.base).toBeNull();
  });

  it("while the date is invalid or empty (typing), the record stays at the date it was opened with", () => {
    const opened = { date: "2025-03-10" };
    expect(formState(draft({ date: "", odometer: "2100" }), ctx, opened).preview.base).toBe(2000);
    expect(formState(draft({ date: "2025-02", odometer: "2100" }), ctx, opened).preview.base).toBe(2000);
    expect(previewCandidateOf(draft({ date: "2025-0" }), formTargetOf(opened)).date).toBe("2025-03-10");
    expect(previewCandidateOf(draft({ date: " 2025-02-10 " }), formTargetOf(opened)).date).toBe("2025-02-10");
  });

  it("editing: excludes the record itself, wherever it is moved", () => {
    const c = records[2];
    const d = (overrides: Partial<RecordDraft>) => ({ ...recordToDraft(c), ...overrides });
    expect(formState(d({}), ctx, c).preview.base).toBe(1500);
    // 後ろの日付へ動かしても、自分自身（2000）は前回として数えない
    expect(formState(d({ date: "2025-04-01" }), ctx, c).preview.base).toBe(1500);
    expect(formState(d({ date: "2025-01-15", odometer: "1200" }), ctx, c).preview.base).toBe(1000);
    // 編集の候補は id で置き換えるので、新規扱いの候補 ID（created_at の最大値）にはならない
    expect(previewCandidateOf(d({}), formTargetOf(c)).id).toBe("c");
    expect(previewCandidateOf(d({}), formTargetOf({ date: "2025-03-01" }))).not.toHaveProperty("id");
  });
});

describe("same-date position follows the odometer being typed (preview = chain)", () => {
  /** フォームの燃費プレビュー（useRecordForm と同じ手順） */
  const preview = (records: FuelRecord[], vehicle: RecordFormContext["vehicle"], d: RecordDraft) =>
    formState(d, { vehicle, records }).fuel_efficiency;
  /** 保存後に連鎖計算が出す燃費 */
  const chained = (records: FuelRecord[], vehicle: RecordFormContext["vehicle"], d: RecordDraft) => {
    const added = rec({
      ...buildRecordInput(d, null, null, { vehicle, records }),
      id: "new",
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

  it("editing a same-date record keeps its created_at order (only the earlier partial is merged)", () => {
    const records = [
      rec({ id: "z", date: "2026-01-01", total_distance: 100, fuel_amount: 10, created_at: "2026-01-01T00:00:00Z" }),
      rec({ id: "a", date: "2026-01-05", total_distance: 50, fuel_amount: 5, is_full: false, created_at: "2026-01-05T01:00:00Z" }),
      rec({ id: "b", date: "2026-01-05", total_distance: 60, fuel_amount: 6, created_at: "2026-01-05T02:00:00Z" }),
      rec({ id: "c", date: "2026-01-05", total_distance: 40, fuel_amount: 4, is_full: false, created_at: "2026-01-05T03:00:00Z" }),
    ];
    const b = records[2];
    // (50 + 66) ÷ (5 + 6) = 10.55（c は b の後ろなので合算しない）
    const s = formState({ ...recordToDraft(b), total_distance: "66" }, { vehicle: TRIP_VEHICLE, records }, b);
    expect(s).toMatchObject({ fuel_efficiency: 10.55, mergedRunCount: 1 });
    expect(applyFillChain(records.map(r => (r.id === "b" ? { ...r, total_distance: 66 } : r)), TRIP_VEHICLE).find(r => r.id === "b")!
      .fuel_efficiency).toBe(10.55);
  });
});
