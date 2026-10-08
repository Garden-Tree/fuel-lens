/**
 * CSV 出力の純粋ヘルパー（履歴画面の CSV 出力と設定画面の全車両 CSV 出力で共有）。
 *
 * - 文字列は常にダブルクォートで囲み、内部の `"` は `""` にエスケープする。
 * - CSV インジェクション対策: `=` `+` `-` `@` タブ CR で始まる値は Excel 等で数式として
 *   実行される恐れがあるため、先頭にシングルクォートを付けて無害化する。
 * - Excel での文字化けを防ぐため、先頭に UTF-8 の BOM を付ける。
 */

import { isFuelType } from "./fillChain";
import { FUEL_TYPE_LABELS, type FuelRecord, type Vehicle } from "./types";

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

/** 全車両 CSV の基本の列（FuelLens CSV の取り込みでは、これがすべてあれば全車両 CSV とみなす） */
export const RECORDS_CSV_BASE_HEADERS = [
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
 * 0004（連鎖計算）で追加した列。全車両 CSV では基本の列の後ろに並ぶ。
 * 取り込み時は任意（無ければ既定値: オドメーターなし・満タン・記録漏れなし・燃料種別なし・メモなし）。
 */
export const RECORD_CSV_EXTRA_HEADERS = {
  odometer: "オドメーター(km)",
  isFull: "満タン",
  missedPrevious: "記録漏れ",
  fuelType: "燃料種別",
  memo: "メモ",
} as const;

export const RECORDS_CSV_HEADERS = [
  ...RECORDS_CSV_BASE_HEADERS,
  RECORD_CSV_EXTRA_HEADERS.odometer,
  RECORD_CSV_EXTRA_HEADERS.isFull,
  RECORD_CSV_EXTRA_HEADERS.missedPrevious,
  RECORD_CSV_EXTRA_HEADERS.fuelType,
  RECORD_CSV_EXTRA_HEADERS.memo,
] as const;

/** 真偽値の列（満タン・記録漏れ）の表記 */
export const CSV_YES = "はい";
export const CSV_NO = "いいえ";

/** 真偽値を「はい / いいえ」にする（エスケープ済み） */
export function formatCsvBoolean(value: boolean): string {
  return escapeCsvField(value ? CSV_YES : CSV_NO);
}

/** 燃料種別を表示名にする（エスケープ済み）。未指定・不明は `""` */
export function formatCsvFuelType(value: unknown): string {
  return escapeCsvField(isFuelType(value) ? FUEL_TYPE_LABELS[value] : null);
}

/**
 * 記録の 0004 で追加した列（RECORD_CSV_EXTRA_HEADERS の順）をエスケープ済みの値にする。
 * 既定値の扱いは normalizeRecord と同じ（is_full は false 以外「はい」、missed_previous は true のときだけ「はい」）。
 * メモの改行はダブルクォートの中にそのまま入る。
 */
export function formatRecordExtraCsvFields(
  rec: Pick<FuelRecord, "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo">
): string[] {
  return [
    formatCsvNumber(rec.odometer),
    formatCsvBoolean(rec.is_full !== false),
    formatCsvBoolean(rec.missed_previous === true),
    formatCsvFuelType(rec.fuel_type),
    escapeCsvField(typeof rec.memo === "string" ? rec.memo : null),
  ];
}

/**
 * 全車両の給油記録を CSV にする（設定画面の「全車両を CSV で書き出し」用）。
 * 車両名は vehiclesById から引く。見つからない（未分類など）場合は fallbackVehicleName。
 * 走行距離・燃費は渡された値をそのまま書く（連鎖計算を適用済みの記録を渡すこと。useFuelRecords の fetchAllRecords）。
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
    ...formatRecordExtraCsvFields(rec),
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
