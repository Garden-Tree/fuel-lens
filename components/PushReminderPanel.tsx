"use client";

import { useEffect, useId, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { captionClass } from "@/components/settingsUi";
import { useToast } from "@/components/Toast";
import { GroupedList, Section } from "@/components/ui";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { clientVapidPublicKey } from "@/lib/push/config";
import { disablePush, enablePush, PushSetupError, readPushEnabled } from "@/lib/push/browser";
import { DEFAULT_INTERVAL_DAYS } from "@/lib/push/reminder";
import { detectPushSupport, IOS_PUSH_NOTE, type PushSupport } from "@/lib/push/support";

export interface PushReminderPanelProps {
  /** 閲覧専用（クラウド障害中）。切り替えを無効にする */
  readOnly: boolean;
}

function readSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean };
  return detectPushSupport({
    userAgent: nav.userAgent,
    platform: nav.platform ?? "",
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    hasServiceWorker: "serviceWorker" in nav,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    standalone: window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true,
    permission: "Notification" in window ? Notification.permission : null,
  });
}

/**
 * 設定画面の「給油のお知らせ」（Web Push）。ログイン中で、VAPID の公開鍵が設定されているときだけ出す。
 * オンにすると通知の許可を求めて購読を保存し、サーバーの Cron（/api/push/reminders）が
 * 前回の給油からいつもの間隔を過ぎた日に 1 回だけ通知する（lib/push/reminder.ts）。
 */
export default function PushReminderPanel({ readOnly }: PushReminderPanelProps) {
  const { isSignedIn, userId, getToken } = useAuth();
  const { toast } = useToast();
  const labelId = useId();
  const hintId = useId();
  const vapidKey = clientVapidPublicKey();

  // ブラウザの値はマウント後に読む（サーバー描画と一致させる）
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!vapidKey || !isSignedIn || !userId) return;
    let cancelled = false;
    const s = readSupport();
    setSupport(s);
    if (!s.ok) {
      setLoading(false);
      return;
    }
    setLoading(true);
    readPushEnabled(getSupabaseClient(userId, getToken), userId)
      .then(on => {
        if (!cancelled) setEnabled(on);
      })
      .catch(e => console.error("お知らせの状態を確認できませんでした:", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vapidKey, isSignedIn, userId, getToken]);

  if (!vapidKey || !isSignedIn || !userId) return null;

  const handleToggle = async (next: boolean) => {
    if (working || !support?.ok) return;
    setWorking(true);
    const supabase = getSupabaseClient(userId, getToken);
    try {
      if (next) {
        await enablePush(supabase, userId, vapidKey);
        setEnabled(true);
        toast("給油のお知らせをオンにしました", { type: "success" });
      } else {
        await disablePush(supabase, userId);
        setEnabled(false);
        toast("給油のお知らせをオフにしました", { type: "success" });
      }
    } catch (e) {
      if (!(e instanceof PushSetupError)) console.error(e);
      toast(e instanceof PushSetupError ? e.message : "お知らせの設定を変更できませんでした。", { type: "error" });
      // 許可を拒否した直後などは、使えない理由（ブロック中）を出し直す
      setSupport(readSupport());
    } finally {
      setWorking(false);
    }
  };

  const disabled = readOnly || loading || working || !support?.ok;
  const checked = enabled && !!support?.ok;

  return (
    <Section title="給油のお知らせ">
      <GroupedList>
        <div className="flex min-h-[46px] w-full items-center gap-3 px-4 py-2.5 text-ink">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span id={labelId} className="text-[15px]">
              給油のお知らせ
            </span>
            <span id={hintId} className="break-words text-xs leading-relaxed text-sub">
              前回の給油から、いつもの間隔（記録が少ないうちは {DEFAULT_INTERVAL_DAYS} 日）を過ぎた日に 1 回だけ通知します
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-labelledby={labelId}
            aria-describedby={hintId}
            disabled={disabled}
            onClick={() => void handleToggle(!checked)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
              checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
            }`}
          >
            <span
              aria-hidden="true"
              className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${
                checked ? "translate-x-6 bg-ground" : "translate-x-1 bg-sub"
              }`}
            />
          </button>
        </div>
      </GroupedList>
      {support && !support.ok && <p className="px-4 text-xs leading-relaxed text-warn">{support.reason}</p>}
      {readOnly && <p className={captionClass}>クラウドに接続できない間は切り替えられません。</p>}
      <p className={captionClass}>{IOS_PUSH_NOTE}この端末だけの設定です。ほかの端末でも受け取るには、それぞれでオンにしてください。</p>
    </Section>
  );
}
