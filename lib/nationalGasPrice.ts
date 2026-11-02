/**
 * 全国平均のガソリン価格（資源エネルギー庁「石油製品価格調査」の週次調査、消費税込み）。
 * 毎週水曜ごろに公表される。.github/workflows/update-gas-price.yml が scripts/update-gas-price.mjs で
 * 3 つの値と調査日・公表日をまとめて書き換え、PR を作る（docs/operations.md の 4-8）。
 * スクリプトは `キー: 値,` の形の行を書き換えるので、この形とキー名を変えないこと。
 */
export const NATIONAL_GAS_PRICE = {
  regular: 170.1,
  highOctane: 181.0,
  diesel: 159.7,
  surveyDate: "2026-10-26",
  publishedDate: "2026-10-28",
  sourceName: "資源エネルギー庁「石油製品価格調査」",
  sourceUrl: "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html",
} as const;
