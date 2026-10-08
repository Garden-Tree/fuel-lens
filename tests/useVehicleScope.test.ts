import { describe, expect, it } from "vitest";
import { combineScopeLoading, composeScopeError, scopeKeyOf } from "@/lib/useVehicleScope";

describe("scopeKeyOf", () => {
  it("車両 ID と距離の入力方式を ':' でつなぐ", () => {
    expect(scopeKeyOf("v1", "trip")).toBe("v1:trip");
    expect(scopeKeyOf("v1", "odometer")).toBe("v1:odometer");
  });

  it("車両または方式が変われば別のキーになる", () => {
    expect(scopeKeyOf("v1", "trip")).not.toBe(scopeKeyOf("v2", "trip"));
    expect(scopeKeyOf("v1", "trip")).not.toBe(scopeKeyOf("v1", "odometer"));
  });
});

describe("composeScopeError", () => {
  it("車両のエラーを優先する", () => {
    expect(composeScopeError("車両エラー", "記録エラー")).toBe("車両エラー");
  });

  it("車両のエラーが無ければ記録のエラー", () => {
    expect(composeScopeError(null, "記録エラー")).toBe("記録エラー");
    expect(composeScopeError(undefined, "記録エラー")).toBe("記録エラー");
  });

  it("空文字はエラーなしとして扱い、どちらも無ければ null", () => {
    expect(composeScopeError("", "記録エラー")).toBe("記録エラー");
    expect(composeScopeError(null, null)).toBeNull();
    expect(composeScopeError("", "")).toBeNull();
  });
});

describe("combineScopeLoading", () => {
  it("一覧を読むときは車両か記録のどちらかが読み込み中なら true", () => {
    expect(combineScopeLoading(true, false, true)).toBe(true);
    expect(combineScopeLoading(false, true, true)).toBe(true);
    expect(combineScopeLoading(false, false, true)).toBe(false);
  });

  it("一覧を読まない（list: false）なら記録の読み込みは待たない", () => {
    expect(combineScopeLoading(false, true, false)).toBe(false);
    expect(combineScopeLoading(true, true, false)).toBe(true);
  });
});
