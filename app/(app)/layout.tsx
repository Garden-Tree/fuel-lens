import { ClerkProvider } from "@clerk/nextjs";
import { preconnect } from "react-dom";
import { clerkLocalization } from "@/lib/clerkLocalization";
import { clerkFrontendApiOrigin } from "@/lib/clerkFrontendApi";
import UserSync from "@/components/UserSync";
import SupabaseStatusBanner from "@/components/SupabaseStatusBanner";
import { ToastProvider } from "@/components/Toast";

/**
 * アプリ画面（/app・/history・/stats・/settings）の共通レイアウト。
 * Clerk（clerk-js は数百 KB）・トースト・Supabase へのユーザー同期と障害バナーはここだけで読み込み、
 * 公開ページ（/・/calc・/privacy・/terms）には載せない。ランディングのログインボタンは
 * components/landing/HeaderAuthButtons.tsx が読み込み完了後に Clerk を遅延読み込みする。
 * ルートグループ `(app)` なので URL は変わらない。画面間の移動ではこのレイアウトが保たれる（Clerk・トーストは作り直さない）。
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Clerk の Frontend API（/v1/environment・/v1/client。Cookie 付き）への接続を先に張る
  const clerkOrigin = clerkFrontendApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (clerkOrigin) preconnect(clerkOrigin);

  return (
    <ClerkProvider localization={clerkLocalization}>
      <ToastProvider>
        <UserSync />
        <SupabaseStatusBanner />
        {children}
      </ToastProvider>
    </ClerkProvider>
  );
}
