import { describe, expect, it } from "vitest";
import { nextTrapIndex } from "@/lib/useFocusTrap";

describe("nextTrapIndex", () => {
  it("末尾で Tab を押すと先頭へ循環する", () => {
    expect(nextTrapIndex(2, 3, false)).toBe(0);
  });

  it("先頭で Shift+Tab を押すと末尾へ循環する", () => {
    expect(nextTrapIndex(0, 3, true)).toBe(2);
  });

  it("途中の要素ではブラウザの既定動作に任せる", () => {
    expect(nextTrapIndex(1, 3, false)).toBeNull();
    expect(nextTrapIndex(1, 3, true)).toBeNull();
  });

  it("フォーカスがコンテナ外にあるときは内側へ引き戻す", () => {
    expect(nextTrapIndex(-1, 3, false)).toBe(0);
    expect(nextTrapIndex(-1, 3, true)).toBe(2);
  });

  it("要素が 1 個だけなら常にその要素へ戻る", () => {
    expect(nextTrapIndex(0, 1, false)).toBe(0);
    expect(nextTrapIndex(0, 1, true)).toBe(0);
  });

  it("要素が 0 個なら null（呼び出し側でコンテナ自身にフォーカスする）", () => {
    expect(nextTrapIndex(-1, 0, false)).toBeNull();
  });
});
