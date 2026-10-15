import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { preconnect } from "react-dom";
import { clerkLocalization } from "@/lib/clerkLocalization";
import { clerkFrontendApiOrigin } from "@/lib/clerkFrontendApi";
import UserSync from "@/components/UserSync";
import SupabaseStatusBanner from "@/components/SupabaseStatusBanner";
import { ToastProvider } from "@/components/Toast";
import { InitialAuthProvider } from "@/lib/data/initialAuthContext";
import type { InitialAuth } from "@/lib/data/initialAuth";
import { TrialProvider } from "@/lib/scan/trialContext";
import { TRIAL_COOKIE_NAME, TRIAL_DISABLED, type TrialState } from "@/lib/trial";
import { trialStateFromCookie } from "@/lib/server/analyze/trialCookie";

/**
 * サーバーが知っているログイン状態（proxy.ts の clerkMiddleware が検証したセッション）。
 * クライアントは Clerk（clerk-js）の読み込みを待たずに、未ログインならローカルのデータで、ログイン中ならキャッシュで先に描画する
 * （lib/data/initialAuth.ts）。読めなければ null（従来どおり Clerk を待つ）。
 */
async function readInitialAuth(): Promise<InitialAuth | null> {
  try {
    const { userId } = await auth();
    return { signedIn: !!userId, userId: userId ?? null };
  } catch (e) {
    // 動的描画への切り替えなど Next.js 内部の例外は握りつぶさない
    unstable_rethrow(e);
    console.error("サーバーでログイン状態を読めませんでした:", e);
    return null;
  }
}

/**
 * 未ログインのお試し読み取りの初期状態（有効か・残り回数）。HttpOnly の Cookie はクライアントから読めないので、ここで読む。
 * 表示用（判定は /api/analyze が行う）。読めなければ無効として扱う（従来どおり「ログイン後に使えます」）。
 */
async function readInitialTrial(): Promise<TrialState> {
  try {
    const value = (await cookies()).get(TRIAL_COOKIE_NAME)?.value;
    return trialStateFromCookie(value, process.env.TRIAL_COOKIE_SECRET);
  } catch (e) {
    unstable_rethrow(e);
    console.error("お試しの状態を読めませんでした:", e);
    return TRIAL_DISABLED;
  }
}

/**
 * アプリ画面（/app・/history・/stats・/settings）の共通レイアウト。
 * Clerk（clerk-js は数百 KB）・トースト・Supabase へのユーザー同期と障害バナーはここだけで読み込み、
 * 公開ページ（/・/calc・/privacy・/terms）には載せない。ランディングのログインボタンは
 * components/landing/HeaderAuthButtons.tsx が読み込み完了後に Clerk を遅延読み込みする。
 * ルートグループ `(app)` なので URL は変わらない。画面間の移動ではこのレイアウトが保たれる（Clerk・トーストは作り直さない）。
 * サーバーで auth() を読むため、この 4 画面はリクエストごとの描画（動的）になる（公開ページは静的のまま）。
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Clerk の Frontend API（/v1/environment・/v1/client。Cookie 付き）への接続を先に張る
  const clerkOrigin = clerkFrontendApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (clerkOrigin) preconnect(clerkOrigin);
  const [initialAuth, initialTrial] = await Promise.all([readInitialAuth(), readInitialTrial()]);

  return (
    <ClerkProvider localization={clerkLocalization}>
      <InitialAuthProvider value={initialAuth}>
        <TrialProvider initial={initialTrial}>
          <ToastProvider>
            <UserSync />
            <SupabaseStatusBanner />
            {children}
          </ToastProvider>
        </TrialProvider>
      </InitialAuthProvider>
    </ClerkProvider>
  );
}
