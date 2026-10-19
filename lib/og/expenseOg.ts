import type { ToolOgImageContent } from "./renderToolOgImage";

/** /expense の OG・Twitter 画像の代替テキスト */
export const EXPENSE_OG_ALT = "ガソリン代の経費記録 - レシートを撮るだけで日付・店名・金額を残す（FuelLens）";

/**
 * /expense の OG・Twitter 画像の中身（opengraph-image.tsx と twitter-image.tsx で共有する）。
 * 下段は読み取り結果の例（32.5 L × 170 円/L = 5,525 円。実際の値ではなく説明用）
 */
export const EXPENSE_OG_CONTENT: ToolOgImageContent = {
  title: "ガソリン代の経費記録",
  subtitle: "レシートを撮るだけで日付・店名・金額を残す",
  resultColor: "money",
  formula: [
    { text: "日付", kind: "unit" },
    { text: "10/19", kind: "num" },
    { text: "給油量", kind: "unit" },
    { text: "32.5", kind: "num" },
    { text: "L", kind: "unit" },
    { text: "金額", kind: "unit" },
    { text: "5,525", kind: "result" },
    { text: "円", kind: "unit" },
  ],
};
