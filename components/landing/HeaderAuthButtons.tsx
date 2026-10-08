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
          <button className="text-sm font-semibold text-gray-300 hover:text-white transition px-3 sm:px-4 py-2 min-h-10">
            ログイン
          </button>
        </SignInButton>
        <Link
          href="/app"
          className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white text-xs sm:text-sm font-bold py-2 px-4 min-h-10 inline-flex items-center rounded-full transition shadow-lg shadow-blue-600/20 active:scale-95"
        >
          今すぐ始める
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          href="/app"
          className="bg-gray-800 hover:bg-gray-700 text-white text-xs sm:text-sm font-semibold py-2 px-4 min-h-10 rounded-full border border-gray-700 transition flex items-center gap-1"
        >
          <span>ダッシュボード</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </SignedIn>
    </div>
  );
}
