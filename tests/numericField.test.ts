import { describe, expect, it } from "vitest";
import { parseIntInRange, parsePositiveField } from "@/lib/numericField";

describe("parsePositiveField", () => {
  it("空欄はエラーにしない", () => {
    expect(parsePositiveField("燃費", "")).toEqual({ value: null });
    expect(parsePositiveField("燃費", "  ")).toEqual({ value: null });
  });

  it("全角・桁区切りを正規化して読む", () => {
    expect(parsePositiveField("走行距離", "１,２３４．５")).toEqual({ value: 1234.5 });
  });

  it("読めない・負数は「数値で入力」", () => {
    expect(parsePositiveField("燃費", "abc")).toEqual({ value: null, error: "燃費は数値で入力してください" });
    expect(parsePositiveField("燃費", "-3")).toEqual({ value: null, error: "燃費は数値で入力してください" });
  });

  it("0 は既定でエラー、allowZero なら受け付ける", () => {
    expect(parsePositiveField("給油量", "0")).toEqual({ value: null, error: "給油量は 0 より大きい数値で入力してください" });
    expect(parsePositiveField("支払総額", "0", { allowZero: true })).toEqual({ value: 0 });
  });

  it("max を超えたら 3 桁区切りの上限を出す（max ちょうどは通す）", () => {
    expect(parsePositiveField("走行距離", "100000", { max: 100_000 })).toEqual({ value: 100_000 });
    expect(parsePositiveField("走行距離", "100001", { max: 100_000 })).toEqual({
      value: null,
      error: "走行距離は 100,000 以下で入力してください",
    });
  });
});

describe("parseIntInRange", () => {
  it("空欄は empty（既定 null）をエラーなしで返す", () => {
    expect(parseIntInRange("出勤日数", "", 1, 31)).toEqual({ value: null });
    expect(parseIntInRange("人数", "", 1, 99, { empty: 1 })).toEqual({ value: 1 });
  });

  it("範囲内の整数を返す（境界を含む）", () => {
    expect(parseIntInRange("人数", "1", 1, 99)).toEqual({ value: 1 });
    expect(parseIntInRange("人数", "９９", 1, 99)).toEqual({ value: 99 });
  });

  it("範囲外・小数・読めない値は empty と既定の文言", () => {
    const error = "出勤日数は 1〜31 の整数で入力してください";
    expect(parseIntInRange("出勤日数", "0", 1, 31)).toEqual({ value: null, error });
    expect(parseIntInRange("出勤日数", "32", 1, 31)).toEqual({ value: null, error });
    expect(parseIntInRange("出勤日数", "1.5", 1, 31)).toEqual({ value: null, error });
    expect(parseIntInRange("出勤日数", "x", 1, 31)).toEqual({ value: null, error });
    expect(parseIntInRange("人数", "100", 1, 99, { empty: 1 })).toEqual({
      value: 1,
      error: "人数は 1〜99 の整数で入力してください",
    });
  });

  it("既定の文言は 3 桁区切り、message で文全体を差し替えられる", () => {
    expect(parseIntInRange("回数", "-1", 0, 10_000).error).toBe("回数は 0〜10,000 の整数で入力してください");
    expect(parseIntInRange("高速代など", "1.5", 0, 100, { empty: 0, message: "独自の文言" })).toEqual({
      value: 0,
      error: "独自の文言",
    });
  });
});
