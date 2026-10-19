/**
 * 経費のガソリン代記録ページ（/expense）の純粋な定数と関数: FAQ と構造化データ（JSON-LD）。
 * 書く内容はアプリの実際の動作に合わせる（新しい機能は足さない）:
 * - 写真の読み取り項目: lib/server/analyze/prompt.ts（date / gas_station / fuel_amount / price_per_unit / total_cost ほか）
 * - CSV の列: lib/csv.ts の RECORDS_CSV_HEADERS（設定画面の「全車両のCSVを書き出す」）
 * - 写真は保存しない: app/privacy/page.tsx
 * - AI の読み取りの可否（お試しの有無）: lib/landingPage.ts の aiAvailabilityCopy（静的描画なのでビルド時の値）
 * 税務の助言はしない（原本の保存要件や経費の範囲は国税庁の案内や税理士に確認してもらう）。
 */

import type { FaqEntry } from "./calcPage";
import { RECORDS_CSV_HEADERS } from "./csv";
import { aiAvailabilityCopy } from "./landingPage";
import { DEFAULT_SITE_URL } from "./siteUrl";

export const EXPENSE_PATH = "/expense";
/** ナビゲーション・関連ページのリンクの表示名 */
export const EXPENSE_TITLE = "経費のガソリン代記録";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/expense`） */
export const EXPENSE_CANONICAL_URL = `${DEFAULT_SITE_URL}${EXPENSE_PATH}`;

/** 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する） */
export const EXPENSE_PAGE_TITLE = "ガソリン代の経費記録アプリ｜レシートを撮るだけで日付・店名・金額を記録 | FuelLens";

/** 検索結果の説明文（110〜120 字程度）。お試しの有無に触れない（どちらでも正しい文言） */
export const EXPENSE_DESCRIPTION =
  "ガソリンスタンドのレシートを撮るだけで、AIが日付・店名・給油量・単価・金額を読み取って記録。配達員や個人事業主、営業車の自腹精算に。記録はCSVで書き出し、Excelやスプレッドシートで集計できます。写真は保存しません。";

/** 全車両 CSV の列の並び（表示用の文字列）。CSV の実装（lib/csv.ts）と同じ定数から作る */
export const EXPENSE_CSV_COLUMNS_TEXT = RECORDS_CSV_HEADERS.join("・");

/** ページの FAQ と JSON-LD の FAQPage で共有する。AI の読み取りの可否はお試しの有無で変わる */
export function expenseFaqs(trialEnabled: boolean): FaqEntry[] {
  const ai = aiAvailabilityCopy(trialEnabled);
  return [
    {
      q: "撮った写真は保存されますか？",
      a: "いいえ。写真は AI（Google Gemini）での読み取りのためだけに送信し、FuelLens のデータベースやストレージには保存しません。残るのは、確認して保存した日付・店名・金額などの記録だけです。レシートの原本はご自身で保管してください。",
    },
    {
      q: "車やバイクを何台でも登録できますか？",
      a: "はい。車とバイクを何台でも登録でき、記録は車両ごとに分かれます。仕事用の車両と自家用車を分けて記録できます。",
    },
    {
      q: "CSV にはどんな項目が入りますか？",
      a: `設定画面の「全車両のCSVを書き出す」では、${EXPENSE_CSV_COLUMNS_TEXT}の列が入ります。履歴画面からは、選んでいる車両の記録だけを書き出せます（車両の列はありません）。`,
    },
    {
      q: "無料で使えますか？",
      a: `はい、すべての基本機能を無料で使えます${ai.faqFreeNote}。手入力と記録の保存は登録なしでも使えます。`,
    },
  ];
}

/**
 * /expense の構造化データ（WebPage + WebApplication + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildExpenseJsonLd(faqs: readonly FaqEntry[]): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: EXPENSE_PAGE_TITLE,
        url: EXPENSE_CANONICAL_URL,
        inLanguage: "ja",
        description: EXPENSE_DESCRIPTION,
      },
      {
        "@type": "WebApplication",
        name: "FuelLens",
        url: `${DEFAULT_SITE_URL}/`,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description: EXPENSE_DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
