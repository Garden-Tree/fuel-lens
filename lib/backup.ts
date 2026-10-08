/**
 * バックアップ（JSON 書き出し）と復元計画の純粋関数。React・localStorage・Supabase には依存しない。
 *
 * 復元は「追記のみ」。既存の車両・記録は変更・削除しない。
 * - 車両: バックアップの車両を既存の車両へ対応付ける（id 一致 → 名前 + 種別一致の順）。対応しなければ新規作成。
 * - 記録: 既存と同じ id、または「同じ車両（対応付け後）+ 日付 + 給油量(±0.01) + 支払総額」の記録があればスキップ。
 *
 * バックアップファイルは利用者が編集・差し替えできる「信頼できない入力」として扱い、
 * parseBackup で形・型・値域・件数を厳密に検証し、既知のキーだけを取り出した新しいオブジェクトを返す。
 *
 * バージョン:
 * - 1: 車両 id / name / type / created_at、記録は 0004 以前の列
 * - 2: 車両に distance_mode / default_fuel_type、記録に odometer / is_full / missed_previous / fuel_type / memo を追加
 * parseBackup は 1 と 2 を受け付け、欠けたフィールドは既定値（トリップ・満タン・記録漏れなし・null）で補って
 * 常に version 2 の形で返す。
 */

import { isValidCalendarDate, localDateString, normalizeTimestamp } from "./dates";
import { MEMO_MAX_LENGTH, isFuelType, sanitizeMemo } from "./fillChain";
import { isUnclassifiedRecord } from "./recordFilters";
import type { FuelRecord, Vehicle, VehicleType } from "./types";

export const BACKUP_APP_ID = "fuel-lens";
export const BACKUP_VERSION = 2;
/** parseBackup が読み込める最も古いバージョン */
export const BACKUP_MIN_SUPPORTED_VERSION = 1;

/** 受け付ける最大件数・サイズ（悪意のある巨大ファイルでタブが固まらないように） */
export const BACKUP_MAX_VEHICLES = 500;
export const BACKUP_MAX_RECORDS = 50_000;
/** 文字数（≒バイト数）の上限。50,000 件 × 約 300 文字でも収まる */
export const BACKUP_MAX_TEXT_LENGTH = 30 * 1024 * 1024;

const MAX_ID_LENGTH = 128;
const MAX_VEHICLE_NAME_LENGTH = 50;
const MAX_GAS_STATION_LENGTH = 200;
/** 数値の上限（明らかに壊れた値を弾く。燃料・金額・距離のいずれにも十分大きい） */
const MAX_NUMBER = 1e9;

const FALLBACK_VEHICLE_NAME = "名称未設定";

/** バックアップに含める車両。user_id（Clerk のユーザーID）はファイルに含めない */
export type BackupVehicle = Omit<Vehicle, "user_id">;

/** バックアップに含める記録（FuelRecord の既知キーのみ） */
export type BackupRecord = FuelRecord;

export type FuelLensBackup = {
  app: typeof BACKUP_APP_ID;
  version: typeof BACKUP_VERSION;
  /** 書き出し日時（ISO 8601） */
  exportedAt: string;
  vehicles: BackupVehicle[];
  records: BackupRecord[];
};

export type ParseBackupResult = { ok: true; backup: FuelLensBackup } | { ok: false; error: string };

// ------------------------------------------------------------------
// 小さなユーティリティ
// ------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 制御文字を含まない 1〜128 文字の文字列（UUID・ローカル採番ID の両方を許す） */
function isValidId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_ID_LENGTH && !/[\u0000-\u001f\u007f]/.test(v);
}

function isValidNumberOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_NUMBER);
}

function sanitizeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_NUMBER ? v : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ------------------------------------------------------------------
// 書き出し
// ------------------------------------------------------------------

/** `fuel-lens-backup-YYYYMMDD-HHmm.json`（ローカル時刻） */
export function backupFilename(now: Date = new Date()): string {
  const ymd = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const hm = `${pad2(now.getHours())}${pad2(now.getMinutes())}`;
  return `fuel-lens-backup-${ymd}-${hm}.json`;
}

