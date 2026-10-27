import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { WARIKAN_OG } from "@/lib/warikanPage";

export const alt = WARIKAN_OG.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(WARIKAN_OG.content);
}
