import { NextResponse, type NextRequest } from "next/server";

/**
 * Web Share Target（manifest の share_target: POST /share）のフォールバック。
 *
 * 通常は Service Worker（public/sw.js）が POST /share を横取りし、画像を端末内に保存して
 * /app?action=shared へ遷移させるため、ここには届かない。
 * SW がまだ有効になっていない（初回インストール直後など）場合だけブラウザがここへ POST してくる。
 * 画像をサーバーで受け取らない方針のため、本文は読まずに案内用のパラメータ付きで /app へ戻す。
 */
export function POST(request: NextRequest) {
  return NextResponse.redirect(new URL("/app?action=share-unavailable", request.url), 303);
}

/** /share を直接開いたときは 404 にせず /app へ */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/app", request.url), 303);
}
