"use client";

import { useAuth } from "@clerk/nextjs";
import { AlertTriangle } from "lucide-react";
import { outageMessage, useSupabaseOutage } from "@/lib/supabaseHealth";

/**
 * クラウドDB（Supabase）が一時停止中・接続不可のときに画面上部へ表示する警告バー。
 * 障害はログイン中のデータ取得でしか検知されないため、未ログイン時は表示しない。
 */
export default function SupabaseStatusBanner() {
  const { isSignedIn } = useAuth();
  const outage = useSupabaseOutage();

  if (!isSignedIn || !outage) return null;

  return (
    <div
      role="alert"
      className="w-full bg-amber-500 text-amber-950 border-b border-amber-600 shadow-md"
    >
      <div className="mx-auto max-w-5xl flex items-start gap-2 px-4 py-2 text-xs md:text-sm font-semibold leading-snug">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p>{outageMessage(outage)}</p>
      </div>
    </div>
  );
}
