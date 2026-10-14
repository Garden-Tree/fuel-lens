import { renderOgImage } from "@/lib/og/renderOgImage";

export const alt = "FuelLens - 写真1枚で燃費を自動記録";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderOgImage();
}
