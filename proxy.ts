import { clerkMiddleware } from '@clerk/nextjs/server';

// すべてのルートをパブリックのままにする（未ログインでもトップ／アプリ画面は閲覧でき、
// クライアント側の SignedIn/SignedOut やローカルストレージ保存がこれに依存している）。
// /api/analyze はルートハンドラ内で auth() を呼び、未ログインなら 401 を返す（route.ts 参照）。
// 画面単位で保護したくなった場合は createRouteMatcher + auth.protect() をここに追加する。
//
// authorizedParties: セッショントークンの azp（発行元オリジン）を許可リストと照合し、サブドメイン経由の
// Cookie 漏洩攻撃を防ぐ。azp が無いトークンは検証対象外。値が存在するものだけ追加するので、
// 環境変数が無い環境（ローカル・Preview）でも壊れない。
function buildAuthorizedParties(): string[] {
  const parties = new Set<string>(['https://fuel-lens.gadelog.com']);
  const add = (origin: string | undefined, fallbackScheme = false) => {
    const value = origin?.trim();
    if (!value) return;
    try {
      parties.add(new URL(fallbackScheme && !/^https?:\/\//.test(value) ? `https://${value}` : value).origin);
    } catch {
      // 不正な値は無視する
    }
  };
  add(process.env.NEXT_PUBLIC_APP_URL);
  add(process.env.VERCEL_URL, true);
  add(process.env.VERCEL_BRANCH_URL, true);
  if (process.env.NODE_ENV !== 'production') parties.add('http://localhost:3000');
  return [...parties];
}

export default clerkMiddleware({ authorizedParties: buildAuthorizedParties() });

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params.
    // /_vercel（Vercel Web Analytics の /_vercel/insights/*）も除外する。
    // /share（Web Share Target の受け口）も除外する: SW が無いときにブラウザが送ってくる multipart の POST を
    // Clerk が処理しないようにし、next.config.ts の redirects() で本文を読まずに /app へ 303 で戻す。
    // /.well-known（Digital Asset Links: /.well-known/assetlinks.json）も除外する: Google Play の確認が
    // リダイレクトや Clerk のハンドシェイクを挟まず 200 で JSON を受け取れるようにする（app/.well-known/）。
    '/((?!_next|_vercel|share(?:/|$)|\\.well-known(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
