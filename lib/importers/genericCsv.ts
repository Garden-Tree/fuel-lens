/**
 * 任意の CSV（Excel・Google スプレッドシートの自作の記録、他アプリの書き出し）を、列の割り当てを選んで読み込む純粋関数。
 * React・保存先には依存しない。Fuelio / FuelLens の CSV は専用の読み込み（fuelio.ts / fuellensCsv.ts）が先に判定する。
 *
 * 流れ: readGenericCsvTable（1 行目 = 列名）→ guessGenericCsvMapping（列名から割り当てを推測。画面で変更可）
 * → parseGenericCsv（割り当てどおりに各行を読む。読めない行は理由つきで読み飛ばす）→ genericCsvToBackup（バックアップ形式）。
 * 以降は Fuelio と同じく復元と同じ planRestore で追記のみ取り込む。
 *
 * - 距離の列は「区間距離（トリップメーター）」か「積算距離（オドメーター）」を利用者が選ぶ。
 *   トリップなら total_distance に、オドメーターなら odometer に入れ、取り込み先の新しい車両の距離の入力方式もそれに合わせる。
 *   燃費はどちらでも計算しない（fuel_efficiency は null）。読み取り時に lib/fillChain.ts の applyFillChain が出す。CSV の燃費の列は使わない
 * - 単価は CSV の値をそのまま使い、無ければ金額と給油量から calculateFuelMetrics で出す（丸めはアプリ全体と同じ）。
 *   単価だけのときは金額を作らない（null のまま）
 * - 満タンの列が無ければすべて満タン。空のセルも満タン
 */

import { BACKUP_APP_ID, BACKUP_MAX_RECORDS, BACKUP_VERSION, type FuelLensBackup } from "../backup";
import { calculateFuelMetrics } from "../calculations";
import { isValidCalendarDate } from "../dates";
import { sanitizeMemo, sanitizeOdometer } from "../fillChain";
import type { DistanceMode, FuelRecord, VehicleType } from "../types";
import { hashString, isBlankRow, parseCsvNumber, parseCsvRows } from "./csvParse";

const MAX_VEHICLE_NAME_LENGTH = 50;
const MAX_GAS_STATION_LENGTH = 200;
export const GENERIC_CSV_DEFAULT_VEHICLE_NAME = "インポートした車両";

// ------------------------------------------------------------------
// 表（列名 + データ行）
// ------------------------------------------------------------------

export type GenericCsvTable = {
  /** 列名（空の列名は「列 N」） */
  headers: string[];
  /** データ行（空行は除く）。各行の値は列名と同じ位置 */
  rows: string[][];
  /** rows[i] がファイルの何行目か（1 始まり。プレビューの読み飛ばし理由に出す） */
  lineNumbers: number[];
};

export type ReadGenericCsvTableResult = ({ ok: true } & GenericCsvTable) | { ok: false; error: string };

/**
 * CSV を列名とデータ行に分ける。最初の空でない行を列名とみなす。エラーメッセージは日本語でそのまま画面に出してよい。
 */
export function readGenericCsvTable(text: string): ReadGenericCsvTableResult {
  const fail = (error: string): ReadGenericCsvTableResult => ({ ok: false, error });
  if (typeof text !== "string" || text.trim() === "") return fail("ファイルが空です。");
  const all = parseCsvRows(text);
  const headerIndex = all.findIndex(r => !isBlankRow(r));
  if (headerIndex < 0) return fail("ファイルが空です。");
  const headers = all[headerIndex].map((h, i) => normalizeCellText(h) || `列 ${i + 1}`);
  if (headers.length < 2) return fail("列が 1 つしかありません。カンマ区切りの CSV を選んでください。");

  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  for (let i = headerIndex + 1; i < all.length; i++) {
    if (isBlankRow(all[i])) continue;
    rows.push(all[i]);
    // 値の中の改行で行がずれることはあるが、目安の行番号として使う
    lineNumbers.push(i + 1);
  }
  if (rows.length === 0) return fail("データの行がありません（1 行目は列名として扱います）。");
  if (rows.length > BACKUP_MAX_RECORDS) {
    return fail(`記録が多すぎます（最大 ${BACKUP_MAX_RECORDS.toLocaleString("ja-JP")} 件）。`);
  }
  return { ok: true, headers, rows, lineNumbers };
}

// ------------------------------------------------------------------
// 列の割り当て
// ------------------------------------------------------------------

