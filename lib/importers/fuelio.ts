/**
 * Fuelio（Android の燃費記録アプリ）の CSV エクスポートを読み込む純粋関数。React・保存先には依存しない。
 *
 * Fuelio の CSV は `"## Vehicle"` `"## Log"` `"## CostCategories"` `"## Costs"` … のようなセクション行で区切られ、
 * 各セクションはヘッダー行 + データ行からなる。使うのは `## Vehicle`（1 行目の車両）と `## Log`（給油記録）だけ。
 * 列は位置ではなくヘッダー名で探す（Fuelio のバージョンで列が増減しても読めるように）。
 *
 * Fuelio は積算距離（Odo）を記録するので、取り込み先の車両は「オドメーター入力方式」（distance_mode = "odometer"）にし、
 * 記録には積算距離（Odo → odometer）・満タン（Full → is_full）・記録漏れ（Missed → missed_previous）・
 * 燃料種別（FuelType → fuel_type）・メモ（Notes → memo）を入れる。店舗名は City だけ。
 * 区間距離（total_distance）と燃費（fuel_efficiency）はインポータでは計算せず null にする。
 * 表示・統計・CSV では lib/fillChain.ts の applyFillChain が積算距離の差分と満タン法の連鎖から計算する
 * （部分給油・記録漏れの扱いもそちらに一本化する。docs/design-fill-chain.md の 5 章）。
 * 燃料タンクが 2 つある車両（TankCount > 1）は 1 本目のタンク（TankNumber が 0・1・空）の記録だけを取り込む。
 *
 * 燃料種別（FuelType 列）: Fuelio は番号で書き出すが、番号と油種の対応表はオフラインで確認できないため推測しない。
 * - 空・`0`（手元の実データでは全行が 0。油種を選んでいない記録とみなす）→ null（未指定）
 * - その他の番号 → `other`
 * - 文字（Regular / Premium / Diesel / レギュラー など）なら lib/analyze.ts の normalizeFuelType の規則で寄せる
 *
 * 取り込みは lib/backup.ts のバックアップ形式（FuelLensBackup）に変換し、復元と同じ planRestore で追記する。
 * ID は入力から決まる（同じファイル → 同じ ID）。
 */

import { normalizeFuelType } from "../analyze";
import { BACKUP_APP_ID, BACKUP_MAX_RECORDS, BACKUP_VERSION, type FuelLensBackup } from "../backup";
import { calculateFuelMetrics } from "../calculations";
import { sanitizeMemo } from "../fillChain";
import type { FuelRecord, FuelType, NewRecordField, VehicleType } from "../types";
import { hashString, isBlankRow, parseCsvNumber, parseCsvRows, parseFlexibleDate } from "./csvParse";

// 互換: 共有の CSV 解析は ./csvParse.ts へ移した。次のリリースで再エクスポートを削除する
export { hashString, isBlankRow, parseCsvNumber, parseCsvRows, parseFlexibleDate, type ParsedDate } from "./csvParse";

/**
 * 取り込む記録。0004 で追加した列は必ず入れる。
 * total_distance / fuel_efficiency は常に null（applyFillChain が積算距離から計算する）。
 */
export type ImportedRecord = Omit<FuelRecord, "vehicle_id" | "created_at" | NewRecordField> &
  Required<Pick<FuelRecord, NewRecordField>>;

export type FuelioImportStats = {
  /** 取り込み対象の記録数 */
  rows: number;
  /** 部分給油（燃費なし）の件数 */
  partial: number;
  /** 前回の給油が記録されていない（区間距離なし）の件数 */
  missed: number;
  /** 積算距離がそれまでの記録（日付順）の最大値以下の件数。その記録の区間距離・燃費は計算されない */
  odometerNotIncreasing: number;
  /** 日付が読めない・給油量も金額も無いなどで読み飛ばした行数 */
  skippedInvalid: number;
  /** 2 本目以降の燃料タンク（TankNumber >= 2）の記録で、取り込み対象外にした行数 */
  skippedOtherTank: number;
};

export type ParsedFuelio = {
  ok: true;
  /** Fuelio 上の車両名（前後の空白を除き 50 文字まで。空なら既定名） */
  vehicleName: string;
  /** 推定した車両種別（容量・車種名から。既定は car） */
  vehicleType: VehicleType;
  /** 車両と記録の ID に使うキー（Fuelio 上の車両名のハッシュ） */
  vehicleKey: string;
  /** Fuelio 上の燃料タンクの数（TankCount）。不明なら 1 */
  tankCount: number;
  records: ImportedRecord[];
  stats: FuelioImportStats;
};

export type ParseFuelioResult = ParsedFuelio | { ok: false; error: string };

