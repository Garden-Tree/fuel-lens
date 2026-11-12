import type { ToolOgImageContent } from "./renderToolOgImage";

/** /fuel-log の OG・Twitter 画像の代替テキスト */
export const FUEL_LOG_OG_ALT = "燃費記録のつけ方 - 満タン法で給油ごとに残す4項目（FuelLens）";

/** /fuel-log の OG・Twitter 画像の中身（opengraph-image.tsx と twitter-image.tsx で共有する）。下段は本文の例（420 km ÷ 30 L = 14.0 km/L） */
export const FUEL_LOG_OG_CONTENT: ToolOgImageContent = {
  title: "燃費記録のつけ方",
  subtitle: "満タン法で給油ごとに残す4項目",
  resultColor: "accent",
  formula: [
    { text: "420", kind: "num" },
    { text: "km ÷ ", kind: "unit" },
    { text: "30", kind: "num" },
    { text: "L = ", kind: "unit" },
    { text: "14.0", kind: "result" },
    { text: "km/L", kind: "unit" },
  ],
};
