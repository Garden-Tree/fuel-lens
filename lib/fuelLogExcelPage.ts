/**
 * 燃費管理をエクセルでするページ（/fuel-log-excel）の純粋な定数と関数: 列の例・FAQ・構造化データ（JSON-LD）。
 * 「燃費 管理 エクセル」「給油記録 エクセル」などの検索からの入口。
 * 書く内容はアプリの実際の動作に合わせる（新しい機能は足さない）:
 * - 取り込める CSV: lib/importers/fuellensCsv.ts（ヘッダーに lib/csv.ts の RECORDS_CSV_BASE_HEADERS がすべてあれば全車両 CSV として読む。
 *   列の順番は問わない。追加列 RECORD_CSV_EXTRA_HEADERS は任意で、満タン・記録漏れは「はい / いいえ」。
 *   日付が読めない行、給油量も支払総額も無い行は読み飛ばし。日付は yyyy/MM/dd・yyyy-MM-dd など（lib/importers/csvParse.ts の parseFlexibleDate）。
 *   1,234 のような桁区切りも読める（parseCsvNumber）。車両の種別は同じ名前の既存車両に合わせ、無ければクルマ）
 * - 列名が違う CSV: lib/importers/genericCsv.ts（日付・給油量・距離は必須、距離は区間距離か積算距離かを選ぶ。
 *   金額・単価・満タン・スタンド名・メモは任意。列名から推測し、画面で選び直せる。読めない行は理由つきで読み飛ばし）
 * - 文字コード: lib/importers/csvParse.ts の decodeCsvBytes（UTF-8 で読み、壊れていれば Shift_JIS として読み直す）
 * - 取り込み画面: 設定画面の「インポート」→ CSV を選ぶ →（列名が違えば列を選ぶ）→ 確認 →「取り込む」。ログイン不要
 * - 追記のみ・重複スキップ: lib/backup.ts の planRestore。上限は BACKUP_MAX_TEXT_LENGTH（30MB）・BACKUP_MAX_RECORDS（50,000 件）
 * - 書き出し: 設定画面の「全車両のCSVを書き出す」（lib/csv.ts の RECORDS_CSV_HEADERS。取り込みと同じ列名）
 * - 燃費は読み込み時に lib/fillChain.ts の applyFillChain が区間距離と給油量から計算し直す（CSV の燃費の値は信頼しない）
 * - AI の読み取りの可否（お試しの有無）: lib/landingPage.ts の aiAvailabilityCopy
 *
 * Excel・Google スプレッドシートについて書く事実と出典:
 * - IFERROR(値, エラーの場合の値): #DIV/0! などのとき指定の値を返す
 *   https://support.microsoft.com/ja-jp/office/iferror-%E9%96%A2%E6%95%B0-c526fd07-caeb-47b8-8bb6-63f3e417f611
 * - Excel の CSV 保存:「名前を付けて保存」で「CSV UTF-8 (コンマ区切り)」または「CSV (コンマ区切り)」を選ぶ。Excel for the web では CSV で保存できない
 *   https://support.microsoft.com/en-us/office/save-a-worksheet-as-a-csv-file-8303b161-b926-4c01-acc5-c038a2a8958c
 * - Google スプレッドシート:「ファイル」→「ダウンロード」でファイル形式を選ぶ
 *   https://support.google.com/docs/answer/49114?hl=ja
 * 製品の優劣は書かない。
 */

import type { FaqEntry } from "./calcPage";
import { RECORD_CSV_EXTRA_HEADERS, RECORDS_CSV_BASE_HEADERS } from "./csv";
import { aiAvailabilityCopy } from "./landingPage";
import { DEFAULT_SITE_URL } from "./siteUrl";
import { jsonLdString } from "./jsonLd";

export const FUEL_LOG_EXCEL_PATH = "/fuel-log-excel";
/** ナビゲーション・関連ページのリンクの表示名（lib/publicNav.ts の FUEL_LOG_GUIDE_LINKS と同じ） */
export const FUEL_LOG_EXCEL_TITLE = "燃費管理をエクセルで";
/** 構造化データの url に使う本番の絶対 URL */
export const FUEL_LOG_EXCEL_CANONICAL_URL = `${DEFAULT_SITE_URL}${FUEL_LOG_EXCEL_PATH}`;

/** 検索結果のタイトル（absolute で指定する） */
export const FUEL_LOG_EXCEL_PAGE_TITLE = "燃費管理をエクセルで｜列の作り方と計算式・アプリへの移行 | FuelLens";

/** 検索結果の説明文（110〜120 字）。お試しの有無に触れない */
export const FUEL_LOG_EXCEL_DESCRIPTION =
  "エクセルで燃費管理をするなら、日付・区間距離・給油量・金額の列を作り、燃費は区間距離÷給油量の式で出します。部分給油と平均燃費の注意点、同じ列名でCSV保存して、無料の燃費記録アプリFuelLensへ記録をまとめて移す方法も紹介します。";

