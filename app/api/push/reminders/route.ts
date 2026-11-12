import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { serverVapidConfig } from "@/lib/push/config";
import { MAX_RECORDS_FOR_INTERVAL, type ReminderRecord } from "@/lib/push/reminder";
import { runReminders, type PushSubscriptionRow } from "@/lib/server/push/reminderHandler";

/**
 * GET /api/push/reminders
 *
 * 給油のお知らせ（Web Push）を送る。Vercel Cron（vercel.json）から 1 日 1 回呼ばれる。
 * 判定は lib/push/reminder.ts（純粋関数）、送信の流れは lib/server/push/reminderHandler.ts。
 *
 * 認証: /api/keepalive と同じ `Authorization: Bearer <CRON_SECRET>`（未設定なら 500）。
 * 機能の有効化: VAPID の鍵（NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）と
 *   SUPABASE_SERVICE_ROLE_KEY が揃っているときだけ送る。足りなければ何もせず 200 { skipped } を返す（壊れない）。
 * 全員分の記録を読むので service_role キー（RLS を迂回）を使う。読む列は必要なものだけ
 * （push_subscriptions の送信に使う列、fuel_records の id / date）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** プッシュサービスへの 1 件あたりの送信の上限時間 */
const SEND_TIMEOUT_MS = 10_000;
/** 届かなかったときにプッシュサービスが保持する時間（秒）。翌日まで残しても意味が薄いので半日 */
const PUSH_TTL_SEC = 12 * 60 * 60;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[push] CRON_SECRET が設定されていません");
    return NextResponse.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const authHeader = request.headers.get("authorization") ?? "";
  if (!safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const vapid = serverVapidConfig({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  });
  if (!vapid) {
    return NextResponse.json({ ok: true, skipped: "vapid_not_configured" });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 空文字も未設定として扱う（keepalive と同じ）
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("[push] NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定のため送信しません");
    return NextResponse.json({ ok: true, skipped: "service_role_not_configured" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const startedAt = Date.now();
  try {
    const summary = await runReminders({
      listSubscriptions: async () => {
        const { data, error, status } = await supabase
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth, last_notified_record_id, last_notified_at")
          .eq("enabled", true);
        if (error) throw Object.assign(new Error(error.message), { status, code: error.code });
        return (data ?? []) as PushSubscriptionRow[];
      },
      listRecords: async userId => {
        const { data, error } = await supabase
          .from("fuel_records")
          .select("id, date")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(MAX_RECORDS_FOR_INTERVAL);
        if (error) throw new Error(error.message);
        return (data ?? []) as ReminderRecord[];
      },
      markSent: async (id, recordId, sentAtIso) => {
        const { error } = await supabase
          .from("push_subscriptions")
          .update({ last_notified_record_id: recordId, last_notified_at: sentAtIso, updated_at: sentAtIso })
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      deactivate: async id => {
        const { error } = await supabase
          .from("push_subscriptions")
          .update({ enabled: false, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      send: async (sub, payload) => {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: PUSH_TTL_SEC, urgency: "normal", timeout: SEND_TIMEOUT_MS }
        );
      },
      now: () => new Date(),
      log: (level, ...args) => console[level](...args),
    });
    console.log("[push] 給油のお知らせ:", summary);
    return NextResponse.json({ ok: true, ...summary, elapsed_ms: Date.now() - startedAt });
  } catch (e) {
    // 購読の一覧が読めない（Supabase の停止 = 540、マイグレーション未適用など）
    const status = (e as { status?: unknown } | null)?.status;
    console.error("[push] 購読の読み込みに失敗:", e);
    const upstream = typeof status === "number" && (status === 0 || status >= 500);
    return NextResponse.json(
      { ok: false, paused: status === 540, error: "Failed to load subscriptions" },
      { status: upstream ? 503 : 502 }
    );
  }
}