/**
 * 車両と全記録からバックアップを作る。
 * 既知のキーだけを取り出し、parseBackup が必ず受け付ける値へ正規化する
 * （古いローカルデータの不正な日付・数値で、自分のバックアップが復元できなくなるのを防ぐ）。
 * - 不正な数値 → null / 不正な日付 → created_at の日付 → それも無ければ書き出し日
 * - id の重複は先勝ちで除去
 */
export function buildBackup(
  vehicles: readonly Vehicle[],
  records: readonly FuelRecord[],
  now: Date = new Date()
): FuelLensBackup {
  const seenVehicles = new Set<string>();
  const outVehicles: BackupVehicle[] = [];
  for (const v of vehicles) {
    if (!v || !isValidId(v.id) || seenVehicles.has(v.id)) continue;
    seenVehicles.add(v.id);
    const trimmed = typeof v.name === "string" ? v.name.trim().slice(0, MAX_VEHICLE_NAME_LENGTH) : "";
    const out: BackupVehicle = {
      id: v.id,
      name: trimmed || FALLBACK_VEHICLE_NAME,
      type: v.type === "bike" ? "bike" : "car",
      distance_mode: v.distance_mode === "odometer" ? "odometer" : "trip",
      default_fuel_type: isFuelType(v.default_fuel_type) ? v.default_fuel_type : null,
    };
    const vehicleCreatedAt = normalizeTimestamp(v.created_at);
    if (vehicleCreatedAt) out.created_at = vehicleCreatedAt;
    outVehicles.push(out);
  }

  const seenRecords = new Set<string>();
  const outRecords: BackupRecord[] = [];
  for (const r of records) {
    if (!r || !isValidId(r.id) || seenRecords.has(r.id)) continue;
    seenRecords.add(r.id);
    const createdAt = normalizeTimestamp(r.created_at);
    const date = isValidCalendarDate(r.date)
      ? r.date
      : localDateString(createdAt ? new Date(Date.parse(createdAt)) : now);
    outRecords.push({
      id: r.id,
      date,
      total_distance: sanitizeNumber(r.total_distance),
      fuel_amount: sanitizeNumber(r.fuel_amount),
      gas_station: typeof r.gas_station === "string" ? r.gas_station.slice(0, MAX_GAS_STATION_LENGTH) : null,
      price_per_unit: sanitizeNumber(r.price_per_unit),
      total_cost: sanitizeNumber(r.total_cost),
      fuel_efficiency: sanitizeNumber(r.fuel_efficiency),
      vehicle_id: isValidId(r.vehicle_id) ? r.vehicle_id : null,
      created_at: createdAt,
      odometer: sanitizeNumber(r.odometer),
      is_full: r.is_full !== false,
      missed_previous: r.missed_previous === true,
      fuel_type: isFuelType(r.fuel_type) ? r.fuel_type : null,
      memo: sanitizeMemo(r.memo),
    });
  }

  // 日付の古い順（同日は created_at → id）。ファイルを人が読んでも追いやすいように
  outRecords.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    vehicles: outVehicles,
    records: outRecords,
  };
}

/** バックアップを JSON 文字列にする（2 スペースインデント） */
export function serializeBackup(backup: FuelLensBackup): string {
  return JSON.stringify(backup, null, 2);
}

// ------------------------------------------------------------------
// 読み込み（検証）
// ------------------------------------------------------------------

const fail = (error: string): ParseBackupResult => ({ ok: false, error });

function parseVehicle(v: unknown, index: number): BackupVehicle | string {
  const at = `車両 ${index + 1} 件目`;
  if (!isPlainObject(v)) return `${at}の形式が正しくありません。`;
  if (!isValidId(v.id)) return `${at}の ID が正しくありません。`;
  if (typeof v.name !== "string") return `${at}の名前が正しくありません。`;
  const name = v.name.trim();
  if (!name || name.length > MAX_VEHICLE_NAME_LENGTH) {
    return `${at}の名前は 1〜${MAX_VEHICLE_NAME_LENGTH} 文字にしてください。`;
  }
  if (v.type !== "car" && v.type !== "bike") return `${at}の種別が正しくありません。`;
  // version 1 には無い。欠けていればトリップ / 未指定
  const mode = v.distance_mode === undefined || v.distance_mode === null ? "trip" : v.distance_mode;
  if (mode !== "trip" && mode !== "odometer") return `${at}の距離の入力方式が正しくありません。`;
  const fuelType = v.default_fuel_type === undefined ? null : v.default_fuel_type;
  if (fuelType !== null && !isFuelType(fuelType)) return `${at}の既定の燃料種別が正しくありません。`;
  const out: BackupVehicle = { id: v.id, name, type: v.type, distance_mode: mode, default_fuel_type: fuelType };
  if (v.created_at !== undefined && v.created_at !== null) {
    const createdAt = normalizeTimestamp(v.created_at);
    if (!createdAt) return `${at}の作成日時が正しくありません。`;
    out.created_at = createdAt;
  }
  return out;
}

