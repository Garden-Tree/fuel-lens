import type { ToolOgImageContent } from "./renderToolOgImage";

/** /fuel-log-excel の OG・Twitter 画像の代替テキスト */
export const FUEL_LOG_EXCEL_OG_ALT = "燃費管理をエクセルで - 列の作り方と計算式・アプリへの移行（FuelLens）";

/**
 * /fuel-log-excel の OG・Twitter 画像の中身（opengraph-image.tsx と twitter-image.tsx で共有する）。
 * 下段は燃費の列の数式の例（F = 走行距離(km)、C = 給油量(L)。lib/fuelLogExcelPage.ts の sheetColumns と同じ列）
 */
export const FUEL_LOG_EXCEL_OG_CONTENT: ToolOgImageContent = {
  title: "燃費管理をエクセルで",
  subtitle: "列の作り方と計算式・アプリへの移行",
  resultColor: "accent",
  formula: [
    { text: "燃費 = ", kind: "unit" },
    { text: "F2", kind: "num" },
    { text: " / ", kind: "unit" },
    { text: "C2", kind: "result" },
  ],
};
