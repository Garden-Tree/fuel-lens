import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { calcOgFormula } from "@/lib/calcPage";

export const alt = "燃費計算ツール（満タン法） - 走行距離 ÷ 給油量で燃費をすぐ計算（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない（app/opengraph-image.tsx と同じ理由）
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage({
    title: "燃費計算ツール（満タン法）",
    subtitle: "走行距離 ÷ 給油量で燃費をすぐ計算",
    resultColor: "accent",
    formula: calcOgFormula(),
  });
}
