import { renderToolOgImage } from "@/lib/og/renderToolOgImage";

export const alt = "年間・月間のガソリン代シミュレーター - 通勤にも対応。1か月と1年のガソリン代を計算（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Image() {
  return renderToolOgImage({
    title: "年間・月間のガソリン代",
    subtitle: "月のガソリン代を12倍して年額を計算（通勤にも対応）",
    resultColor: "money",
    formula: [
      { text: "6,800", kind: "num" },
      { text: "円/月", kind: "unit" },
      { text: "×", kind: "unit" },
      { text: "12", kind: "num" },
      { text: "=", kind: "unit" },
      { text: "81,600", kind: "result" },
      { text: "円/年", kind: "unit" },
    ],
  });
}
