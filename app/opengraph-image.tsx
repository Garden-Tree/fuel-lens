import { renderOgImage } from "@/lib/og/renderOgImage";

export const alt = "FuelLens - 写真1枚で燃費を自動記録";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない
// （ビルド中の取得失敗でフォント無しの画像が焼き込まれるのを防ぐ）
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderOgImage();
}