/** 割り当ての対象。値は列の位置（0 始まり）、null は「使わない」 */
export type GenericCsvMapping = {
  date: number | null;
  fuel: number | null;
  distance: number | null;
  /** 距離の列の意味。trip = 区間距離（トリップメーター）、odometer = 積算距離（オドメーター） */
  distanceKind: DistanceMode;
  totalCost: number | null;
  pricePerUnit: number | null;
  isFull: number | null;
  station: number | null;
  memo: number | null;
};

export type GenericCsvColumnKey = Exclude<keyof GenericCsvMapping, "distanceKind">;

export const EMPTY_GENERIC_CSV_MAPPING: GenericCsvMapping = {
  date: null,
  fuel: null,
  distance: null,
  distanceKind: "trip",
  totalCost: null,
  pricePerUnit: null,
  isFull: null,
  station: null,
  memo: null,
};

/** 全角英数字・記号を半角にし（NFKC）、前後の空白を除く */
export function normalizeCellText(raw: string | undefined): string {
  return (raw ?? "").normalize("NFKC").trim();
}

/** 列名の比較用（NFKC・小文字・空白なし） */
function headerKey(raw: string): string {
  return normalizeCellText(raw).toLowerCase().replace(/\s+/g, "");
}

/** 燃費の列（CSV の燃費は使わない。どの割り当てにも推測しない） */
const IGNORED_HEADER = /燃費|km\/l|l\/100|mpg|consumption|efficiency|economy/;

/** 推測の規則。強い順に試し、まだ割り当てていない最初の列を使う */
const GUESS_RULES: Record<"date" | "trip" | "odometer" | "tripWeak" | "fuel" | "totalCost" | "pricePerUnit" | "isFull" | "station" | "memo", { include: RegExp[]; exclude?: RegExp }> = {
  date: { include: [/^(日付|給油日|日時|年月日|date)$/, /日付|給油日|年月日|^date/] },
  trip: { include: [/区間|トリップ|trip/] },
  odometer: { include: [/オドメーター|odometer|^odo|積算|総走行距離|累計/] },
  tripWeak: { include: [/走行距離|^距離|distance|^km$|\(km\)$/] },
  fuel: {
    include: [/給油量|数量|リットル|litre|liter|volume|^l$|\(l\)$|^ℓ$/, /fuel|燃料|ガソリン|^量$/],
    exclude: /種|type|単価|price|cost|代|円|金額|economy/,
  },
  totalCost: {
    include: [/金額|合計|料金|支払|代金|総額|ガソリン代|cost|total|amount|^円$|\(円\)$/],
    exclude: /単価|\/l|per|量|volume|lit|距離|distance/,
  },
  pricePerUnit: { include: [/単価|price|円\/l|yen\/l/] },
  isFull: { include: [/満タン|full|^満$/] },
  station: { include: [/スタンド|給油所|station|店|location|場所|ss名/] },
  memo: { include: [/メモ|備考|note|memo|comment|コメント/] },
};

/**
 * 列名から割り当てを推測する（日本語・英語、全角・半角。画面で変更できる）。
 * 距離は「区間・トリップ」の列 → 「積算・オドメーター」の列 → 「走行距離・距離」の列の順に探し、オドメーターの列なら distanceKind も odometer にする。
 */
export function guessGenericCsvMapping(headers: readonly string[]): GenericCsvMapping {
  const keys = headers.map(headerKey);
  const used = new Set<number>();
  keys.forEach((k, i) => {
    if (IGNORED_HEADER.test(k)) used.add(i);
  });
  const find = (rule: keyof typeof GUESS_RULES): number | null => {
    const { include, exclude } = GUESS_RULES[rule];
    for (const re of include) {
      const idx = keys.findIndex((k, i) => !used.has(i) && re.test(k) && !(exclude && exclude.test(k)));
      if (idx >= 0) {
        used.add(idx);
        return idx;
      }
    }
    return null;
  };

  const mapping: GenericCsvMapping = { ...EMPTY_GENERIC_CSV_MAPPING };
  mapping.date = find("date");
  const trip = find("trip");
  const odometer = trip === null ? find("odometer") : null;
  if (trip !== null) {
    mapping.distance = trip;
  } else if (odometer !== null) {
    mapping.distance = odometer;
    mapping.distanceKind = "odometer";
  } else {
    mapping.distance = find("tripWeak");
  }
  mapping.fuel = find("fuel");
  mapping.totalCost = find("totalCost");
  mapping.pricePerUnit = find("pricePerUnit");
  mapping.isFull = find("isFull");
  mapping.station = find("station");
  mapping.memo = find("memo");
  return mapping;
}

// ------------------------------------------------------------------
// 値の読み取り
// ------------------------------------------------------------------

