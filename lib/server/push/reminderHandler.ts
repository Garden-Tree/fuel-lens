import {
  decideReminder,
  isGoneStatus,
  reminderPayload,
  type ReminderRecord,
  type ReminderSubscriptionState,
} from "@/lib/push/reminder";

/**
 * 給油のお知らせの送信本体（GET /api/push/reminders から 1 日 1 回呼ばれる）。
 * DB と web-push は依存として注入する（tests/pushReminderHandler.test.ts）。
 *
 * 1. 有効な購読（push_subscriptions.enabled = true）を読む
 * 2. 利用者ごとに直近の記録（id と date だけ）を読み、購読ごとに decideReminder で送るか決める
 * 3. 送れたら最後に送った記録と日時を保存する。404 / 410 が返った購読は無効にする（enabled = false）
 *
 * 1 件の失敗で全体を止めない（その購読・利用者を飛ばして続ける）。エンドポイントや鍵はログに出さない（購読の id だけ）。
 */

export type PushSubscriptionRow = ReminderSubscriptionState & {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type ReminderDeps = {
  listSubscriptions: () => Promise<PushSubscriptionRow[]>;
  /** その利用者の記録を新しい順に（date desc, created_at desc）。件数は MAX_RECORDS_FOR_INTERVAL まででよい */
  listRecords: (userId: string) => Promise<ReminderRecord[]>;
  markSent: (subscriptionId: string, recordId: string, sentAtIso: string) => Promise<void>;
  deactivate: (subscriptionId: string) => Promise<void>;
  /** 送信する。失敗時は statusCode（プッシュサービスの HTTP ステータス）付きのエラーを投げる（web-push の WebPushError） */
  send: (subscription: PushSubscriptionRow, payload: string) => Promise<void>;
  now: () => Date;
  log: (level: "log" | "warn" | "error", ...args: unknown[]) => void;
};

export type ReminderSummary = {
  subscriptions: number;
  users: number;
  sent: number;
  skipped: number;
  deactivated: number;
  failed: number;
};

function statusCodeOf(e: unknown): number | undefined {
  const code = (e as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : undefined;
}

export async function runReminders(deps: ReminderDeps): Promise<ReminderSummary> {
  const subscriptions = await deps.listSubscriptions();
  const byUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = byUser.get(sub.user_id);
    if (list) list.push(sub);
    else byUser.set(sub.user_id, [sub]);
  }

  const summary: ReminderSummary = {
    subscriptions: subscriptions.length,
    users: byUser.size,
    sent: 0,
    skipped: 0,
    deactivated: 0,
    failed: 0,
  };
  const now = deps.now();

  for (const [userId, subs] of byUser) {
    let records: ReminderRecord[];
    try {
      records = await deps.listRecords(userId);
    } catch (e) {
      deps.log("error", "[push] 記録の読み込みに失敗:", e);
      summary.failed += subs.length;
      continue;
    }

    for (const sub of subs) {
      const decision = decideReminder(records, sub, now);
      if (!decision.send) {
        summary.skipped += 1;
        continue;
      }
      try {
        await deps.send(sub, JSON.stringify(reminderPayload(decision.daysSince)));
      } catch (e) {
        const status = statusCodeOf(e);
        if (isGoneStatus(status)) {
          try {
            await deps.deactivate(sub.id);
            summary.deactivated += 1;
          } catch (err) {
            deps.log("error", "[push] 購読の無効化に失敗:", sub.id, err);
            summary.failed += 1;
          }
        } else {
          deps.log("error", "[push] 送信に失敗:", sub.id, status ?? e);
          summary.failed += 1;
        }
        continue;
      }
      summary.sent += 1;
      try {
        await deps.markSent(sub.id, decision.recordId, now.toISOString());
      } catch (e) {
        // 送信は済んでいる。保存できなかった場合は次の Cron で同じ記録にもう一度送ることがある（ログで気付けるようにする）
        deps.log("error", "[push] 送信済みの記録に失敗:", sub.id, e);
      }
    }
  }

  return summary;
}
