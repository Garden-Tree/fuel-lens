/**
 * 給油のお知らせ（Web Push）の「送るかどうか」の判定。純粋関数（DB・時計・web-push に触れない）。
 * 送信の本体は lib/server/push/reminderHandler.ts、Cron の入口は app/api/push/reminders/route.ts。
 *
 * 規則:
 * - 間隔 = 記録が 3 件以上なら、直近の記録どうしの間隔（日。0 日 = 同じ日の記録は除く）の中央値。
 *   足りなければ（記録が 2 件以下、または正の間隔が 1 つも無い）DEFAULT_INTERVAL_DAYS（14 日）。
 *   中央値は整数日に丸め、MIN_INTERVAL_DAYS〜MAX_INTERVAL_DAYS に収める（毎日のように通知しないため）。
 * - 最後の記録の日から間隔以上たった日に送る。同じ記録（最後に送った record id）には 2 回送らない。
 * - Cron の二重実行に備え、最後に送ってから SEND_COOLDOWN_HOURS 時間以内は送らない。
 * - 日付は日本時間（JST）の暦日で数える（記録の date は利用者の端末の "YYYY-MM-DD"）。
 */

export const DEFAULT_INTERVAL_DAYS = 14;
export const MIN_INTERVAL_DAYS = 3;
export const MAX_INTERVAL_DAYS = 60;
/** 中央値の計算に使う最大の記録数（直近の習慣を反映させる。サーバーもこの件数だけ読む） */
export const MAX_RECORDS_FOR_INTERVAL = 11;
/** 記録がこの件数以上あれば中央値を使う */
export const MIN_RECORDS_FOR_MEDIAN = 3;
export const SEND_COOLDOWN_HOURS = 20;

/** 通知をタップしたときに開く URL（スキャンを始める） */
export const REMINDER_URL = "/app?action=scan";
export const REMINDER_TITLE = "給油のお知らせ";
/** 同じ端末に溜まらないよう、通知を置き換えるタグ */
export const REMINDER_TAG = "fuel-lens-refuel-reminder";

export type ReminderRecord = { id: string; date: string };

export type ReminderSubscriptionState = {
  last_notified_record_id: string | null;
  last_notified_at: string | null;
};

export type ReminderDecision =
  | { send: false; reason: "no-records" | "invalid-date" | "too-early" | "already-sent" | "cooldown" }
  | { send: true; recordId: string; daysSince: number; intervalDays: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD"（先頭 10 文字）を暦日の通し番号（1970-01-01 からの日数）にする。不正なら null */
export function dayNumber(date: string): number | null {
  const m = DATE_RE.exec(String(date).slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(t / DAY_MS);
}

/** 日本時間での今日の暦日の通し番号 */
export function jstDayNumber(now: Date): number {
  return Math.floor((now.getTime() + JST_OFFSET_MS) / DAY_MS);
}

/** 数値の中央値（空なら null。偶数個なら中央 2 つの平均） */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 記録の日付を新しい順に並べた通し番号（不正な日付は除く） */
function sortedDayNumbers(records: readonly ReminderRecord[]): number[] {
  return records
    .map(r => dayNumber(r.date))
    .filter((n): n is number => n !== null)
    .sort((a, b) => b - a);
}

/**
 * その人の給油の間隔（日）。記録が MIN_RECORDS_FOR_MEDIAN 件以上なら直近 MAX_RECORDS_FOR_INTERVAL 件の間隔の中央値、
 * 足りなければ DEFAULT_INTERVAL_DAYS。結果は MIN_INTERVAL_DAYS〜MAX_INTERVAL_DAYS に収める。
 */
export function reminderIntervalDays(records: readonly ReminderRecord[]): number {
  const days = sortedDayNumbers(records).slice(0, MAX_RECORDS_FOR_INTERVAL);
  if (days.length < MIN_RECORDS_FOR_MEDIAN) return DEFAULT_INTERVAL_DAYS;
  const gaps: number[] = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const gap = days[i] - days[i + 1];
    if (gap > 0) gaps.push(gap);
  }
  const m = median(gaps);
  if (m === null) return DEFAULT_INTERVAL_DAYS;
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, Math.round(m)));
}

/** 最も新しい記録（日付が同じなら配列の先にあるもの = サーバーが created_at の新しい順に渡したもの） */
export function latestRecord(records: readonly ReminderRecord[]): ReminderRecord | null {
  let best: ReminderRecord | null = null;
  let bestDay = -Infinity;
  for (const r of records) {
    const n = dayNumber(r.date);
    if (n === null) continue;
    if (n > bestDay) {
      best = r;
      bestDay = n;
    }
  }
  return best;
}

/**
 * この購読（端末）に今日お知らせを送るか。
 * @param records その利用者の記録（新しい順。全車両分）
 */
export function decideReminder(
  records: readonly ReminderRecord[],
  state: ReminderSubscriptionState,
  now: Date
): ReminderDecision {
  if (records.length === 0) return { send: false, reason: "no-records" };
  const latest = latestRecord(records);
  if (!latest) return { send: false, reason: "invalid-date" };
  if (state.last_notified_record_id === latest.id) return { send: false, reason: "already-sent" };

  if (state.last_notified_at) {
    const last = Date.parse(state.last_notified_at);
    if (Number.isFinite(last) && now.getTime() - last < SEND_COOLDOWN_HOURS * 60 * 60 * 1000) {
      return { send: false, reason: "cooldown" };
    }
  }

  const intervalDays = reminderIntervalDays(records);
  const daysSince = jstDayNumber(now) - (dayNumber(latest.date) as number);
  if (daysSince < intervalDays) return { send: false, reason: "too-early" };
  return { send: true, recordId: latest.id, daysSince, intervalDays };
}

/** 通知の本文 */
export function reminderBody(daysSince: number): string {
  return `前回の給油から ${daysSince} 日です。給油したらレシートとメーターを撮っておきましょう`;
}

/** Service Worker（public/sw.js）に渡す JSON。sw.js はこの形だけを読む */
export type ReminderPayload = { title: string; body: string; url: string; tag: string };

export function reminderPayload(daysSince: number): ReminderPayload {
  return { title: REMINDER_TITLE, body: reminderBody(daysSince), url: REMINDER_URL, tag: REMINDER_TAG };
}

/** プッシュサービスの応答がこの状態なら、購読はもう使えない（無効にする） */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
