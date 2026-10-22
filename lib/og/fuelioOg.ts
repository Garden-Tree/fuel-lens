import type { ToolOgImageContent } from "./renderToolOgImage";

/** /fuelio の OG・Twitter 画像の代替テキスト */
export const FUELIO_OG_ALT = "Fuelio からの乗り換え - CSV で給油記録を取り込める燃費記録アプリ（FuelLens）";

/** /fuelio の OG・Twitter 画像の中身（opengraph-image.tsx と twitter-image.tsx で共有する）。下段は説明用の例 */
export const FUELIO_OG_CONTENT: ToolOgImageContent = {
  title: "Fuelio からの乗り換え",
  subtitle: "CSV を取り込んで給油記録を引き継ぐ",
  resultColor: "money",
  formula: [
    { text: "Fuelio", kind: "unit" },
    { text: "CSV", kind: "num" },
    { text: "取り込み", kind: "unit" },
    { text: "追記のみ", kind: "result" },
  ],
};
