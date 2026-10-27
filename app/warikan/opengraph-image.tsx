import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { WARIKAN_OG } from "@/lib/warikanPage";

export const alt = WARIKAN_OG.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない（app/opengraph-image.tsx と同じ理由）。
// 共有リンクのクエリごとの画像は作らない（どのクエリでも同じ画像）
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(WARIKAN_OG.content);
}