/** Excel の IFERROR のヘルプ（Microsoft サポート） */
export const IFERROR_HELP_URL =
  "https://support.microsoft.com/ja-jp/office/iferror-%E9%96%A2%E6%95%B0-c526fd07-caeb-47b8-8bb6-63f3e417f611";

/** 取り込める上限（表示用）。lib/backup.ts の値と同じことはテストで確かめる（fuelioPage と同じ理由で backup.ts は import しない） */
export const EXCEL_MAX_FILE_MB = 30;
export const EXCEL_MAX_RECORDS = 50_000;

export type SheetColumn = {
  /** 列の記号（A〜） */
  letter: string;
  /** 1 行目に書く列名（FuelLens の CSV の列名と同じ） */
  header: string;
  /** 2 行目に入れるもの（値の例か数式） */
  input: string;
};

/** 数式の列（単価・燃費）に入れる 2 行目の式。列の位置は RECORDS_CSV_BASE_HEADERS の並びから決める */
function columnLetter(header: string): string {
  return String.fromCharCode(65 + RECORDS_CSV_BASE_HEADERS.indexOf(header as (typeof RECORDS_CSV_BASE_HEADERS)[number]));
}

/** 列の例。並びと列名は FuelLens の全車両 CSV（RECORDS_CSV_BASE_HEADERS）と同じにして、そのまま取り込めるようにする */
export function sheetColumns(): SheetColumn[] {
  const fuel = columnLetter("給油量(L)");
  const cost = columnLetter("支払総額(円)");
  const distance = columnLetter("走行距離(km)");
  const inputs: Record<(typeof RECORDS_CSV_BASE_HEADERS)[number], string> = {
    車両: "車の名前（例: メインカー）",
    日付: "2026/11/12",
    "給油量(L)": "30",
    "支払総額(円)": "5100",
    "単価(円/L)": `=IFERROR(ROUND(${cost}2/${fuel}2,1),"")`,
    "走行距離(km)": "420（トリップメーターの区間距離）",
    "燃費(km/L)": `=IFERROR(ROUND(${distance}2/${fuel}2,2),"")`,
    店舗名: "店の名前",
  };
  return RECORDS_CSV_BASE_HEADERS.map((header) => ({ letter: columnLetter(header), header, input: inputs[header] }));
}

/** 任意で足せる列（RECORD_CSV_EXTRA_HEADERS）と書き方 */
export const OPTIONAL_COLUMNS: readonly { header: string; input: string }[] = [
  { header: RECORD_CSV_EXTRA_HEADERS.odometer, input: "積算距離。区間距離の代わりに使える" },
  { header: RECORD_CSV_EXTRA_HEADERS.isFull, input: "はい / いいえ（空なら満タン）" },
  { header: RECORD_CSV_EXTRA_HEADERS.missedPrevious, input: "はい / いいえ（前回の給油を記録し忘れた）" },
  { header: RECORD_CSV_EXTRA_HEADERS.fuelType, input: "レギュラー / ハイオク / 軽油 / その他" },
  { header: RECORD_CSV_EXTRA_HEADERS.memo, input: "自由なメモ（200 文字まで）" },
];

/**
 * ページの FAQ と JSON-LD の FAQPage で共有する。本文（列・数式・部分給油・平均燃費・取り込み手順）で答えていることは載せない。
 */
export function fuelLogExcelFaqs(trialEnabled: boolean): FaqEntry[] {
  const ai = aiAvailabilityCopy(trialEnabled);
  return [
    {
      q: "Google スプレッドシートでも同じようにできますか？",
      a: "はい。同じ列名と数式で作れます。CSV にするときは「ファイル」→「ダウンロード」でファイル形式に CSV を選びます。",
    },
    {
      q: "取り込んだあと、エクセルに戻すこともできますか？",
      a: "はい。設定画面の「全車両のCSVを書き出す」で、取り込みと同じ列名の CSV を書き出せます。Excel で開いても文字化けしない形式です。",
    },
    {
      q: "無料で使えますか？",
      a: `はい、すべての基本機能を無料で使えます${ai.faqFreeNote}。CSV の取り込みと手入力は登録なしでも使えます。`,
    },
  ];
}

/** /fuel-log-excel の構造化データ（WebPage + FAQPage）。固定の文言だけから作る */
export function buildFuelLogExcelJsonLd(faqs: readonly FaqEntry[]): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: FUEL_LOG_EXCEL_PAGE_TITLE,
        url: FUEL_LOG_EXCEL_CANONICAL_URL,
        inLanguage: "ja",
        description: FUEL_LOG_EXCEL_DESCRIPTION,
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
