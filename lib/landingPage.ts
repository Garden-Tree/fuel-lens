/**
 * ランディング（/）の検索向けの文言と構造化データ（JSON-LD）。純粋な定数と関数だけ。
 * 書く内容はアプリの実際の動作に合わせる: 手入力・ローカル保存は登録不要（lib/data/localStore.ts）、
 * 写真の AI 読み取りはログイン後（/api/analyze は未ログインで 401）。
 */

import { DEFAULT_SITE_URL } from "./siteUrl";

/** 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する） */
export const LANDING_TITLE = "FuelLens｜写真1枚で燃費を記録できる無料の燃費管理アプリ";

/** 検索結果の説明文（110〜120 字程度） */
export const LANDING_DESCRIPTION =
  "レシートとメーターが写った写真1枚をAIが読み取り、満タン法で燃費とガソリン代を自動で記録する無料の燃費管理アプリ。給油記録の履歴やグラフで燃費の推移もひと目でわかります。登録なしでも手入力ですぐ使えます（AIの読み取りはログイン後）。";

/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/`） */
export const LANDING_CANONICAL_URL = `${DEFAULT_SITE_URL}/`;

/**
 * ランディングの構造化データ（WebApplication）を JSON 文字列で返す。
 * 固定の文言だけから作る。`<` を < にして `</script>` で閉じられないようにする（lib/calcPage.ts の buildCalcJsonLd と同じ）。
 */
export function buildLandingJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FuelLens",
    url: LANDING_CANONICAL_URL,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    inLanguage: "ja",
    isAccessibleForFree: true,
    description: LANDING_DESCRIPTION,
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
