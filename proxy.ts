import { clerkMiddleware } from '@clerk/nextjs/server';

// すべてのルートをパブリックのままにする（未ログインでもトップ／アプリ画面は閲覧でき、
// クライアント側の SignedIn/SignedOut やローカルストレージ保存がこれに依存している）。
// /api/analyze はルートハンドラ内で auth() を呼び、未ログインなら 401 を返す（route.ts 参照）。
// 画面単位で保護したくなった場合は createRouteMatcher + auth.protect() をここに追加する。
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
