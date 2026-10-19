import { renderToolOgImage } from "@/lib/og/renderToolOgImage";

export const alt = "燃費の単位換算ツール - km/L・L/100km・mpg を相互に換算（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage({
    title: "燃費の単位換算ツール",
    subtitle: "km/L・L/100km・mpg を相互に換算",
    resultColor: "accent",
    formula: [
      { text: "15", kind: "num" },
      { text: "km/L", kind: "unit" },
      { text: "=", kind: "unit" },
      { text: "6.67", kind: "result" },
      { text: "L/100km", kind: "unit" },
      { text: "=", kind: "unit" },
      { text: "35.28", kind: "result" },
      { text: "mpg", kind: "unit" },
    ],
  });
}
