/**
 * FuelLens 自身が書き出した CSV を読み込む純粋関数。React・保存先には依存しない。
 *
 * - 全車両 CSV（設定画面）: 車両,日付,給油量(L),支払総額(円),単価(円/L),走行距離(km),燃費(km/L),店舗名
 *   （+ オドメーター(km),満タン,記録漏れ,燃料種別,メモ）
 * - 車両別 CSV（履歴画面）: 給油日,走行距離(km),給油量(L),単価(円/L),支払総額(円),燃費(km/L),ガソリンスタンド名
 *   （+ 同じ追加列）
 *
 * 追加列（lib/csv.ts の RECORD_CSV_EXTRA_HEADERS）はどちらの形式でも任意。無い列・読めない値は既定値
 * （オドメーターなし・満タン・記録漏れなし・燃料種別なし・メモなし）。古い CSV もそのまま読める。
 *
 * 列はヘッダー名で探す。lib/csv.ts の CSV インジェクション対策で付けた先頭の `'` は外す。
 * 取り込みは lib/backup.ts のバックアップ形式（FuelLensBackup）に変換し、復元と同じ planRestore で追記する。
 */

import { normalizeFuelType } from "../analyze";
import { BACKUP_APP_ID, BACKUP_MAX_RECORDS, BACKUP_VERSION, type FuelLensBackup } from "../backup";
import { calculateFuelMetrics } from "../calculations";
import { CSV_NO, CSV_YES, RECORD_CSV_EXTRA_HEADERS, RECORDS_CSV_BASE_HEADERS } from "../csv";
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  sanitizeMemo,
  sanitizeOdometer,
  type DistanceMode,
  type FuelType,
} from "../fillChain";
import type { FuelRecord } from "../useFuelRecords";
import { hashString, isBlankRow, parseCsvNumber, parseCsvRows, parseFlexibleDate, type VehicleType } from "./fuelio";

/** 履歴画面の車両別 CSV のヘッダー（app/history/page.tsx の exportToCsv と同じ） */
export const HISTORY_CSV_HEADERS = [
  "給油日",
  "走行距離(km)",
  "給油量(L)",
  "単価(円/L)",
  "支払総額(円)",
  "燃費(km/L)",
  "ガソリンスタンド名",
] as const;

export type FuelLensCsvRecord = Omit<
  FuelRecord,
  "vehicle_id" | "created_at" | "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo"
> &
  Required<Pick<FuelRecord, "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo">> & {
  /** 全車両 CSV の車両名。車両別 CSV では null */
  vehicleName: string | null;
};

export type ParsedFuelLensCsv = {
  ok: true;
  /** all = 全車両 CSV（車両列あり）、vehicle = 車両別 CSV（車両列なし） */
  format: "all" | "vehicle";
  /** 全車両 CSV に現れる車両名（出現順）。車両別 CSV では空 */
  vehicleNames: string[];
  records: FuelLensCsvRecord[];
  stats: { rows: number; skippedInvalid: number };
};

export type ParseFuelLensCsvResult = ParsedFuelLensCsv | { ok: false; error: string };

const MAX_VEHICLE_NAME_LENGTH = 50;
const MAX_GAS_STATION_LENGTH = 200;
const FALLBACK_VEHICLE_NAME = "名称未設定";
export const FUELLENS_CSV_DEFAULT_VEHICLE_NAME = "インポートした車両";

/** lib/csv.ts の escapeCsvField が数式対策で付けた先頭の `'` を外す */
function unescapeField(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** 「はい / いいえ」（と true / false / 1 / 0）を真偽値にする。空・不明は null（呼び出し側で既定値） */
function parseCsvBoolean(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === CSV_YES || s === "true" || s === "1") return true;
  if (s === CSV_NO || s === "false" || s === "0") return false;
  return null;
}

/** 燃料種別の表示名（レギュラー など）・内部値（regular など）を FuelType にする。空は null */
function parseCsvFuelType(raw: string): FuelType | null {
  const s = raw.trim();
  if (s === "") return null;
  const byLabel = FUEL_TYPES.find(t => FUEL_TYPE_LABELS[t] === s);
  return byLabel ?? normalizeFuelType(s);
}

