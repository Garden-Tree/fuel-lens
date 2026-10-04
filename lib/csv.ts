/**
 * CSV 出力の純粋ヘルパー（履歴画面の CSV 出力と設定画面の全車両 CSV 出力で共有）。
 *
 * - 文字列は常にダブルクォートで囲み、内部の `"` は `""` にエスケープする。
 * - CSV インジェクション対策: `=` `+` `-` `@` タブ CR で始まる値は Excel 等で数式として
 *   実行される恐れがあるため、先頭にシングルクォートを付けて無害化する。
 * - Excel での文字化けを防ぐため、先頭に UTF-8 の BOM を付ける。
 */

import type { FuelRecord } from "./useFuelRecords";
import type { Vehicle } from "./useVehicles";

/** UTF-8 BOM（Blob で UTF-8 にエンコードされると EF BB BF になる） */
export const CSV_BOM = "﻿";

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/** 文字列フィールドを CSV 用にエスケープする。null / 空文字は `""`。 */
export function escapeCsvField(value: string | null | undefined): string {
  if (!value) return '""';
  const safe = FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** 数値フィールド。null / 非有限値は空欄。 */
export function formatCsvNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

/**
 * ヘッダーと（エスケープ済みの）行から CSV 文字列を作る。先頭に BOM を付け、改行は LF。
 * ヘッダーもエスケープ不要な固定文字列を前提とする。
 */
export function buildCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  return CSV_BOM + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
}

export const RECORDS_CSV_HEADERS = [
  "車両",
  "日付",
  "給油量(L)",
  "支払総額(円)",
  "単価(円/L)",
  "走行距離(km)",
  "燃費(km/L)",
  "店舗名",
] as const;

/**
 * 全車両の給油記録を CSV にする（設定画面の「全車両を CSV で書き出し」用）。
 * 車両名は vehiclesById から引く。見つからない（未分類など）場合は fallbackVehicleName。
 */
export function buildRecordsCsv(
  records: readonly FuelRecord[],
  vehiclesById: ReadonlyMap<string, Pick<Vehicle, "name">> | Readonly<Record<string, Pick<Vehicle, "name">>>,
  fallbackVehicleName = "未分類"
): string {
  const lookup = (id: string | null | undefined): string | undefined => {
    if (!id) return undefined;
    if (vehiclesById instanceof Map) return vehiclesById.get(id)?.name;
    const rec = vehiclesById as Readonly<Record<string, Pick<Vehicle, "name">>>;
    return Object.prototype.hasOwnProperty.call(rec, id) ? rec[id]?.name : undefined;
  };

  const rows = records.map(rec => [
    escapeCsvField(lookup(rec.vehicle_id) ?? fallbackVehicleName),
    escapeCsvField(rec.date),
    formatCsvNumber(rec.fuel_amount),
    formatCsvNumber(rec.total_cost),
    formatCsvNumber(rec.price_per_unit),
    formatCsvNumber(rec.total_distance),
    formatCsvNumber(rec.fuel_efficiency),
    escapeCsvField(rec.gas_station),
  ]);
  return buildCsv(RECORDS_CSV_HEADERS, rows);
}

/** ファイル名に使えない文字を `_` に置き換える（英数字・漢字・かな・長音記号は残す） */
export function toSafeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/gu, "_");
}

/** テキストをファイルとしてダウンロードさせる（ブラウザ専用） */
export function downloadTextFile(filename: string, text: string, mime: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // クリック直後に revoke すると一部ブラウザでダウンロードが始まらないため、少し遅らせる
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
