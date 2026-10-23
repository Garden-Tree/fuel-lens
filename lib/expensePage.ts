/**
 * 経費のガソリン代記録ページ（/expense）の純粋な定数と関数: FAQ と構造化データ（JSON-LD）。
 * 書く内容はアプリの実際の動作に合わせる（新しい機能は足さない）:
 * - 写真の読み取り項目: lib/server/analyze/prompt.ts（date / gas_station / fuel_amount / price_per_unit / total_cost ほか）
 * - CSV の列: lib/csv.ts の RECORDS_CSV_HEADERS（設定画面の「全車両のCSVを書き出す」。ページ本文の列の一覧は app/expense/page.tsx が同じ定数から表示する）
 * - 写真は保存しない: app/privacy/page.tsx
 * - 月ごとの給油代: app/(app)/stats の MonthlyCostChart（lib/stats/series.ts の buildMonthlyCostSeries、支払総額の月別合計）
 * - 区間距離（CSV の「走行距離(km)」）・メモ・複数車両: lib/types.ts、lib/csv.ts。仕事とプライベートの走行距離の区別は記録しない
 * - AI の読み取りの可否（お試しの有無）: lib/landingPage.ts の aiAvailabilityCopy（静的描画なのでビルド時の値）
 * 税務の助言はしない（原本の保存要件や経費の範囲は国税庁の案内や税理士に確認してもらう）。
 */

import type { FaqEntry } from "./calcPage";
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
  "ガソリンスタンドのレシートを撮るだけで、AIが日付・店名・金額などを読み取って記録。配達員や個人事業主、営業車の自腹精算に。CSVで書き出して按分の計算もでき、Excelやスプレッドシートで集計できます。写真は保存しません。";

/** 按分の例: 1 か月のガソリン代 (円) */
export const APPORTION_EXAMPLE_MONTHLY_COST = 12000;
/** 按分の例: 1 か月の総走行距離 (km) */
export const APPORTION_EXAMPLE_TOTAL_KM = 1000;
/** 按分の例: うち仕事で走った距離 (km) */
export const APPORTION_EXAMPLE_WORK_KM = 600;

export type ApportionResult = {
  /** 仕事の割合 (%)。小数は第 1 位まで */
  ratioPercent: number;
  /** 仕事に使った分のガソリン代 (円)。1 円未満を四捨五入 */
  workCost: number;
  /** プライベート分のガソリン代 (円)。合計から仕事分を引いた残り */
  privateCost: number;
};

/**
 * 走行距離の割合でガソリン代を按分する例の計算。割合の決め方の正解を示すものではない（距離以外に使用日数などで決める方法もある）。
 * 入力が不正（総距離が 0 以下、仕事の距離が 0 未満または総距離超え、金額が負）なら null。
 */
export function apportionByDistance(totalCost: number, totalKm: number, workKm: number): ApportionResult | null {
  if (![totalCost, totalKm, workKm].every(Number.isFinite)) return null;
  if (totalCost < 0 || totalKm <= 0 || workKm < 0 || workKm > totalKm) return null;
  const workCost = Math.round((totalCost * workKm) / totalKm);
  return {
    ratioPercent: Math.round((workKm / totalKm) * 1000) / 10,
    workCost,
    privateCost: Math.round(totalCost) - workCost,
  };
}

/** 1km あたりのガソリン代 (円/km) = 単価 (円/L) ÷ 燃費 (km/L)。入力が 0 以下・非数なら null */
export function costPerKm(pricePerLiter: number, efficiency: number): number | null {
  if (!Number.isFinite(pricePerLiter) || !Number.isFinite(efficiency) || pricePerLiter <= 0 || efficiency <= 0) return null;
  return pricePerLiter / efficiency;
}

/** 距離単価の早見表の燃費 (km/L) と単価 (円/L)。/gas-cost の早見表の燃費・単価に合わせる */
export const COST_PER_KM_EFFICIENCIES = [10, 15, 20, 25] as const;
export const COST_PER_KM_PRICES = [150, 170, 190] as const;

/** 距離単価の早見表。行 = 燃費、列 = 単価。表示は小数第 1 位（円/km） */
export function costPerKmTable(): { efficiency: number; costs: string[] }[] {
  return COST_PER_KM_EFFICIENCIES.map((efficiency) => ({
    efficiency,
    costs: COST_PER_KM_PRICES.map((price) => (costPerKm(price, efficiency) ?? 0).toFixed(1)),
  }));
}

/**
 * ページの FAQ と JSON-LD の FAQPage で共有する。本文（記録のしかた・CSV・按分・領収書の保管）で答えていることは載せない。
 * AI の読み取りの可否はお試しの有無で変わる。
 */
export function expenseFaqs(trialEnabled: boolean): FaqEntry[] {
  const ai = aiAvailabilityCopy(trialEnabled);
  return [
    {
      q: "撮った写真は保存されますか？",
      a: "いいえ。写真は AI（Google Gemini）での読み取りのためだけに送信し、FuelLens のデータベースやストレージには保存しません。残るのは、保存した日付・店名・金額などの記録だけです。",
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
