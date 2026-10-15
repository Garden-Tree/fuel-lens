/**
 * ランディング（/）の検索向けの文言と構造化データ（JSON-LD）、AI の読み取りに触れる文言。純粋な定数と関数だけ。
 * 書く内容はアプリの実際の動作に合わせる: 手入力・ローカル保存は登録不要（lib/data/localStore.ts）。
 * 写真の AI 読み取りは、サーバーでお試しが有効（`TRIAL_COOKIE_SECRET` が設定済み。lib/trial.ts）なら
 * 「登録なしで3回まで試せる」、無効ならログイン後（/api/analyze は未ログインで 401）。
 * 公開ページは静的に描画されるので、どちらの文言になるかはビルド時の環境変数で決まる（変えたら再デプロイ）。
 */

import { DEFAULT_SITE_URL } from "./siteUrl";

/** 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する） */
export const LANDING_TITLE = "FuelLens｜写真1枚で燃費を記録できる無料の燃費管理アプリ";

const DESCRIPTION_BODY =
  "レシートとメーターが写った写真1枚をAIが読み取り、満タン法で燃費とガソリン代を自動で記録する無料の燃費管理アプリ。給油記録の履歴やグラフで燃費の推移もひと目でわかります。";

/** 検索結果の説明文（110〜120 字程度）。お試しが無効なとき */
export const LANDING_DESCRIPTION = `${DESCRIPTION_BODY}登録なしでも手入力ですぐ使えます（AIの読み取りはログイン後）。`;

/** 検索結果の説明文。お試しが有効なとき */
export const LANDING_DESCRIPTION_WITH_TRIAL = `${DESCRIPTION_BODY}AIの読み取りも登録なしで3回まで試せます。`;

export function landingDescription(trialEnabled: boolean): string {
  return trialEnabled ? LANDING_DESCRIPTION_WITH_TRIAL : LANDING_DESCRIPTION;
}

/** ランディング・計算ページのうち、AI の読み取りの可否に触れる文言 */
export type AiAvailabilityCopy = {
  /** FAQ「本当に無料で使えますか？」の括弧書き */
  faqFreeNote: string;
  /** FAQ「ユーザー登録は必須ですか？」の AI 解析の一文 */
  faqSignupAi: string;
  /** ヒーローのチェック項目（お試しが無効なら出さない） */
  heroCheck: string | null;
  /** 特徴カード「1枚の写真からAI自動読取」の注記 */
  featureNote: string;
  /** 特徴カード「クラウド同期 & ローカル体験」の AI の一文 */
  syncNote: string;
  /** 使い方のステップ 2 */
  howToScan: string;
  /** 最後の CTA の下の 1 行 */
  footerNote: string;
  /** 燃費計算・ガソリン代計算ページのアプリへの案内 */
  calcNote: string;
};

export function aiAvailabilityCopy(trialEnabled: boolean): AiAvailabilityCopy {
  if (trialEnabled) {
    return {
      faqFreeNote: "（AI解析は登録なしで3回まで試せます。続けて使うにはログインが必要です）",
      faqSignupAi: "写真からのAI解析も、登録なしで3回まで試せます（続けて使うにはログインしてください）。",
      heroCheck: "AIの読み取りは登録なしで3回まで試せます",
      featureNote: "※AI解析は登録なしで3回まで試せます（続けて使うにはログイン）。",
      syncNote: "AIによる写真解析は登録なしで3回まで試せ、ログインすると続けて使えます。",
      howToScan:
        "「スキャン」ボタンから写真をアップロードすると、Gemini AI が1枚の画像から給油量・金額・区間走行距離などを自動的に抽出します（登録なしで3回まで試せます。続けて使うにはログイン）。",
      footerNote: "手動入力は登録不要 • AI解析は登録なしで3回まで試せます • スマートフォンでの撮影に対応",
      calcNote: "ログイン不要で手動入力も使えます（AI の読み取りも登録なしで3回まで試せます）。",
    };
  }
  return {
    faqFreeNote: "（AI解析のみログインが必要です）",
    faqSignupAi: "ただし、写真からのAI解析はログイン後にご利用いただけます。",
    heroCheck: null,
    featureNote: "※AI解析はログイン後に利用できます。",
    syncNote: "AIによる写真解析はログイン後に利用できます。",
    howToScan:
      "ログインして「スキャン」ボタンから写真をアップロードすると、Gemini AI が1枚の画像から給油量・金額・区間走行距離などを自動的に抽出します。",
    footerNote: "手動入力は登録不要でお試し可能 • AI解析はログイン後に利用可 • スマートフォンでの撮影に対応",
    calcNote: "ログイン不要で手動入力も使えます（AI の読み取りはログイン後）。",
  };
}

/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/`） */
export const LANDING_CANONICAL_URL = `${DEFAULT_SITE_URL}/`;

/**
 * ランディングの構造化データ（WebApplication）を JSON 文字列で返す。
 * 固定の文言だけから作る。`<` を < にして `</script>` で閉じられないようにする（lib/calcPage.ts の buildCalcJsonLd と同じ）。
 */
export function buildLandingJsonLd(description: string = LANDING_DESCRIPTION): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "FuelLens",
    url: LANDING_CANONICAL_URL,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    inLanguage: "ja",
    isAccessibleForFree: true,
    description,
    offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