/** 先頭の空でない行が FuelLens の CSV のヘッダーか */
export function detectFuelLensCsv(text: string): "all" | "vehicle" | null {
  const rows = parseCsvRows(text.slice(0, 4096));
  const header = rows.find(r => !isBlankRow(r))?.map(h => h.trim());
  if (!header) return null;
  if (RECORDS_CSV_BASE_HEADERS.every(h => header.includes(h))) return "all";
  if (HISTORY_CSV_HEADERS.every(h => header.includes(h))) return "vehicle";
  return null;
}

/**
 * FuelLens の CSV を読み込む。エラーメッセージは日本語でそのまま画面に出してよい。
 * 日付が読めない行、給油量も支払総額も無い行は読み飛ばす（stats.skippedInvalid）。
 */
export function parseFuelLensCsv(text: string): ParseFuelLensCsvResult {
  const fail = (error: string): ParseFuelLensCsvResult => ({ ok: false, error });
  if (typeof text !== "string" || text.trim() === "") return fail("ファイルが空です。");

  const rows = parseCsvRows(text).filter(r => !isBlankRow(r));
  const header = (rows[0] ?? []).map(h => h.trim());
  const format = RECORDS_CSV_BASE_HEADERS.every(h => header.includes(h))
    ? "all"
    : HISTORY_CSV_HEADERS.every(h => header.includes(h))
      ? "vehicle"
      : null;
  if (!format) return fail("FuelLens の CSV ではありません（ヘッダーが一致しません）。");

  const idx = (name: string) => header.indexOf(name);
  const col =
    format === "all"
      ? {
          vehicle: idx("車両"),
          date: idx("日付"),
          fuel: idx("給油量(L)"),
          cost: idx("支払総額(円)"),
          price: idx("単価(円/L)"),
          distance: idx("走行距離(km)"),
          efficiency: idx("燃費(km/L)"),
          station: idx("店舗名"),
        }
      : {
          vehicle: -1,
          date: idx("給油日"),
          fuel: idx("給油量(L)"),
          cost: idx("支払総額(円)"),
          price: idx("単価(円/L)"),
          distance: idx("走行距離(km)"),
          efficiency: idx("燃費(km/L)"),
          station: idx("ガソリンスタンド名"),
        };
  // 追加列（任意）。両方の形式で同じ名前
  const extra = {
    odometer: idx(RECORD_CSV_EXTRA_HEADERS.odometer),
    isFull: idx(RECORD_CSV_EXTRA_HEADERS.isFull),
    missedPrevious: idx(RECORD_CSV_EXTRA_HEADERS.missedPrevious),
    fuelType: idx(RECORD_CSV_EXTRA_HEADERS.fuelType),
    memo: idx(RECORD_CSV_EXTRA_HEADERS.memo),
  };

  const dataRows = rows.slice(1);
  if (dataRows.length > BACKUP_MAX_RECORDS) {
    return fail(`記録が多すぎます（最大 ${BACKUP_MAX_RECORDS.toLocaleString("ja-JP")} 件）。`);
  }

  const records: FuelLensCsvRecord[] = [];
  const vehicleNames: string[] = [];
  const usedIds = new Set<string>();
  let skippedInvalid = 0;

  for (const row of dataRows) {
    const cell = (i: number) => (i >= 0 ? unescapeField(row[i] ?? "") : "");
    const date = parseFlexibleDate(cell(col.date))?.date;
    const fuel = parseCsvNumber(cell(col.fuel));
    const cost = parseCsvNumber(cell(col.cost));
    if (!date || ((fuel == null || fuel === 0) && (cost == null || cost === 0))) {
      skippedInvalid += 1;
      continue;
    }
    const distance = parseCsvNumber(cell(col.distance));
    const computed = calculateFuelMetrics(distance, fuel, cost);
    const station = cell(col.station).trim().slice(0, MAX_GAS_STATION_LENGTH) || null;

    let vehicleName: string | null = null;
    if (format === "all") {
      vehicleName = cell(col.vehicle).trim().slice(0, MAX_VEHICLE_NAME_LENGTH).trim() || FALLBACK_VEHICLE_NAME;
      if (!vehicleNames.includes(vehicleName)) vehicleNames.push(vehicleName);
    }

    const baseId = `fuellens-csv-${hashString(
      [vehicleName ?? "", date, fuel ?? "", cost ?? "", distance ?? "", station ?? ""].join("|")
    )}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);

    records.push({
      id,
      date,
      total_distance: distance,
      fuel_amount: fuel,
      gas_station: station,
      // 書き出し時の値を優先し、欠けていれば計算で補う
      price_per_unit: parseCsvNumber(cell(col.price)) ?? computed.price_per_unit,
      total_cost: cost,
      fuel_efficiency: parseCsvNumber(cell(col.efficiency)) ?? computed.fuel_efficiency,
      odometer: sanitizeOdometer(parseCsvNumber(cell(extra.odometer))),
      is_full: parseCsvBoolean(cell(extra.isFull)) ?? true,
      missed_previous: parseCsvBoolean(cell(extra.missedPrevious)) ?? false,
      fuel_type: parseCsvFuelType(cell(extra.fuelType)),
      // メモは改行も含めてそのまま（前後の空白を除き 200 文字まで）
      memo: sanitizeMemo(cell(extra.memo)),
      vehicleName,
    });
  }

  return { ok: true, format, vehicleNames, records, stats: { rows: records.length, skippedInvalid } };
}

/**
 * 読み込んだ FuelLens CSV をバックアップ（version 2）に変換する。
 * - 全車両 CSV: 車両名ごとに 1 台。種別は CSV に無いので typeByName（既存車両の種別など）→ 無ければ car
 * - 車両別 CSV: vehicleName / vehicleType の 1 台
 * 車両 ID は `fuellens-csv-v-<車両名のハッシュ>`、記録 ID は `fuellens-csv-<車両名と各列のハッシュ>`（同じ行が続けば `-2` …）。
 * 車両の距離の入力方式: その車両の記録に 1 件でもオドメーターがあれば "odometer"、無ければ "trip"
 * （lib/importers/fuelio.ts と同じく、新規作成されるときに使われる。既存車両に追加するときは既存車両の設定のまま）。
 */
export function fuelLensCsvToBackup(
  parsed: ParsedFuelLensCsv,
  options: {
    vehicleName?: string;
    vehicleType?: VehicleType;
    typeByName?: (name: string) => VehicleType | undefined;
    now?: Date;
  } = {}
): FuelLensBackup {
  const vehicleIdOf = (name: string) => `fuellens-csv-v-${hashString(name)}`;
  let vehicles: FuelLensBackup["vehicles"];
  let vehicleIdForRecord: (r: FuelLensCsvRecord) => string;

  /** 記録にオドメーターがあればオドメーター入力方式（区間距離は applyFillChain が積算距離の差分から出す） */
  const distanceModeFor = (records: readonly FuelLensCsvRecord[]): DistanceMode =>
    records.some(r => r.odometer !== null) ? "odometer" : "trip";

  if (parsed.format === "all") {
    vehicles = parsed.vehicleNames.map(name => ({
      id: vehicleIdOf(name),
      name,
      type: options.typeByName?.(name) ?? "car",
      distance_mode: distanceModeFor(parsed.records.filter(r => (r.vehicleName ?? FALLBACK_VEHICLE_NAME) === name)),
    }));
    vehicleIdForRecord = r => vehicleIdOf(r.vehicleName ?? FALLBACK_VEHICLE_NAME);
  } else {
    const name =
      (options.vehicleName ?? "").trim().slice(0, MAX_VEHICLE_NAME_LENGTH).trim() || FUELLENS_CSV_DEFAULT_VEHICLE_NAME;
    const id = vehicleIdOf(name);
    vehicles = [
      {
        id,
        name,
        type: options.vehicleType ?? options.typeByName?.(name) ?? "car",
        distance_mode: distanceModeFor(parsed.records),
      },
    ];
    vehicleIdForRecord = () => id;
  }

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    vehicles,
    records: parsed.records.map(r => ({
      id: r.id,
      date: r.date,
      total_distance: r.total_distance,
      fuel_amount: r.fuel_amount,
      gas_station: r.gas_station,
      price_per_unit: r.price_per_unit,
      total_cost: r.total_cost,
      fuel_efficiency: r.fuel_efficiency,
      vehicle_id: vehicleIdForRecord(r),
      created_at: null,
      odometer: r.odometer,
      is_full: r.is_full,
      missed_previous: r.missed_previous,
      fuel_type: r.fuel_type,
      memo: r.memo,
    })),
  };
}