const NUMBER_FIELDS = [
  ["total_distance", "走行距離"],
  ["fuel_amount", "給油量"],
  ["price_per_unit", "単価"],
  ["total_cost", "支払総額"],
  ["fuel_efficiency", "燃費"],
  ["odometer", "オドメーター"],
] as const;

function parseRecord(r: unknown, index: number): BackupRecord | string {
  const at = `記録 ${index + 1} 件目`;
  if (!isPlainObject(r)) return `${at}の形式が正しくありません。`;
  if (!isValidId(r.id)) return `${at}の ID が正しくありません。`;
  if (!isValidCalendarDate(r.date)) return `${at}の日付が正しくありません（YYYY-MM-DD 形式が必要です）。`;

  const nums: Record<(typeof NUMBER_FIELDS)[number][0], number | null> = {
    total_distance: null,
    fuel_amount: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    odometer: null,
  };
  for (const [key, label] of NUMBER_FIELDS) {
    const value = r[key] === undefined ? null : r[key];
    if (!isValidNumberOrNull(value)) return `${at}の${label}が正しくありません（0 以上の数値が必要です）。`;
    nums[key] = value;
  }

  const gas = r.gas_station === undefined ? null : r.gas_station;
  if (gas !== null && (typeof gas !== "string" || gas.length > MAX_GAS_STATION_LENGTH)) {
    return `${at}の店舗名が正しくありません。`;
  }

  const vid = r.vehicle_id === undefined || r.vehicle_id === "" ? null : r.vehicle_id;
  if (vid !== null && !isValidId(vid)) return `${at}の車両 ID が正しくありません。`;

  let created: string | null = null;
  if (r.created_at !== undefined && r.created_at !== null) {
    created = normalizeTimestamp(r.created_at);
    if (!created) return `${at}の作成日時が正しくありません。`;
  }

  // 以下は version 2 で追加。欠けていれば既定値（満タン・記録漏れなし・未指定・メモなし）
  const isFull = r.is_full === undefined ? true : r.is_full;
  if (typeof isFull !== "boolean") return `${at}の満タン給油の値が正しくありません（true / false が必要です）。`;
  const missed = r.missed_previous === undefined ? false : r.missed_previous;
  if (typeof missed !== "boolean") return `${at}の記録漏れの値が正しくありません（true / false が必要です）。`;
  const fuelType = r.fuel_type === undefined ? null : r.fuel_type;
  if (fuelType !== null && !isFuelType(fuelType)) return `${at}の燃料種別が正しくありません。`;
  const memo = r.memo === undefined ? null : r.memo;
  // 文字数はコードポイントで数える（DB の char_length・sanitizeMemo と同じ）。UTF-16 の length だと
  // buildBackup が書き出した絵文字入りのメモ（200 コードポイント = 400 UTF-16 単位）を復元できなくなる
  if (memo !== null && (typeof memo !== "string" || Array.from(memo.trim()).length > MEMO_MAX_LENGTH)) {
    return `${at}のメモが正しくありません（${MEMO_MAX_LENGTH} 文字まで）。`;
  }

  return {
    id: r.id,
    date: r.date,
    ...nums,
    gas_station: gas,
    vehicle_id: vid,
    created_at: created,
    is_full: isFull,
    missed_previous: missed,
    fuel_type: fuelType,
    // 空白だけのメモは null（buildBackup・保存時と同じ正規化）
    memo: sanitizeMemo(memo),
  };
}

/**
 * バックアップファイルの内容（テキスト）を検証して読み込む。
 * エラーメッセージは日本語でそのまま画面に出してよい。
 */
