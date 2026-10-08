import { describe, expect, it } from "vitest";
import { resolveShortcutAction, shortcutReadinessOf, type ShortcutReadiness } from "@/lib/scan/shortcuts";

const ALL_READY: ShortcutReadiness = { scan: true, manual: true, shared: true, notice: true };
const NONE_READY: ShortcutReadiness = { scan: false, manual: false, shared: false, notice: false };

describe("resolveShortcutAction", () => {
  it.each(["scan", "manual", "shared", "share-unavailable"] as const)("%s は準備ができていれば実行する", (action) => {
    expect(resolveShortcutAction(action, ALL_READY)).toBe(action);
  });

  it.each(["scan", "manual", "shared", "share-unavailable"] as const)("%s は準備ができるまで待つ", (action) => {
    expect(resolveShortcutAction(action, NONE_READY)).toBe("wait");
  });

  it("アクションごとに自分の条件だけを見る", () => {
    expect(resolveShortcutAction("scan", { ...NONE_READY, scan: true })).toBe("scan");
    expect(resolveShortcutAction("manual", { ...ALL_READY, manual: false })).toBe("wait");
    expect(resolveShortcutAction("shared", { ...ALL_READY, shared: false })).toBe("wait");
    expect(resolveShortcutAction("share-unavailable", { ...NONE_READY, notice: true })).toBe("share-unavailable");
  });

  it.each([null, undefined, "", "unknown", "SCAN"])("対応していない値（%s）は何もしない", (action) => {
    expect(resolveShortcutAction(action, ALL_READY)).toBeNull();
  });
});

describe("shortcutReadinessOf", () => {
  const base = { mounted: true, dataLoading: false, scanning: false, reviewing: false, readOnly: false, authLoaded: true };

  it("読み込み完了・アイドルならすべて実行できる", () => {
    expect(shortcutReadinessOf(base)).toEqual(ALL_READY);
  });

  it("マウント前は何も実行しない", () => {
    expect(shortcutReadinessOf({ ...base, mounted: false })).toEqual(NONE_READY);
  });

  it("データの読み込み中はスキャン・手動入力・共有を待ち、案内は出せる", () => {
    expect(shortcutReadinessOf({ ...base, dataLoading: true })).toEqual({
      scan: false,
      manual: false,
      shared: false,
      notice: true,
    });
  });

  it("スキャン中・確認シート表示中はスキャンと共有を待つが、手動入力はできる", () => {
    for (const state of [{ scanning: true }, { reviewing: true }]) {
      expect(shortcutReadinessOf({ ...base, ...state })).toEqual({ scan: false, manual: true, shared: false, notice: true });
    }
  });

  it("閲覧専用では手動入力だけ待つ", () => {
    expect(shortcutReadinessOf({ ...base, readOnly: true })).toEqual({ ...ALL_READY, manual: false });
  });

  it("共有画像はログイン状態の確定を待つ", () => {
    expect(shortcutReadinessOf({ ...base, authLoaded: false })).toEqual({ ...ALL_READY, shared: false });
  });
});
