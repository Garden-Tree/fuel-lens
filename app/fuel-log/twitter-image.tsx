import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { FUEL_LOG_OG_ALT, FUEL_LOG_OG_CONTENT } from "@/lib/og/fuelLogOg";

export const alt = FUEL_LOG_OG_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(FUEL_LOG_OG_CONTENT);
}
