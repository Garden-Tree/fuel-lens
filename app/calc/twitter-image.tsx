import { renderToolOgImage } from "@/lib/og/renderToolOgImage";

export const alt = "満タン法 燃費計算ツール - 走行距離 ÷ 給油量で燃費をすぐ計算（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage({
    title: "満タン法 燃費計算ツール",
    subtitle: "走行距離 ÷ 給油量で燃費をすぐ計算",
    resultColor: "accent",
    formula: [
      { text: "400", kind: "num" },
      { text: "km", kind: "unit" },
      { text: "÷", kind: "unit" },
      { text: "25", kind: "num" },
      { text: "L", kind: "unit" },
      { text: "=", kind: "unit" },
      { text: "16.00", kind: "result" },
      { text: "km/L", kind: "unit" },
    ],
  });
}