const MAX_VEHICLE_NAME_LENGTH = 50;
const MAX_GAS_STATION_LENGTH = 200;
const FALLBACK_VEHICLE_NAME = "Fuelio の車両";
/** これ以下のタンク容量（L）はバイクとみなす */
const BIKE_TANK_CAPACITY_MAX = 20;

// ------------------------------------------------------------------
// Fuelio
// ------------------------------------------------------------------

/** セクション行（`## Vehicle` など）なら名前（小文字）を返す */
function sectionName(row: readonly string[]): string | null {
  const first = (row[0] ?? "").trim();
  if (!first.startsWith("##")) return null;
  return first.slice(2).trim().toLowerCase();
}

/** Fuelio の CSV らしいか（`## Vehicle` と `## Log` のセクション行がある） */
export function isFuelioCsv(text: string): boolean {
  const head = text.slice(0, 200_000);
  return /^﻿?"?##\s*Vehicle"?\s*(,|$)/m.test(head) && /^"?##\s*Log"?\s*(,|$)/m.test(head);
}

/** ヘッダー名を比較用に正規化（小文字、`(optional)` を除く、空白を詰める） */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(optional\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findColumn(headers: readonly string[], test: (normalized: string) => boolean): number {
  return headers.findIndex(h => test(normalizeHeader(h)));
}

const MOTORCYCLE_ONLY_MAKES =
  /\b(kawasaki|ducati|harley|ktm|triumph|aprilia|vespa|piaggio|royal ?enfield|husqvarna|mv ?agusta|benelli|bimota|moto ?guzzi)\b/i;
/** バイクの車種名・カテゴリ名によく使われる語（国内 4 メーカーはクルマも作るので、車種名で判断する） */
const MOTORCYCLE_MODEL_HINTS =
  /(\b(cb|cbr|crf|gsx|gsr|yzf|xsr|ninja|vfr|pcx|forza|dio|tact|tody|giorno|cub|monkey|grom|rebel|steed|serow|tricker|tmax|xmax|nmax|majesty|jog|vino|cygnus|address|burgman|skywave|hayabusa|v-?strom|bandit|vanvan|zephyr|estrella|versys|vulcan|w\d{3}|z\d{3,4}|scooter|motorcycle|motorbike)(?:[\s-]?\d{2,4}[a-z]{0,3})?\b)|バイク|スクーター|カブ|原付|二輪/i;

/**
 * 車両種別を推定する。
 * 1. タンク容量が分かれば 20L 以下 → bike、それより大きい → car
 * 2. 容量が不明（0）なら、バイク専業メーカー名や車種名のヒントがあれば bike
 * 3. それ以外は car
 */
export function guessFuelioVehicleType(info: {
  tankCapacity: number | null;
  make?: string;
  model?: string;
  name?: string;
}): VehicleType {
  const cap = info.tankCapacity;
  if (cap != null && cap > 0) return cap <= BIKE_TANK_CAPACITY_MAX ? "bike" : "car";
  const text = [info.make, info.model, info.name].filter(Boolean).join(" ");
  if (MOTORCYCLE_ONLY_MAKES.test(text) || MOTORCYCLE_MODEL_HINTS.test(text)) return "bike";
  return "car";
}

type RawLogRow = {
  index: number;
  date: string;
  sortKey: string;
  odometer: number | null;
  fuel: number | null;
  cost: number | null;
  full: boolean;
  missed: boolean;
  station: string | null;
  fuelType: FuelType | null;
  memo: string | null;
  uniqueId: string;
};

function isTruthyFlag(raw: string | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "1" || s === "1.0" || s === "true" || s === "yes";
}

function isFalsyFlag(raw: string | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "0" || s === "0.0" || s === "false" || s === "no";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fuelio の FuelType 列を FuelType にする（番号の対応表は未確認のため推測しない。ファイル先頭のコメント参照）。
 * 空・0 → null、その他の番号 → other、文字 → normalizeFuelType（レギュラー / premium / diesel など）
 */
export function parseFuelioFuelType(raw: string | undefined): FuelType | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  if (/^\d+(\.0+)?$/.test(s)) return Number(s) === 0 ? null : "other";
  return normalizeFuelType(s);
}

/**
 * Fuelio の CSV を読み込む。エラーメッセージは日本語でそのまま画面に出してよい。
 */
export function parseFuelioCsv(text: string): ParseFuelioResult {
  const fail = (error: string): ParseFuelioResult => ({ ok: false, error });
  if (typeof text !== "string" || text.trim() === "") return fail("ファイルが空です。");

  const rows = parseCsvRows(text);
  const sections = new Map<string, string[][]>();
  let current: string[][] | null = null;
  for (const row of rows) {
    const name = sectionName(row);
    if (name !== null) {
      current = sections.has(name) ? null : [];
      if (current) sections.set(name, current);
      continue;
    }
    if (current && !isBlankRow(row)) current.push(row);
  }

  const vehicleSection = sections.get("vehicle");
  const logSection = sections.get("log");
  if (!vehicleSection || !logSection) {
    return fail("Fuelio の CSV ではありません（## Vehicle と ## Log のセクションが見つかりません）。");
  }

  // ---- 車両 ----
  const [vehicleHeaders = [], vehicleRow = []] = vehicleSection;
  const vField = (name: string): string => {
    const idx = findColumn(vehicleHeaders, h => h === name);
    return idx >= 0 ? (vehicleRow[idx] ?? "").trim() : "";
  };
  const rawName = vField("name");
  const vehicleName = rawName.slice(0, MAX_VEHICLE_NAME_LENGTH).trim() || FALLBACK_VEHICLE_NAME;
  const vehicleKey = hashString(rawName || FALLBACK_VEHICLE_NAME);
  const dateFormatHint = vField("importcsvdateformat");
  const rawTankCount = parseCsvNumber(vField("tankcount"));
  const tankCount = rawTankCount != null && rawTankCount >= 1 ? Math.floor(rawTankCount) : 1;
  const vehicleType = guessFuelioVehicleType({
    tankCapacity: parseCsvNumber(vField("tank1capacity")),
    make: vField("make"),
    model: vField("model"),
    name: rawName,
  });

  // ---- 給油記録 ----
  const [logHeaders = [], ...logRows] = logSection;
  const col = {
    date: findColumn(logHeaders, h => h === "data" || h === "date"),
    odo: findColumn(logHeaders, h => /^odo\b/.test(h)),
    fuel: findColumn(logHeaders, h => /^fuel\s*\(/.test(h) || h === "fuel"),
    full: findColumn(logHeaders, h => h === "full"),
    price: findColumn(logHeaders, h => /^price\b/.test(h)),
    city: findColumn(logHeaders, h => h === "city"),
    notes: findColumn(logHeaders, h => h === "notes"),
    missed: findColumn(logHeaders, h => h === "missed"),
    volumePrice: findColumn(logHeaders, h => h === "volumeprice"),
    uniqueId: findColumn(logHeaders, h => h === "uniqueid"),
    tankNumber: findColumn(logHeaders, h => h === "tanknumber"),
    fuelType: findColumn(logHeaders, h => h === "fueltype"),
  };
  if (col.date < 0 || col.fuel < 0) {
    return fail("Fuelio の給油記録（## Log）に日付または給油量の列が見つかりません。");
  }
  const odoHeader = col.odo >= 0 ? normalizeHeader(logHeaders[col.odo]) : "";
  if (/\((mi|miles?)\)/.test(odoHeader)) {
    return fail("距離の単位がマイルの記録には対応していません。Fuelio の設定で km にしてから書き出してください。");
  }
  const fuelHeader = normalizeHeader(logHeaders[col.fuel]);
  if (/gal|kwh|kg|m3/.test(fuelHeader)) {
    return fail("給油量の単位がリットル以外の記録には対応していません。Fuelio の設定でリットルにしてから書き出してください。");
  }

  const cell = (row: readonly string[], idx: number): string | undefined => (idx >= 0 ? row[idx] : undefined);

  const raw: RawLogRow[] = [];
  let skippedInvalid = 0;
  let skippedOtherTank = 0;
  logRows.forEach((row, index) => {
    // 2 本目以降のタンク（LPG・CNG など、TankNumber >= 2）の記録は対象外。
    // TankNumber が 0・1・空・読めない行は 1 本目とみなす
    const tankNumber = parseCsvNumber(cell(row, col.tankNumber));
    if (tankNumber != null && tankNumber >= 2) {
      skippedOtherTank += 1;
      return;
    }
    const parsedDate = parseFlexibleDate(cell(row, col.date), dateFormatHint);
    if (!parsedDate) {
      skippedInvalid += 1;
      return;
    }
    const fuel = parseCsvNumber(cell(row, col.fuel));
    const price = parseCsvNumber(cell(row, col.price));
    const volumePrice = parseCsvNumber(cell(row, col.volumePrice));
    // Price は支払総額。空・0 のときだけ VolumePrice（単価）× 給油量で補う。
    // Fuelio は金額が不明な行を 0 で書き出すので、補えなかった 0 は「不明」（null）にする
    let cost: number | null = price;
    if ((cost == null || cost === 0) && volumePrice != null && volumePrice > 0 && fuel != null && fuel > 0) {
      cost = round2(volumePrice * fuel);
    }
    if (cost === 0) cost = null;
    if ((fuel == null || fuel === 0) && (cost == null || cost === 0)) {
      skippedInvalid += 1;
      return;
    }

    // 店舗名は City だけ（Notes はメモへ）
    const city = (cell(row, col.city) ?? "").trim();

    raw.push({
      index,
      date: parsedDate.date,
      sortKey: parsedDate.sortKey,
      odometer: parseCsvNumber(cell(row, col.odo)),
      fuel,
      cost,
      // Full 列が無い・空なら満タン扱い
      full: !isFalsyFlag(cell(row, col.full)),
      missed: isTruthyFlag(cell(row, col.missed)),
      station: city ? city.slice(0, MAX_GAS_STATION_LENGTH) : null,
      fuelType: parseFuelioFuelType(cell(row, col.fuelType)),
      memo: sanitizeMemo(cell(row, col.notes)),
      uniqueId: (cell(row, col.uniqueId) ?? "").trim(),
    });
  });

  if (raw.length > BACKUP_MAX_RECORDS) {
    return fail(`記録が多すぎます（最大 ${BACKUP_MAX_RECORDS.toLocaleString("ja-JP")} 件）。`);
  }

  // 日付（時刻）→ 積算距離（不明は後ろ）→ ファイル内の順
  raw.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
    const ao = a.odometer ?? Number.POSITIVE_INFINITY;
    const bo = b.odometer ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao < bo ? -1 : 1;
    return a.index - b.index;
  });

  const records: ImportedRecord[] = [];
  const usedIds = new Set<string>();
  let partial = 0;
  let missed = 0;
  let odometerNotIncreasing = 0;
  /** ここまでの行の積算距離の最大値（プレビューの注意書き用。区間距離の計算は applyFillChain が行う） */
  let maxOdo: number | null = null;

  for (const r of raw) {
    if (!r.full) partial += 1;
    if (r.missed) missed += 1;
    if (r.odometer != null) {
      if (maxOdo != null && r.odometer <= maxOdo) odometerNotIncreasing += 1;
      else maxOdo = r.odometer;
    }

    const idPart = /^[A-Za-z0-9_-]{1,64}$/.test(r.uniqueId)
      ? r.uniqueId
      : `h${hashString(`${r.date}|${r.odometer ?? ""}|${r.fuel ?? ""}`)}`;
    const baseId = `fuelio-${vehicleKey}-${idPart}`;
    let id = baseId;
    for (let n = 2; usedIds.has(id); n++) id = `${baseId}-${n}`;
    usedIds.add(id);

    records.push({
      id,
      date: r.date,
      total_distance: null,
      fuel_amount: r.fuel,
      gas_station: r.station,
      price_per_unit: calculateFuelMetrics(null, r.fuel, r.cost).price_per_unit,
      total_cost: r.cost,
      fuel_efficiency: null,
      odometer: r.odometer,
      is_full: r.full,
      missed_previous: r.missed,
      fuel_type: r.fuelType,
      memo: r.memo,
    });
  }

  return {
    ok: true,
    vehicleName,
    vehicleType,
    vehicleKey,
    tankCount,
    records,
    stats: { rows: records.length, partial, missed, odometerNotIncreasing, skippedInvalid, skippedOtherTank },
  };
}

