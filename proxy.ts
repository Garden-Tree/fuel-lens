/* eslint-disable @typescript-eslint/no-unused-vars */
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const _isPublicRoute = createRouteMatcher(['/', '/api/analyze']);

export default clerkMiddleware(async (_auth, _req) => {
  // すべてのルートをパブリックにしつつ、必要な画面で個別対応する場合は protect() をスキップ
  // ここでは基本的に、公開してよいトップページ等以外を保護します
  // if (!isPublicRoute(req)) {
  //   await auth.protect();
  // }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
