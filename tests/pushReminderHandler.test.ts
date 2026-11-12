import { describe, expect, it, vi } from "vitest";
import { runReminders, type PushSubscriptionRow, type ReminderDeps } from "@/lib/server/push/reminderHandler";
import type { ReminderRecord } from "@/lib/push/reminder";

function sub(id: string, userId: string, extra: Partial<PushSubscriptionRow> = {}): PushSubscriptionRow {
  return {
    id,
    user_id: userId,
    endpoint: `https://push.example.com/${id}`,
    p256dh: "p",
    auth: "a",
    last_notified_record_id: null,
    last_notified_at: null,
    ...extra,
  };
}

function makeDeps(
  subs: PushSubscriptionRow[],
  records: Record<string, ReminderRecord[]>,
  send: ReminderDeps["send"] = async () => undefined
) {
  const deps = {
    listSubscriptions: vi.fn(async () => subs),
    listRecords: vi.fn(async (userId: string) => records[userId] ?? []),
    markSent: vi.fn(async () => undefined),
    deactivate: vi.fn(async () => undefined),
    send: vi.fn(send),
    now: () => new Date("2026-11-20T09:00:00Z"),
    log: vi.fn(),
  };
  return deps;
}

describe("runReminders", () => {
  it("間隔を過ぎた購読にだけ送り、送った記録を保存する", async () => {
    const deps = makeDeps([sub("s1", "u1"), sub("s2", "u2")], {
      u1: [{ id: "rec1", date: "2026-11-01" }], // 19 日 → 送る
      u2: [{ id: "rec2", date: "2026-11-15" }], // 5 日 → まだ
    });
    const summary = await runReminders(deps);
    expect(summary).toMatchObject({ subscriptions: 2, users: 2, sent: 1, skipped: 1, deactivated: 0, failed: 0 });
    expect(deps.send).toHaveBeenCalledTimes(1);
    const [target, payload] = deps.send.mock.calls[0];
    expect(target.id).toBe("s1");
    expect(JSON.parse(payload)).toMatchObject({ body: expect.stringContaining("19 日"), url: "/app?action=scan" });
    expect(deps.markSent).toHaveBeenCalledWith("s1", "rec1", "2026-11-20T09:00:00.000Z");
  });

  it("同じ利用者の記録は 1 回だけ読み、端末ごとに送る", async () => {
    const deps = makeDeps([sub("s1", "u1"), sub("s2", "u1")], { u1: [{ id: "rec1", date: "2026-11-01" }] });
    const summary = await runReminders(deps);
    expect(deps.listRecords).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(2);
  });

  it("同じ記録に送り済みの購読には送らない", async () => {
    const deps = makeDeps([sub("s1", "u1", { last_notified_record_id: "rec1", last_notified_at: "2026-11-15T09:00:00Z" })], {
      u1: [{ id: "rec1", date: "2026-11-01" }],
    });
    const summary = await runReminders(deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it("404 / 410 が返った購読は無効にし、保存しない", async () => {
    const gone = Object.assign(new Error("gone"), { statusCode: 410 });
    const notFound = Object.assign(new Error("nf"), { statusCode: 404 });
    const errors: Record<string, Error> = { s1: gone, s2: notFound };
    const deps = makeDeps(
      [sub("s1", "u1"), sub("s2", "u1")],
      { u1: [{ id: "rec1", date: "2026-11-01" }] },
      async target => {
        throw errors[target.id];
      }
    );
    const summary = await runReminders(deps);
    expect(deps.deactivate).toHaveBeenCalledWith("s1");
    expect(deps.deactivate).toHaveBeenCalledWith("s2");
    expect(deps.markSent).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ sent: 0, deactivated: 2, failed: 0 });
  });

  it("それ以外の失敗は無効にせず、ほかの購読の送信を続ける", async () => {
    const deps = makeDeps(
      [sub("s1", "u1"), sub("s2", "u2")],
      { u1: [{ id: "a", date: "2026-11-01" }], u2: [{ id: "b", date: "2026-11-01" }] },
      async target => {
        if (target.id === "s1") throw Object.assign(new Error("busy"), { statusCode: 429 });
      }
    );
    const summary = await runReminders(deps);
    expect(deps.deactivate).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
  });

  it("記録を読めなかった利用者は飛ばす", async () => {
    const deps = makeDeps([sub("s1", "u1"), sub("s2", "u2")], { u2: [{ id: "b", date: "2026-11-01" }] });
    deps.listRecords.mockImplementationOnce(async () => {
      throw new Error("db");
    });
    const summary = await runReminders(deps);
    expect(summary).toMatchObject({ sent: 1, failed: 1 });
  });
});