export function parseBackup(text: string): ParseBackupResult {
  if (typeof text !== "string" || text.trim() === "") return fail("ファイルが空です。");
  if (text.length > BACKUP_MAX_TEXT_LENGTH) return fail("ファイルが大きすぎます。");

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("JSON として読み込めませんでした。FuelLens のバックアップファイルを選んでください。");
  }

  if (!isPlainObject(data)) return fail("バックアップファイルの形式が正しくありません。");
  if (data.app !== BACKUP_APP_ID) return fail("FuelLens のバックアップファイルではありません。");
  if (typeof data.version !== "number" || !Number.isInteger(data.version)) {
    return fail("バックアップファイルのバージョンが正しくありません。");
  }
  if (data.version > BACKUP_VERSION) {
    return fail("新しいバージョンのアプリで作成されたバックアップのため読み込めません。アプリを更新してください。");
  }
  if (data.version < BACKUP_MIN_SUPPORTED_VERSION) return fail("対応していないバージョンのバックアップファイルです。");
  const exportedAt = normalizeTimestamp(data.exportedAt);
  if (!exportedAt) return fail("バックアップファイルの書き出し日時が正しくありません。");

  if (!Array.isArray(data.vehicles) || !Array.isArray(data.records)) {
    return fail("バックアップファイルに車両または記録の一覧がありません。");
  }
  if (data.vehicles.length > BACKUP_MAX_VEHICLES) {
    return fail(`車両が多すぎます（最大 ${BACKUP_MAX_VEHICLES.toLocaleString("ja-JP")} 台）。`);
  }
  if (data.records.length > BACKUP_MAX_RECORDS) {
    return fail(`記録が多すぎます（最大 ${BACKUP_MAX_RECORDS.toLocaleString("ja-JP")} 件）。`);
  }

  const vehicles: BackupVehicle[] = [];
  const vehicleIds = new Set<string>();
  for (let i = 0; i < data.vehicles.length; i++) {
    const parsed = parseVehicle(data.vehicles[i], i);
    if (typeof parsed === "string") return fail(parsed);
    if (vehicleIds.has(parsed.id)) return fail(`車両 ${i + 1} 件目の ID が重複しています。`);
    vehicleIds.add(parsed.id);
    vehicles.push(parsed);
  }

  const records: BackupRecord[] = [];
  const recordIds = new Set<string>();
  for (let i = 0; i < data.records.length; i++) {
    const parsed = parseRecord(data.records[i], i);
    if (typeof parsed === "string") return fail(parsed);
    if (recordIds.has(parsed.id)) return fail(`記録 ${i + 1} 件目の ID が重複しています。`);
    recordIds.add(parsed.id);
    records.push(parsed);
  }

  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt,
      vehicles,
      records,
    },
  };
}

// ------------------------------------------------------------------
// 復元計画
// ------------------------------------------------------------------

export type RestoreVehicleToCreate = {
  /** バックアップ内の車両ID（作成後に新しい ID と対応付ける） */
  backupId: string;
  name: string;
  type: VehicleType;
  /** 距離の入力方式（version 1 のバックアップ・インポートでは省略 = トリップ） */
  distance_mode?: Vehicle["distance_mode"];
  /** 既定の燃料種別（省略 = 未指定） */
  default_fuel_type?: Vehicle["default_fuel_type"];
};

/** 復元で挿入する記録。vehicle_id はまだ「バックアップ内の車両ID」（null = 既存の既定車両 / 未分類） */
export type RestoreRecordDraft = Omit<FuelRecord, "id" | "vehicle_id"> & {
  /** バックアップ内の車両ID。null なら既存の既定車両（それも無ければ未分類） */
  backupVehicleId: string | null;
};

export type RestorePlan = {
  /** 新規作成する車両 */
  vehiclesToCreate: RestoreVehicleToCreate[];
  /** 既存の車両に対応付いたバックアップ車両: バックアップの車両ID → 既存の車両ID */
  vehicleIdMap: Record<string, string>;
  /** 挿入する記録（finalizeRestoreRecords で vehicle_id を確定させる） */
  records: RestoreRecordDraft[];
  /** 対応付け先が無いときに使う既存の既定車両ID（existingVehicles[0]）。無ければ null */
  defaultVehicleId: string | null;
  counts: {
    vehiclesNew: number;
    vehiclesMatched: number;
    recordsNew: number;
    recordsSkipped: number;
  };
};