/** Excel の日付シリアル値として受け付ける範囲（1970-01-01 〜 2099-12-31） */
const EXCEL_SERIAL_MIN = 25569;
const EXCEL_SERIAL_MAX = 73050;
const MS_PER_DAY = 86_400_000;
/** Excel のシリアル値 0 の日（1900 年のうるう年の誤りを含めた 1899-12-30） */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string | null {
  const s = `${String(y).padStart(4, "0")}-${pad2(m)}-${pad2(d)}`;
  return isValidCalendarDate(s) ? s : null;
}

/**
 * 日付を YYYY-MM-DD にする。読めなければ null（推測しない）。
 * - 年が先頭の形: `2026/1/5`・`2026-01-05`・`2026.1.5`・`2026年1月5日`（後ろの時刻や曜日 `(月)` は無視）
 * - Excel の日付シリアル値（`46027` など、1970〜2099 年の範囲の数だけ。小数は時刻として無視）
 * 月/日/年・日/月/年の形は、どちらか決められないので読まない。
 */
export function parseGenericDate(raw: string | undefined): string | null {
  const s = normalizeCellText(raw);
  if (s === "") return null;
  let m = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:$|[\sT(（])/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(s);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < EXCEL_SERIAL_MIN || serial > EXCEL_SERIAL_MAX) return null;
    const d = new Date(EXCEL_EPOCH_UTC + serial * MS_PER_DAY);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}

/**
 * 数値を読む。空・不正は null。全角数字は半角にし、空白・`¥`・`円`・`L`・`ℓ`・`km`・`リットル` と桁区切りのカンマを除く。
 * 負の数・1e9 を超える数は null（parseCsvNumber と同じ）。
 */
export function parseGenericNumber(raw: string | undefined): number | null {
  let s = normalizeCellText(raw).replace(/\s+/g, "");
  if (s === "") return null;
  s = s.replace(/^[¥\\$]/, "").replace(/(円|リットル|km|l)$/i, "");
  return parseCsvNumber(s);
}

const FULL_TRUE = new Set(["はい", "yes", "y", "true", "1", "○", "◯", "〇", "o", "満タン", "満", "full", "✓", "✔"]);
const FULL_FALSE = new Set(["いいえ", "no", "n", "false", "0", "×", "x", "✕", "✗", "部分", "部分給油", "partial"]);

/** 満タンの列の値。true = 満タン、false = 部分給油、空は null（満タン扱い）、読めなければ undefined */
export function parseFullTankFlag(raw: string | undefined): boolean | null | undefined {
  const s = normalizeCellText(raw).toLowerCase().replace(/\s+/g, "");
  if (s === "") return null;
  if (FULL_TRUE.has(s)) return true;
  if (FULL_FALSE.has(s)) return false;
  return undefined;
}

// ------------------------------------------------------------------
// 行の読み取り
// ------------------------------------------------------------------

/** 取り込む記録（vehicle_id・created_at・source は genericCsvToBackup で入れる） */
export type GenericCsvRecord = Omit<FuelRecord, "vehicle_id" | "created_at" | "source" | "run_distance" | "run_fuel" | "run_cost"> &
  Required<Pick<FuelRecord, "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo">>;

export type GenericCsvSkip = {
  /** ファイルの何行目か（1 始まり） */
  line: number;
  reason: string;
};

export type ParsedGenericCsv = {
  ok: true;
  distanceKind: DistanceMode;
  records: GenericCsvRecord[];
  /** 読み飛ばした行（ファイル順） */
  skipped: GenericCsvSkip[];
  stats: {
    rows: number;
    /** 部分給油の件数 */
    partial: number;
    /** 距離が空の行（区間距離・燃費は出ない） */
    emptyDistance: number;
  };
};

export type ParseGenericCsvResult = ParsedGenericCsv | { ok: false; error: string };

/** 必須の割り当てが足りなければ日本語のメッセージ、そろっていれば null */
export function genericCsvMappingError(mapping: GenericCsvMapping): string | null {
  const missing: string[] = [];
  if (mapping.date === null) missing.push("日付");
  if (mapping.fuel === null) missing.push("給油量");
  if (mapping.distance === null) missing.push("距離");
  return missing.length > 0 ? `${missing.join("・")}の列を選んでください。` : null;
}

/**
 * 割り当てどおりに各行を読む。エラーメッセージ・読み飛ばし理由は日本語でそのまま画面に出してよい。
 * 読み飛ばす行（推測で埋めない）: 日付が読めない、給油量が空・0・読めない、距離・金額・単価に読めない値がある、満タンの値が読めない。
 * 距離が空の行は取り込む（先頭の給油など。区間距離・燃費は出ない）。
 */
