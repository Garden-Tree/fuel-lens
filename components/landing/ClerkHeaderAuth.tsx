"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { clerkLocalization } from "@/lib/clerkLocalization";
import { syncCacheOwner } from "@/lib/supabase/cache";

/**
 * ログアウト・ユーザー切り替えの後にランディングへ来たとき、前のユーザーのキャッシュを消す
 * （アプリ画面では SupabaseStatusBanner と useVehicles が同じことをする。処理は冪等）。
 */
function CacheOwnerSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    syncCacheOwner(isSignedIn ? userId ?? null : null);
  }, [isLoaded, isSignedIn, userId]);
  return null;
}

/**
 * ランディング右上のログイン／ダッシュボードボタンの本体。HeaderAuthButtons がページの読み込み後に
 * 動的に読み込む（clerk-js と Clerk の React 部品をランディングの初期表示に載せないため）。
 * Clerk の SignedIn/SignedOut はクライアント側で評価するので、ページ本体は静的なまま。
 * ClerkProvider はこのボタンだけを包む（ランディングの他の部品は Clerk を使わない）。
 */
export default function ClerkHeaderAuth() {
  return (
    <ClerkProvider localization={clerkLocalization}>
      <CacheOwnerSync />
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl="/app">
          <button className="min-h-10 px-3 py-2 text-sm font-bold text-sub transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4">
            ログイン
          </button>
        </SignInButton>
        <Link
          href="/app"
          className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 py-2 text-xs font-bold text-ground transition hover:bg-[#5BB2FF] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground sm:text-sm"
        >
          今すぐ始める
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/app"
          className="flex min-h-10 items-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-xs font-bold text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
        >
          <span>ダッシュボード</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </SignedIn>
    </ClerkProvider>
  );
}