const FUEL_AMOUNT_TOLERANCE = 0.01;
const TOTAL_COST_TOLERANCE = 0.005;

function nearlyEqual(a: number | null | undefined, b: number | null | undefined, tolerance: number): boolean {
  const aNull = a == null;
  const bNull = b == null;
  if (aNull || bNull) return aNull && bNull;
  return Math.abs(a - b) <= tolerance + 1e-9;
}

/**
 * バックアップを既存データへ追記するための計画を作る（副作用なし）。
 *
 * 車両の対応付け（バックアップの各車両について上から順に）:
 *  1. 既存に同じ id の車両があればそれに対応付ける
 *  2. 無ければ、まだ対応付けていない既存車両のうち「名前（前後の空白を除く）+ 種別」が一致する最初の車両
 *  3. それも無ければ新規作成
 *
 * 記録の車両:
 *  - vehicle_id がバックアップ内の車両を指す → その車両の対応先
 *  - null / 未分類（default-*）/ バックアップに無い車両 → バックアップの先頭車両（= 書き出し時の既定車両。
 *    未分類の記録はそこに表示されていた）の対応先。バックアップに車両が無ければ既存の既定車両
 *
 * 記録の重複（スキップ）判定:
 *  - 既存に同じ id の記録がある
 *  - または既存に「同じ車両（対応付け後。既存側の未分類は既存の既定車両とみなす）+ 同じ日付 +
 *    給油量の差 ±0.01 以内 + 同じ支払総額」の記録がある（null 同士は一致とみなす）
 *  - 名前 + 種別で対応付けた車両は、同じ名前 + 種別の既存車両が複数あれば、そのすべての記録と比べる。
 *    同名同種の車両は作成順・一覧順で入れ替わり得るため（前回の復元で作った車両と対応先がずれても
 *    記録を二重登録しないように）。
 */
