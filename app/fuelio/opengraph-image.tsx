import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { FUELIO_OG_ALT, FUELIO_OG_CONTENT } from "@/lib/og/fuelioOg";

export const alt = FUELIO_OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない（app/opengraph-image.tsx と同じ理由）
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(FUELIO_OG_CONTENT);
}
