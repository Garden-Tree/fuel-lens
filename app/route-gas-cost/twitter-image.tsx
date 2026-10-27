import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { routeGasCostOg } from "@/lib/routeGasCostPage";

export const alt = routeGasCostOg().alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage(routeGasCostOg().content);
}
