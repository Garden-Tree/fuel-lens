"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  outageMessage,
  requestSupabaseRetry,
  subscribeOutageAutoRetry,
  syncCacheOwner,
  useSupabaseOutage,
} from "@/lib/supabaseHealth";

/**
 * クラウドDB（Supabase）が一時停止中・接続不可のときに画面上部へ表示する警告バー。
 * 障害はログイン中のデータ取得でしか検知されないため、未ログイン時は表示しない。
 *
 * 「再試行」ボタンと、障害中のネットワーク復帰・タブ再表示での自動再試行（30 秒に 1 回まで）を持つ。
 * レイアウトに常駐するため、ログアウト・ユーザー切り替え時のキャッシュ削除もここで行う
 * （useVehicles からも呼ばれる。処理は冪等）。
 */
export default function SupabaseStatusBanner() {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const outage = useSupabaseOutage();

  useEffect(() => {
    if (!isLoaded) return;
    syncCacheOwner(isSignedIn ? userId ?? null : null);
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    if (!isSignedIn || !outage) return;
    return subscribeOutageAutoRetry();
  }, [isSignedIn, outage]);

  if (!isSignedIn || !outage) return null;

  return (
    <div
      role="alert"
      className="w-full bg-warn-bg text-warn border-b border-warn/30"
    >
      <div className="mx-auto max-w-5xl flex items-start gap-2 px-4 py-2 text-xs md:text-sm font-medium leading-snug">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <p className="flex-1">{outageMessage(outage)}</p>
        <button
          type="button"
          onClick={requestSupabaseRetry}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl border border-warn/40 bg-warn-bg px-3 min-h-10 font-bold text-warn hover:bg-warn/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-warn"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          再試行
        </button>
      </div>
    </div>
  );
}