/**
 * 読み込んだ Fuelio のデータを FuelLens のバックアップ（version 2、車両 1 台）に変換する。
 * vehicleName / vehicleType で取り込み先の車両名・種別を上書きできる（名前 + 種別が一致する既存車両に追加される）。
 * 車両は distance_mode = "odometer"（新規作成されるときに使われる。既存車両に追加するときは既存車両の設定のまま）。
 * 記録の区間距離・燃費は null（applyFillChain が積算距離から計算する）。
 * 車両 ID は `fuelio-<車両名のハッシュ>`、記録 ID は `fuelio-<車両名のハッシュ>-<UniqueId>`
 * （UniqueId が無ければ `h<日付・積算距離・給油量のハッシュ>`）。
 */
export function fuelioToBackup(
  parsed: ParsedFuelio,
  options: { vehicleName?: string; vehicleType?: VehicleType; now?: Date } = {}
): FuelLensBackup {
  const name = (options.vehicleName ?? "").trim().slice(0, MAX_VEHICLE_NAME_LENGTH).trim() || parsed.vehicleName;
  const vehicleId = `fuelio-${parsed.vehicleKey}`;
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: (options.now ?? new Date()).toISOString(),
    vehicles: [
      {
        id: vehicleId,
        name,
        type: options.vehicleType ?? parsed.vehicleType,
        distance_mode: "odometer",
        default_fuel_type: null,
      },
    ],
    records: parsed.records.map(r => ({
      id: r.id,
      date: r.date,
      total_distance: r.total_distance,
      fuel_amount: r.fuel_amount,
      gas_station: r.gas_station,
      price_per_unit: r.price_per_unit,
      total_cost: r.total_cost,
      fuel_efficiency: r.fuel_efficiency,
      vehicle_id: vehicleId,
      created_at: null,
      odometer: r.odometer,
      is_full: r.is_full,
      missed_previous: r.missed_previous,
      fuel_type: r.fuel_type,
      memo: r.memo,
    })),
  };
}
