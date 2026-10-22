import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { FUELIO_OG_ALT, FUELIO_OG_CONTENT } from "@/lib/og/fuelioOg";

export const alt = FUELIO_OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(FUELIO_OG_CONTENT);
}
