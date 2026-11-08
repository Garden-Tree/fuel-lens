import { renderToolOgImage } from "@/lib/og/renderToolOgImage";
import { commuteExample } from "@/lib/annualGasCostPage";

export const alt = "ガソリン代は月いくら？通勤・年間のガソリン代シミュレーター - 1か月と1年のガソリン代を計算（FuelLens）";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Google Fonts をリクエスト時に取得するため、ビルド時に静的生成しない（app/opengraph-image.tsx と同じ理由）
export const dynamic = "force-dynamic";

export default async function Image() {
  // 金額は本文の通勤の例と同じ計算（全国平均の単価が週次で更新されても一致する）
  const { monthly, yearly } = commuteExample();
  return renderToolOgImage({
    title: "ガソリン代は月いくら？",
    subtitle: "通勤・年間のガソリン代を計算（月額×12で年額）",
    resultColor: "money",
    formula: [
      { text: monthly, kind: "num" },
      { text: "円/月", kind: "unit" },
      { text: "×", kind: "unit" },
      { text: "12", kind: "num" },
      { text: "=", kind: "unit" },
      { text: yearly, kind: "result" },
      { text: "円/年", kind: "unit" },
    ],
  });
}
