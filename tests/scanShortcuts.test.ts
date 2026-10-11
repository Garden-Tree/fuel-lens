import { describe, expect, it } from "vitest";
import {
  SHORTCUT_ACTIONS,
  blockedActionMessage,
  resolveShortcutAction,
  scanMenuAvailabilityOf,
  shortcutReadinessOf,
  type ShortcutReadiness,
} from "@/lib/scan/shortcuts";

const ALL_READY: ShortcutReadiness = { evaluable: true, scanBlock: null, manualBlock: null, shared: true, notice: true };
const NOT_MOUNTED: ShortcutReadiness = {
  evaluable: false,
  scanBlock: "loading",
  manualBlock: "loading",
  shared: false,
  notice: false,
};

describe("resolveShortcutAction", () => {
  it.each(SHORTCUT_ACTIONS)("%s は準備ができていれば実行する", (action) => {
    expect(resolveShortcutAction(action, ALL_READY)).toEqual({ type: "run", action });
  });

  it.each(SHORTCUT_ACTIONS)("%s はマウント前なら待つ", (action) => {
    expect(resolveShortcutAction(action, NOT_MOUNTED)).toEqual({ type: "wait" });
  });

  it("撮影・アルバムは解析中・確認中なら待たずに取り下げ、理由を返す", () => {
    const scanning = { ...ALL_READY, scanBlock: "scanning", manualBlock: "scanning", shared: false } as const;
    expect(resolveShortcutAction("scan", scanning)).toEqual({ type: "drop", message: "読み取り中のため撮影を開始できません" });
    expect(resolveShortcutAction("album", scanning)).toEqual({ type: "drop", message: "読み取り中のためアルバムを開けません" });
    const reviewing = { ...ALL_READY, scanBlock: "reviewing", manualBlock: "reviewing", shared: false } as const;
    expect(resolveShortcutAction("scan", reviewing)).toEqual({
      type: "drop",
      message: "読み取り結果の確認中のため撮影を開始できません",
    });
    expect(resolveShortcutAction("manual", reviewing)).toEqual({
      type: "drop",
      message: "読み取り結果の確認中のため手動入力はできません",
    });
  });

  it("閲覧専用では手動入力だけ取り下げる（撮影は実行する）", () => {
    const readOnly = { ...ALL_READY, manualBlock: "readOnly" } as const;
    expect(resolveShortcutAction("manual", readOnly)).toEqual({ type: "drop", message: "閲覧専用のため手動入力はできません" });
    expect(resolveShortcutAction("scan", readOnly)).toEqual({ type: "run", action: "scan" });
  });

  it("共有画像は取り下げずに条件がそろうまで待つ。案内はマウント後ならいつでも出す", () => {
    const scanning = { ...ALL_READY, scanBlock: "scanning", manualBlock: "scanning", shared: false } as const;
    expect(resolveShortcutAction("shared", scanning)).toEqual({ type: "wait" });
    expect(resolveShortcutAction("share-unavailable", scanning)).toEqual({ type: "run", action: "share-unavailable" });
  });

  it.each([null, undefined, "", "unknown", "SCAN", "ALBUM"])("対応していない値（%s）は何もしない", (action) => {
    expect(resolveShortcutAction(action, ALL_READY)).toBeNull();
  });
});

describe("blockedActionMessage", () => {
  it("読み込み中の文言", () => {
    expect(blockedActionMessage("scan", "loading")).toBe("読み込み中のため撮影を開始できません");
  });
});

describe("shortcutReadinessOf", () => {
  const base = { mounted: true, dataLoading: false, scanning: false, reviewing: false, readOnly: false, authLoaded: true };

  it("読み込み完了・アイドルならすべて実行できる", () => {
    expect(shortcutReadinessOf(base)).toEqual(ALL_READY);
  });

  it("マウント前は何も判定しない", () => {
    expect(shortcutReadinessOf({ ...base, mounted: false })).toEqual(NOT_MOUNTED);
  });

  it("データの読み込み中は撮影・手動入力・共有を判定できず、案内は出せる", () => {
    expect(shortcutReadinessOf({ ...base, dataLoading: true })).toEqual({
      evaluable: false,
      scanBlock: "loading",
      manualBlock: "loading",
      shared: false,
      notice: true,
    });
  });

  it("スキャン中・確認シート表示中は撮影も手動入力も始められない（確認シートの裏でフォームを開かない）", () => {
    expect(shortcutReadinessOf({ ...base, scanning: true })).toEqual({
      evaluable: true,
      scanBlock: "scanning",
      manualBlock: "scanning",
      shared: false,
      notice: true,
    });
    expect(shortcutReadinessOf({ ...base, reviewing: true })).toMatchObject({
      scanBlock: "reviewing",
      manualBlock: "reviewing",
      shared: false,
    });
  });

  it("閲覧専用では手動入力だけ始められない", () => {
    expect(shortcutReadinessOf({ ...base, readOnly: true })).toEqual({ ...ALL_READY, manualBlock: "readOnly" });
  });

  it("共有画像はログイン状態の確定を待つ", () => {
    expect(shortcutReadinessOf({ ...base, authLoaded: false })).toEqual({ ...ALL_READY, shared: false });
  });
});

describe("scanMenuAvailabilityOf", () => {
  it("すべて押せるなら理由は null", () => {
    expect(scanMenuAvailabilityOf(ALL_READY)).toEqual({ canScan: true, canManual: true, disabledReason: null });
  });

  it("閲覧専用では手動入力だけ無効にし、理由を添える", () => {
    expect(scanMenuAvailabilityOf({ ...ALL_READY, manualBlock: "readOnly" })).toEqual({
      canScan: true,
      canManual: false,
      disabledReason: "閲覧専用のため手動入力はできません",
    });
  });

  it("解析中はすべて無効", () => {
    const r = scanMenuAvailabilityOf({ ...ALL_READY, scanBlock: "scanning", manualBlock: "scanning", shared: false });
    expect(r.canScan).toBe(false);
    expect(r.canManual).toBe(false);
    expect(r.disabledReason).toMatch(/読み取り中/);
  });
});
