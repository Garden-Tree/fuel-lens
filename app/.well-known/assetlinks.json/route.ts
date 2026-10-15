import { buildAssetLinks } from "@/lib/assetlinks";

// 環境変数をリクエスト時に読む（ビルド時に静的化しない。値を変えて再デプロイすれば反映される）。
export const dynamic = "force-dynamic";

// Digital Asset Links。Google Play の Trusted Web Activity が正当な持ち主か確認するために取りに来る。
// ANDROID_ASSETLINKS_SHA256 が未設定（または有効な値が無い）ときは 404。リダイレクトや認証を挟んではいけないので、
// proxy.ts（Clerk）の matcher からも /.well-known を除外している。手順は docs/play-store/README.md。
export function GET() {
  const body = buildAssetLinks(process.env);
  if (!body) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(body, {
    headers: {
      // 鍵を差し替えた直後に古い内容が残らないよう、CDN には短くしかキャッシュさせない
      "Cache-Control": "public, max-age=0, s-maxage=300",
    },
  });
}