export function planRestore(
  backup: FuelLensBackup,
  existingVehicles: readonly Pick<Vehicle, "id" | "name" | "type">[],
  existingRecords: readonly FuelRecord[]
): RestorePlan {
  const defaultVehicleId = existingVehicles[0]?.id ?? null;
  const existingById = new Map(existingVehicles.map(v => [v.id, v]));

  const vehicleIdMap: Record<string, string> = Object.create(null) as Record<string, string>;
  /** バックアップの車両ID → 重複判定で記録を比べる既存車両ID の一覧 */
  const dupTargets = new Map<string, string[]>();
  const vehiclesToCreate: RestoreVehicleToCreate[] = [];
  const claimed = new Set<string>();
  let vehiclesMatched = 0;
  const reservedById = new Set(backup.vehicles.filter(bv => existingById.has(bv.id)).map(bv => bv.id));

  for (const bv of backup.vehicles) {
    const byId = existingById.get(bv.id);
    if (byId) {
      vehicleIdMap[bv.id] = byId.id;
      dupTargets.set(bv.id, [byId.id]);
      claimed.add(byId.id);
      vehiclesMatched += 1;
      continue;
    }
    const name = bv.name.trim();
    // id 一致で対応付く予定の既存車両は、名前一致で先取りしない
    const byName = existingVehicles.find(
      v => !claimed.has(v.id) && !reservedById.has(v.id) && v.name.trim() === name && v.type === bv.type
    );
    if (byName) {
      vehicleIdMap[bv.id] = byName.id;
      const group = existingVehicles.filter(v => v.name.trim() === name && v.type === bv.type).map(v => v.id);
      dupTargets.set(bv.id, group.length > 1 ? group : [byName.id]);
      claimed.add(byName.id);
      vehiclesMatched += 1;
      continue;
    }
    const toCreate: RestoreVehicleToCreate = { backupId: bv.id, name, type: bv.type };
    if (bv.distance_mode !== undefined) toCreate.distance_mode = bv.distance_mode;
    if (bv.default_fuel_type !== undefined) toCreate.default_fuel_type = bv.default_fuel_type;
    vehiclesToCreate.push(toCreate);
  }

  const backupVehicleIds = new Set(backup.vehicles.map(v => v.id));
  const backupDefaultId = backup.vehicles[0]?.id ?? null;

  // 記録の対応先（バックアップ内の車両ID or null）を決める
  const resolveBackupVehicle = (r: FuelRecord): string | null => {
    const vid = r.vehicle_id ?? null;
    if (vid && backupVehicleIds.has(vid)) return vid;
    // null / 未分類（default-*）/ バックアップに無い車両を指す記録は、バックアップの既定車両へ
    return backupDefaultId;
  };

  // 重複判定で比べる既存車両ID。新規作成予定の車両なら空（既存記録と重複し得ない）
  const dupTargetsOf = (backupVehicleId: string | null): (string | null)[] => {
    if (backupVehicleId === null) return [defaultVehicleId];
    return dupTargets.get(backupVehicleId) ?? [];
  };

  const existingRecordIds = new Set(existingRecords.map(r => r.id));
  // 既存記録を「車両|日付」でまとめて、重複判定を O(件数) に近づける
  const existingByKey = new Map<string, FuelRecord[]>();
  for (const r of existingRecords) {
    const vehicle = isUnclassifiedRecord(r) ? defaultVehicleId : (r.vehicle_id ?? null);
    const key = `${vehicle ?? ""}|${r.date}`;
    const list = existingByKey.get(key);
    if (list) list.push(r);
    else existingByKey.set(key, [r]);
  }

  const records: RestoreRecordDraft[] = [];
  let recordsSkipped = 0;
  for (const r of backup.records) {
    if (existingRecordIds.has(r.id)) {
      recordsSkipped += 1;
      continue;
    }
    const backupVehicleId = resolveBackupVehicle(r);
    const dup = dupTargetsOf(backupVehicleId).some(target =>
      (existingByKey.get(`${target ?? ""}|${r.date}`) ?? []).some(
        e =>
          nearlyEqual(e.fuel_amount, r.fuel_amount, FUEL_AMOUNT_TOLERANCE) &&
          nearlyEqual(e.total_cost, r.total_cost, TOTAL_COST_TOLERANCE)
      )
    );
    if (dup) {
      recordsSkipped += 1;
      continue;
    }
    records.push({
      date: r.date,
      total_distance: r.total_distance,
      fuel_amount: r.fuel_amount,
      gas_station: r.gas_station,
      price_per_unit: r.price_per_unit,
      total_cost: r.total_cost,
      fuel_efficiency: r.fuel_efficiency,
      created_at: normalizeTimestamp(r.created_at),
      odometer: r.odometer,
      is_full: r.is_full,
      missed_previous: r.missed_previous,
      fuel_type: r.fuel_type,
      memo: r.memo,
      backupVehicleId,
    });
  }

  return {
    vehiclesToCreate,
    // プロトタイプを持たないオブジェクトのまま返す（"__proto__" などの車両IDも通常のキーとして扱う）
    vehicleIdMap,
    records,
    defaultVehicleId,
    counts: {
      vehiclesNew: vehiclesToCreate.length,
      vehiclesMatched,
      recordsNew: records.length,
      recordsSkipped,
    },
  };
}

/**
 * 車両を作成した後、記録の vehicle_id を確定させる。
 * createdIdMap はバックアップの車両ID → 新しく作成した車両ID。
 * 対応先が見つからない記録は既存の既定車両（plan.defaultVehicleId）、それも無ければ null（未分類）。
 */
export function finalizeRestoreRecords(
  plan: RestorePlan,
  createdIdMap: Readonly<Record<string, string>>
): Omit<FuelRecord, "id">[] {
  const has = (map: Readonly<Record<string, string>>, key: string) =>
    Object.prototype.hasOwnProperty.call(map, key);
  return plan.records.map(({ backupVehicleId, ...rest }) => {
    let vehicleId: string | null = plan.defaultVehicleId;
    if (backupVehicleId !== null) {
      if (has(plan.vehicleIdMap, backupVehicleId)) vehicleId = plan.vehicleIdMap[backupVehicleId];
      else if (has(createdIdMap, backupVehicleId)) vehicleId = createdIdMap[backupVehicleId];
    }
    return { ...rest, vehicle_id: vehicleId };
  });
}
