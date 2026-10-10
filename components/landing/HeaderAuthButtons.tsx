"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";

/**
 * ランディングページ右上のログイン／ダッシュボードボタン。
 * Clerk の SignedIn/SignedOut をクライアント側で評価するため、ページ本体は Server Component のまま
 * 静的に生成できる（サーバー側の auth() を呼ばず、動的レンダリングに切り替わらない）。
 */
export default function HeaderAuthButtons() {
  return (
    <div className="flex items-center gap-1 sm:gap-3">
      <SignedOut>
        <SignInButton forceRedirectUrl="/app">
          <button className="min-h-10 px-3 py-2 text-sm font-semibold text-sub transition hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:px-4">
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
          className="flex min-h-10 items-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-ink transition hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-sm"
        >
          <span>ダッシュボード</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </SignedIn>
    </div>
  );
}
