import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { findRoute, routeDetailOg } from "@/lib/routeDetailPage";
import { ROUTES } from "@/lib/routeGasCostPage";

export const alt = "区間の車のガソリン代と高速代の目安（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない（app/opengraph-image.tsx と同じ理由）
export const dynamic = "force-dynamic";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const route = findRoute((await params).slug) ?? ROUTES[0];
  return renderToolOgImage(routeDetailOg(route).content);
}
