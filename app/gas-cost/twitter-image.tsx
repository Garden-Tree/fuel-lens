import { renderToolOgImage } from "@/lib/og/renderToolOgImage";

export const alt = "ガソリン代計算ツール - 距離・燃費・単価からガソリン代を計算。往復・割り勘に対応（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage({
    title: "ガソリン代計算ツール",
    subtitle: "距離・燃費・単価からガソリン代を計算（往復・割り勘対応）",
    resultColor: "money",
    formula: [
      { text: "300", kind: "num" },
      { text: "km", kind: "unit" },
      { text: "÷", kind: "unit" },
      { text: "15", kind: "num" },
      { text: "km/L", kind: "unit" },
      { text: "×", kind: "unit" },
      { text: "170", kind: "num" },
      { text: "円/L", kind: "unit" },
      { text: "=", kind: "unit" },
      { text: "3,400", kind: "result" },
      { text: "円", kind: "unit" },
    ],
  });
}
