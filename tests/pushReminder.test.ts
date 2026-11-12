import { describe, expect, it } from "vitest";
import {
  DEFAULT_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  MIN_INTERVAL_DAYS,
  dayNumber,
  decideReminder,
  isGoneStatus,
  jstDayNumber,
  latestRecord,
  median,
  reminderBody,
  reminderIntervalDays,
  reminderPayload,
  type ReminderRecord,
} from "@/lib/push/reminder";
import { serverVapidConfig } from "@/lib/push/config";

/** 新しい順の記録を、日付の配列から作る */
function recs(...dates: string[]): ReminderRecord[] {
  return dates.map((date, i) => ({ id: `r${i}`, date }));
}

const NONE = { last_notified_record_id: null, last_notified_at: null };
/** 日本時間のその日の正午 */
function jstNoon(date: string): Date {
  return new Date(`${date}T03:00:00Z`);
}

describe("median", () => {
  it("奇数個は中央、偶数個は中央 2 つの平均、空は null", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("dayNumber / jstDayNumber", () => {
  it("不正な日付は null", () => {
    expect(dayNumber("2026-02-30")).toBeNull();
    expect(dayNumber("abc")).toBeNull();
    expect(dayNumber("2026-11-12")! - dayNumber("2026-11-01")!).toBe(11);
  });

  it("日本時間の暦日で数える（UTC 15:00 で日付が変わる）", () => {
    expect(jstDayNumber(new Date("2026-11-12T14:59:00Z"))).toBe(dayNumber("2026-11-12"));
    expect(jstDayNumber(new Date("2026-11-12T15:00:00Z"))).toBe(dayNumber("2026-11-13"));
  });
});

describe("reminderIntervalDays", () => {
  it("記録が 3 件未満なら 14 日", () => {
    expect(reminderIntervalDays([])).toBe(DEFAULT_INTERVAL_DAYS);
    expect(reminderIntervalDays(recs("2026-11-10", "2026-11-01"))).toBe(DEFAULT_INTERVAL_DAYS);
  });

  it("3 件以上なら間隔の中央値", () => {
    // 間隔 10, 7, 9 → 中央値 9
    expect(reminderIntervalDays(recs("2026-11-26", "2026-11-16", "2026-11-09", "2026-10-31"))).toBe(9);
    // 間隔 6, 10 → 8
    expect(reminderIntervalDays(recs("2026-11-17", "2026-11-11", "2026-11-01"))).toBe(8);
  });

  it("並び順に依らず、同じ日の記録（間隔 0）は除く", () => {
    expect(reminderIntervalDays(recs("2026-11-01", "2026-11-21", "2026-11-11", "2026-11-11"))).toBe(10);
  });

  it("正の間隔が無ければ 14 日", () => {
    expect(reminderIntervalDays(recs("2026-11-01", "2026-11-01", "2026-11-01"))).toBe(DEFAULT_INTERVAL_DAYS);
  });

  it("下限と上限に収める", () => {
    expect(reminderIntervalDays(recs("2026-11-03", "2026-11-02", "2026-11-01"))).toBe(MIN_INTERVAL_DAYS);
    expect(reminderIntervalDays(recs("2026-12-31", "2026-06-01", "2026-01-01"))).toBe(MAX_INTERVAL_DAYS);
  });

  it("中央値は直近 11 件だけで計算する", () => {
    // 直近 11 件は 7 日おき、それより古い記録は 30 日おき
    const recent = Array.from({ length: 11 }, (_, i) => new Date(Date.UTC(2026, 10, 30) - i * 7 * 86400000));
    const old = Array.from({ length: 10 }, (_, i) => new Date(recent[10].getTime() - (i + 1) * 30 * 86400000));
    const dates = [...recent, ...old].map(d => d.toISOString().slice(0, 10));
    expect(reminderIntervalDays(recs(...dates))).toBe(7);
  });
});

describe("latestRecord", () => {
  it("日付が最も新しい記録。同じ日なら先にあるもの", () => {
    const list = [
      { id: "a", date: "2026-11-01" },
      { id: "b", date: "2026-11-05" },
      { id: "c", date: "2026-11-05" },
    ];
    expect(latestRecord(list)?.id).toBe("b");
    expect(latestRecord([{ id: "x", date: "bad" }])).toBeNull();
  });
});

describe("decideReminder", () => {
  it("記録が無ければ送らない", () => {
    expect(decideReminder([], NONE, jstNoon("2026-11-12"))).toEqual({ send: false, reason: "no-records" });
  });

  it("記録が少ないうちは 14 日目から送る", () => {
    const list = recs("2026-11-01");
    expect(decideReminder(list, NONE, jstNoon("2026-11-14"))).toEqual({ send: false, reason: "too-early" });
    expect(decideReminder(list, NONE, jstNoon("2026-11-15"))).toEqual({
      send: true,
      recordId: "r0",
      daysSince: 14,
      intervalDays: 14,
    });
  });

  it("中央値の間隔を過ぎた日に送る", () => {
    const list = recs("2026-11-17", "2026-11-11", "2026-11-01"); // 8 日
    expect(decideReminder(list, NONE, jstNoon("2026-11-24")).send).toBe(false);
    expect(decideReminder(list, NONE, jstNoon("2026-11-25"))).toMatchObject({ send: true, daysSince: 8 });
  });

  it("Cron が遅れても、間隔を過ぎていれば送る", () => {
    expect(decideReminder(recs("2026-11-01"), NONE, jstNoon("2026-11-20"))).toMatchObject({ send: true, daysSince: 19 });
  });

  it("同じ記録には 2 回送らない", () => {
    const list = recs("2026-11-01");
    const state = { last_notified_record_id: "r0", last_notified_at: "2026-11-15T09:00:00Z" };
    expect(decideReminder(list, state, jstNoon("2026-11-30"))).toEqual({ send: false, reason: "already-sent" });
  });

  it("新しい記録が増えれば、その記録について改めて送る", () => {
    const list = [{ id: "new", date: "2026-11-16" }, { id: "r0", date: "2026-11-01" }];
    const state = { last_notified_record_id: "r0", last_notified_at: "2026-11-15T09:00:00Z" };
    expect(decideReminder(list, state, jstNoon("2026-11-30"))).toMatchObject({ send: true, recordId: "new", daysSince: 14 });
  });

  it("最後に送ってから 20 時間以内は送らない（Cron の二重実行）", () => {
    const list = [{ id: "new", date: "2026-10-01" }];
    const state = { last_notified_record_id: "old", last_notified_at: "2026-11-12T00:00:00Z" };
    expect(decideReminder(list, state, new Date("2026-11-12T10:00:00Z"))).toEqual({ send: false, reason: "cooldown" });
    expect(decideReminder(list, state, new Date("2026-11-12T21:00:00Z")).send).toBe(true);
  });
});

describe("文言と購読の無効化", () => {
  it("本文は日数を入れた日本語、タップ先はスキャン", () => {
    expect(reminderBody(16)).toBe("前回の給油から 16 日です。給油したらレシートとメーターを撮っておきましょう");
    expect(reminderPayload(16)).toMatchObject({ url: "/app?action=scan", title: "給油のお知らせ" });
  });

  it("404 / 410 だけを「もう届かない」とみなす", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});

describe("serverVapidConfig", () => {
  const full = { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@example.com" };
  it("3 つ揃っていれば設定を返す", () => {
    expect(serverVapidConfig(full)).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:a@example.com" });
  });
  it("どれかが無い・subject が不正なら null（機能を無効にする）", () => {
    expect(serverVapidConfig({ ...full, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(serverVapidConfig({ ...full, NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined })).toBeNull();
    expect(serverVapidConfig({ ...full, VAPID_SUBJECT: "a@example.com" })).toBeNull();
  });
});
