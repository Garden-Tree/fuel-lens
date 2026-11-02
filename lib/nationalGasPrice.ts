/**
 * 全国平均のガソリン価格（資源エネルギー庁「石油製品価格調査」の週次調査、消費税込み）。
 * 毎週水曜ごろに公表される。更新するときは 3 つの値と調査日・公表日をまとめて書き換える。
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
