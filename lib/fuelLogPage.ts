/**
 * 燃費記録のつけ方ページ（/fuel-log）の純粋な定数と関数: 例の計算・FAQ・構造化データ（JSON-LD）。
 * 「燃費 記録 つけ方」「満タン法 記録」など、記録を続けたい人の検索からの入口。1 回きりの計算は /calc が受け持つ。
 * 書く内容はアプリの実際の動作に合わせる（新しい機能は足さない）:
 * - 燃費 = 区間距離 ÷ 給油量: lib/calculations.ts の calculateFuelMetrics（例の値もこれで求める）
 * - 部分給油（満タン給油のスイッチを切る）は次の満タン給油で距離と給油量をまとめて計算、
 *   「前回の給油を記録し忘れた」はその記録の燃費を出さず次から数え直す: lib/fillChain.ts の applyFillChain、
 *   docs/design-fill-chain.md、components の手動入力フォーム（「満タン給油」「前回の給油を記録し忘れた」）
 * - オドメーター方式（積算距離の差から区間距離）: 車両の distance_mode（docs/design-fill-chain.md）
 * - 写真の読み取り項目（給油量・金額・区間距離など）: lib/landingPage.ts の howToScan と同じ範囲
 * - 統計画面: 燃費の推移・月ごとの給油代・単価の推移（app/(app)/stats/_components）
 * - AI の読み取りの可否（お試しの有無）: lib/landingPage.ts の aiAvailabilityCopy（静的描画なのでビルド時の値）
 * 他社のアプリについては書かない。
 */

import type { FaqEntry } from "./calcPage";
import { calculateFuelMetrics } from "./calculations";
import { aiAvailabilityCopy } from "./landingPage";
import { DEFAULT_SITE_URL } from "./siteUrl";
import { jsonLdString } from "./jsonLd";

export const FUEL_LOG_PATH = "/fuel-log";
/** ナビゲーション・関連ページのリンクの表示名（lib/publicNav.ts の FUEL_LOG_GUIDE_LINKS と同じ） */
export const FUEL_LOG_TITLE = "燃費記録のつけ方";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/fuel-log`） */
export const FUEL_LOG_CANONICAL_URL = `${DEFAULT_SITE_URL}${FUEL_LOG_PATH}`;

/** 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する） */
export const FUEL_LOG_PAGE_TITLE = "燃費記録のつけ方｜満タン法で給油ごとに残す4項目 | FuelLens";

/** 検索結果の説明文（110〜120 字）。お試しの有無に触れない */
export const FUEL_LOG_DESCRIPTION =
  "燃費記録は、満タンにするたびに給油日・区間距離・給油量・金額を残すだけ。燃費は区間距離÷給油量で出ます。部分給油や記録し忘れの扱い、長く続けるコツと、写真1枚で燃費を記録できる無料アプリFuelLensの使い方を紹介します。";

/** 本文の計算の例: 区間距離 (km)・給油量 (L)・支払総額 (円) */
export const FUEL_LOG_EXAMPLE = { distance: 420, amount: 30, cost: 5100 } as const;

/** 例の燃費 (km/L) と単価 (円/L)。calculateFuelMetrics で求める（丸めを複製しない） */
export function fuelLogExample(): { efficiency: number; pricePerUnit: number } {
  const { distance, amount, cost } = FUEL_LOG_EXAMPLE;
  const m = calculateFuelMetrics(distance, amount, cost);
  return { efficiency: m.fuel_efficiency ?? 0, pricePerUnit: m.price_per_unit ?? 0 };
}

/** 部分給油の例: 満タン → 部分給油（200km・15L）→ 満タン（250km・20L）。燃費は (200 + 250) ÷ (15 + 20) */
export const PARTIAL_EXAMPLE = { partialKm: 200, partialL: 15, fullKm: 250, fullL: 20 } as const;

export function partialExampleEfficiency(): number {
  const { partialKm, partialL, fullKm, fullL } = PARTIAL_EXAMPLE;
  return calculateFuelMetrics(partialKm + fullKm, partialL + fullL, null).fuel_efficiency ?? 0;
}

export type LogItem = { name: string; how: string; required: boolean };

/** 給油のたびに残す項目。required = 燃費と単価の計算に必要 */
export const FUEL_LOG_ITEMS: readonly LogItem[] = [
  { name: "給油日", how: "レシートの日付", required: true },
  { name: "区間距離（km）", how: "前回の給油からのトリップメーターの値", required: true },
  { name: "給油量（L）", how: "レシートの給油量", required: true },
  { name: "支払総額（円）", how: "レシートの合計金額", required: true },
  { name: "満タンかどうか", how: "満タンまで入れなかった回は印を付ける", required: false },
  { name: "店名・燃料の種類・メモ", how: "あとで比べたいときに", required: false },
];

/**
 * ページの FAQ と JSON-LD の FAQPage で共有する。本文（記録する項目・手順・部分給油と記録し忘れ・続けるコツ）で答えていることは載せない。
 * AI の読み取りの可否はお試しの有無で変わる。
 */
export function fuelLogFaqs(trialEnabled: boolean): FaqEntry[] {
  const ai = aiAvailabilityCopy(trialEnabled);
  return [
    {
      q: "車のメーターに出る平均燃費と違うのはなぜ？",
      a: "車の燃費計は車が測った値から計算した目安で、満タン法の値と一致するとは限りません。満タン法は実際に入れた給油量で割るので、給油の記録から出した燃費として比べやすい値です。",
    },
    {
      q: "トリップメーターをリセットし忘れたら？",
      a: "積算距離（オドメーター）を毎回残しておけば、前回との差が区間距離になります。FuelLens では車両の距離の入力方式を「オドメーター」にすると、積算距離の差から区間距離を自動で計算します。",
    },
    {
      q: "無料で使えますか？",
      a: `はい、すべての基本機能を無料で使えます${ai.faqFreeNote}。手入力と記録の保存は登録なしでも使えます。`,
    },
  ];
}

/**
 * /fuel-log の構造化データ（WebPage + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildFuelLogJsonLd(faqs: readonly FaqEntry[]): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: FUEL_LOG_PAGE_TITLE,
        url: FUEL_LOG_CANONICAL_URL,
        inLanguage: "ja",
        description: FUEL_LOG_DESCRIPTION,
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
  return jsonLdString(data);
}
