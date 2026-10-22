/**
 * Fuelio からの乗り換えページ（/fuelio）の純粋な定数と関数: FAQ と構造化データ（JSON-LD）。
 * 書く内容はアプリの実際の動作に合わせる（新しい機能は足さない）:
 * - 列の対応・読み飛ばし・車両の作り方: lib/importers/fuelio.ts（Odo / Full / Missed / FuelType / Notes / City、TankNumber >= 2 は対象外、
 *   マイル・ガロンは非対応、車両は distance_mode = "odometer"、区間距離と燃費は applyFillChain が積算距離から計算）
 * - 取り込み画面: components/ImportPanel.tsx（設定画面の「インポート」→「Fuelio の CSV を選ぶ」→ 確認 →「取り込む」。ログイン不要）
 * - 追記のみ・重複スキップ: lib/backup.ts の planRestore（同じ id、または同じ車両・日付・給油量 ±0.01・支払総額）
 * - 上限: BACKUP_MAX_TEXT_LENGTH（30MB）、BACKUP_MAX_RECORDS（50,000 件）
 * - Fuelio 側の書き出し: Fuelio 公式 FAQ（https://fuel.io/faq_backup_help.html）の「Settings/Backup/Export CSV」
 * - AI の読み取りの可否（お試しの有無）: lib/landingPage.ts の aiAvailabilityCopy
 * FuelLens は Fuelio とは無関係の別サービス。
 */

import type { FaqEntry } from "./calcPage";
import { aiAvailabilityCopy } from "./landingPage";
import { DEFAULT_SITE_URL } from "./siteUrl";

export const FUELIO_PATH = "/fuelio";
/** ナビゲーション・関連ページのリンクの表示名 */
export const FUELIO_TITLE = "Fuelio からの乗り換え";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/fuelio`） */
export const FUELIO_CANONICAL_URL = `${DEFAULT_SITE_URL}${FUELIO_PATH}`;
/** Fuelio 公式の「バックアップとデータの取り込み」ヘルプ（CSV の書き出し先の案内がある） */
export const FUELIO_HELP_URL = "https://fuel.io/faq_backup_help.html";

/** 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する） */
export const FUELIO_PAGE_TITLE = "Fuelio から乗り換え｜CSV で給油記録を取り込める燃費記録アプリ | FuelLens";

/** 検索結果の説明文（110〜120 字程度）。お試しの有無に触れない */
export const FUELIO_DESCRIPTION =
  "Fuelioの燃費記録をFuelLensへ。FuelioのCSVを設定画面から取り込めば、給油記録を引き継げます。取り込みは追記のみで既存データは消えず、同じ記録は重複しません。燃費は走行距離の差から自動計算。無料で使えます。";

/**
 * 取り込めるファイルの上限（表示用）。lib/backup.ts の BACKUP_MAX_TEXT_LENGTH（30MB）・BACKUP_MAX_RECORDS と同じ値。
 * backup.ts は React のフックを含むモジュールを読み込むため静的ページからは import せず、値の一致はテストで確かめる。
 */
export const FUELIO_MAX_FILE_MB = 30;
export const FUELIO_MAX_RECORDS = 50_000;
export const FUELIO_MAX_RECORDS_TEXT = FUELIO_MAX_RECORDS.toLocaleString("ja-JP");

export type FuelioColumnMapping = { fuelio: string; fuellens: string; note?: string };

/** Fuelio の CSV の列と FuelLens の項目の対応。lib/importers/fuelio.ts の列の探し方・変換に合わせる */
export const FUELIO_COLUMN_MAPPINGS: readonly FuelioColumnMapping[] = [
  { fuelio: "Data（日付）", fuellens: "給油日" },
  { fuelio: "Odo", fuellens: "積算距離（オドメーター）" },
  { fuelio: "Fuel（給油量）", fuellens: "給油量（L）" },
  { fuelio: "Price", fuellens: "支払総額", note: "空・0 のときは VolumePrice（単価）× 給油量で補います" },
  { fuelio: "Full", fuellens: "満タン", note: "満タンでない行は部分給油として扱います" },
  { fuelio: "Missed", fuellens: "前回の給油の記録漏れ" },
  { fuelio: "FuelType", fuellens: "燃料種別", note: "番号の対応は不明なため、0 と空は未指定、その他の番号は「その他」にします" },
  { fuelio: "Notes", fuellens: "メモ" },
  { fuelio: "City", fuellens: "店舗名" },
];

/** ページの FAQ と JSON-LD の FAQPage で共有する。AI の読み取りの可否はお試しの有無で変わる */
export function fuelioFaqs(trialEnabled: boolean): FaqEntry[] {
  const ai = aiAvailabilityCopy(trialEnabled);
  return [
    {
      q: "取り込むと Fuelio のデータは消えますか？",
      a: "いいえ。FuelLens は Fuelio のアプリやデータには触れません。選んだ CSV ファイルを読み込むだけなので、Fuelio 側の記録はそのまま残ります。",
    },
    {
      q: "同じ CSV を何度取り込んでも重複しませんか？",
      a: "重複しません。同じ記録（同じ ID、または同じ車両・同じ日付・ほぼ同じ給油量・同じ支払総額）は取り込み時にスキップされます。取り込みは追記のみで、FuelLens にある既存の記録は削除も上書きもされません。",
    },
    {
      q: "ログインしないと取り込めませんか？",
      a: "ログインなしでも取り込めます。その場合はこのブラウザに保存されます。ログインしている場合はクラウドのデータへ追加されます。",
    },
    {
      q: "マイルやガロンで記録していても取り込めますか？",
      a: "いいえ。距離がマイル、給油量がリットル以外の CSV には対応していません。Fuelio の設定で km とリットルにしてから書き出してください。",
    },
    {
      q: "無料で使えますか？",
      a: `はい、すべての基本機能を無料で使えます${ai.faqFreeNote}。手入力と記録の保存は登録なしでも使えます。`,
    },
    {
      q: "iPhone でも使えますか？",
      a: "はい。FuelLens は Web アプリなので、iPhone や Android のブラウザ、パソコンから使えます。CSV を取り込む操作も同じです。",
    },
  ];
}

/**
 * /fuelio の構造化データ（WebPage + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildFuelioJsonLd(faqs: readonly FaqEntry[]): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: FUELIO_PAGE_TITLE,
        url: FUELIO_CANONICAL_URL,
        inLanguage: "ja",
        description: FUELIO_DESCRIPTION,
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