export function parseGenericCsv(table: GenericCsvTable, mapping: GenericCsvMapping): ParseGenericCsvResult {
  const mappingError = genericCsvMappingError(mapping);
  if (mappingError) return { ok: false, error: mappingError };

  const cell = (row: readonly string[], idx: number | null): string => (idx === null ? "" : (row[idx] ?? ""));
  /** 空なら null、読めなければ undefined */
  const optionalNumber = (row: readonly string[], idx: number | null): number | null | undefined => {
    const raw = cell(row, idx);
    if (normalizeCellText(raw) === "") return null;
    return parseGenericNumber(raw) ?? undefined;
  };

  const records: GenericCsvRecord[] = [];
  const skipped: GenericCsvSkip[] = [];
  const usedIds = new Set<string>();
  let partial = 0;
  let emptyDistance = 0;

  table.rows.forEach((row, i) => {
    const line = table.lineNumbers[i] ?? i + 2;
    const skip = (reason: string) => skipped.push({ line, reason });

    const date = parseGenericDate(cell(row, mapping.date));
    if (!date) return skip("日付が読めません");
    const fuel = parseGenericNumber(cell(row, mapping.fuel));
    if (fuel === null || fuel === 0) return skip("給油量が読めません");
    const distance = optionalNumber(row, mapping.distance);
    if (distance === undefined) return skip("距離が読めません");
    const cost = optionalNumber(row, mapping.totalCost);
    if (cost === undefined) return skip("金額が読めません");
    const price = optionalNumber(row, mapping.pricePerUnit);
    if (price === undefined) return skip("単価が読めません");
    const full = mapping.isFull === null ? null : parseFullTankFlag(cell(row, mapping.isFull));
    if (full === undefined) return skip("満タンの値が読めません");

    const isFull = full ?? true;
    if (!isFull) partial += 1;
    if (distance === null) emptyDistance += 1;
    // 金額は整数円（FuelLens は円のみ）。0 は不明として扱う
    const totalCost = cost === null || Math.round(cost) === 0 ? null : Math.round(cost);
    const pricePerUnit = (price === 0 ? null : price) ?? calculateFuelMetrics(null, fuel, totalCost).price_per_unit;
    const station = normalizeCellText(cell(row, mapping.station)).slice(0, MAX_GAS_STATION_LENGTH) || null;
    const odometer = mapping.distanceKind === "odometer" ? sanitizeOdometer(distance) : null;
    const tripDistance = mapping.distanceKind === "trip" ? distance : null;

    const baseId = `generic-csv-${hashString(
      [date, fuel, totalCost ?? "", distance ?? "", mapping.distanceKind, station ?? ""].join("|")
    )}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);

    records.push({
      id,
      date,
      total_distance: tripDistance,
      fuel_amount: fuel,
      gas_station: station,
      price_per_unit: pricePerUnit,
      total_cost: totalCost,
      // 燃費は読み取り時に applyFillChain が出す（CSV の燃費の列は使わない）
      fuel_efficiency: null,
      odometer,
      is_full: isFull,
      missed_previous: false,
      fuel_type: null,
      memo: sanitizeMemo(cell(row, mapping.memo)),
    });
  });

  return {
    ok: true,
    distanceKind: mapping.distanceKind,
    records,
    skipped,
    stats: { rows: records.length, partial, emptyDistance },
  };
}

/**
 * 読み込んだ記録をバックアップ（version 2、車両 1 台）に変換する。
 * 車両の距離の入力方式は distanceKind（新規作成されるときに使われる。名前 + 種別が一致する既存車両に追加するときは既存車両の設定のまま。
 * 方式が違う既存車両への追加は画面で止める）。車両 ID は `generic-csv-v-<車両名のハッシュ>`。
 */
export function genericCsvToBackup(
  parsed: ParsedGenericCsv,
  options: { vehicleName?: string; vehicleType?: VehicleType; now?: Date } = {}
): FuelLensBackup {
  const name =
    (options.vehicleName ?? "").trim().slice(0, MAX_VEHICLE_NAME_LENGTH).trim() || GENERIC_CSV_DEFAULT_VEHICLE_NAME;
  const vehicleId = `generic-csv-v-${hashString(name)}`;
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    vehicles: [
      {
        id: vehicleId,
        name,
        type: options.vehicleType ?? "car",
        distance_mode: parsed.distanceKind,
        default_fuel_type: null,
      },
    ],
    records: parsed.records.map(r => ({ ...r, vehicle_id: vehicleId, created_at: null, source: "import" })),
  };
}
