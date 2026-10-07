/**
 * 連鎖計算（fill chain）と、記録・車両の新しい列（オドメーター・部分給油・記録漏れ・燃料種別・メモ・距離の入力方式）の
 * 既定値補完。純粋関数のみ（React・localStorage・Supabase には依存しない）。
 *
 * 仕様の正本は docs/design-fill-chain.md の 2 章。要点:
 * - 車両ごとに、記録を 日付昇順 → オドメーター昇順 → created_at 昇順 → id で並べる（sortForChain）
 * - 区間距離: トリップモードは入力値（total_distance）、オドメーターモードは
 *   それまでの記録で見た最大のオドメーター（running max）との差分。
 *   どちらのモードでも missed_previous なら null
 * - 燃費: 直前の満タン給油の次の記録から満タン給油までを「走行区間（run）」として Σ距離 / Σ給油量。
 *   部分給油は null。missed_previous や区間距離 null の記録で run は切れ、その記録から新しい run が始まる
 *
 * applyFillChain は 1 台分の記録を受け取る前提。複数車両の記録を混ぜて渡さないこと（呼び出し側でグループ化する。
 * 未分類の記録は既定車両のグループに入れる。useFuelRecords の fetchAllRecords を参照）。
 */

import { roundFuelEfficiency } from "./calculations";
import type { FuelRecord } from "./useFuelRecords";
import type { Vehicle } from "./useVehicles";

// ------------------------------------------------------------------
// 燃料種別・距離の入力方式
// ------------------------------------------------------------------

export type FuelType = "regular" | "premium" | "diesel" | "other";

/** 燃料種別の一覧（UI のセレクトの並び順） */
export const FUEL_TYPES: readonly FuelType[] = ["regular", "premium", "diesel", "other"];

/** 燃料種別の表示名（履歴カードのバッジにもそのまま使える短い名前） */
export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = {
  regular: "レギュラー",
  premium: "ハイオク",
  diesel: "軽油",
  other: "その他",
};

export function isFuelType(v: unknown): v is FuelType {
  return v === "regular" || v === "premium" || v === "diesel" || v === "other";
}

/** 車両の距離の入力方式。trip = トリップメーターの区間距離、odometer = 積算距離の差分 */
export type DistanceMode = "trip" | "odometer";

export const DEFAULT_DISTANCE_MODE: DistanceMode = "trip";

export function isDistanceMode(v: unknown): v is DistanceMode {
  return v === "trip" || v === "odometer";
}

/** メモの最大文字数（DB の CHECK 制約 fuel_records_memo_length_check と同じ） */
export const MEMO_MAX_LENGTH = 200;

// ------------------------------------------------------------------
// 値の正規化
// ------------------------------------------------------------------

/** オドメーター（km）: 0 以上の有限数のみ。それ以外は null */
export function sanitizeOdometer(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

/** メモ: 文字列なら前後の空白を除いて 200 コードポイントまでに切り詰める。空や文字列以外は null */
export function sanitizeMemo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  // DB の char_length は Unicode コードポイント数。UTF-16 の slice だと絵文字を途中で割ってしまう
  return Array.from(trimmed).slice(0, MEMO_MAX_LENGTH).join("");
}

/**
 * 記録の新しい列に既定値を入れた新しいオブジェクトを返す（他のキーはそのまま残す）。
 * - is_full: false 以外は true（既存データは満タン給油）
 * - missed_previous: true 以外は false
 * - odometer: 0 以上の有限数以外は null
 * - fuel_type: 既知の 4 値以外は null
 * - memo: sanitizeMemo
 * 古いローカルデータ・0004 適用前の DB の行・バックアップ version 1 の記録はこれで新しい形になる。
 */
export function normalizeRecord<T extends FuelRecord>(r: T): T & Required<Pick<FuelRecord, NewRecordField>> {
  return {
    ...r,
    odometer: sanitizeOdometer(r.odometer),
    is_full: r.is_full !== false,
    missed_previous: r.missed_previous === true,
    fuel_type: isFuelType(r.fuel_type) ? r.fuel_type : null,
    memo: sanitizeMemo(r.memo),
  };
}

/** fuel_records に 0004 で追加した列 */
export type NewRecordField = "odometer" | "is_full" | "missed_previous" | "fuel_type" | "memo";

/**
 * 車両の新しい列に既定値を入れた新しいオブジェクトを返す（他のキーはそのまま残す）。
 * - distance_mode: "odometer" 以外は "trip"
 * - default_fuel_type: 既知の 4 値以外は null
 */
export function normalizeVehicle<T extends Vehicle>(
  v: T
): T & Required<Pick<Vehicle, "distance_mode" | "default_fuel_type">> {
  return {
    ...v,
    distance_mode: v.distance_mode === "odometer" ? "odometer" : DEFAULT_DISTANCE_MODE,
    default_fuel_type: isFuelType(v.default_fuel_type) ? v.default_fuel_type : null,
  };
}

/** 車両（未指定可）の距離の入力方式。車両が無い・未設定ならトリップ */
export function distanceModeOf(vehicle: Pick<Vehicle, "distance_mode"> | null | undefined): DistanceMode {
  return vehicle?.distance_mode === "odometer" ? "odometer" : DEFAULT_DISTANCE_MODE;
}

// ------------------------------------------------------------------
// 並び順
// ------------------------------------------------------------------

type ChainSortable = Pick<FuelRecord, "id" | "date" | "odometer" | "created_at">;

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function timestampOrNull(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
}

/** null は常に後ろ */
function compareNullableNumber(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 連鎖計算の並び順の比較関数: 日付昇順 → オドメーター昇順 → created_at 昇順 → id 昇順。
 * 日付は YYYY-MM-DD の文字列比較。オドメーター・created_at が無い（null・不正）記録は同順位の中で後ろ。
 */
export function compareForChain(a: ChainSortable, b: ChainSortable): number {
  const byDate = compareString(typeof a.date === "string" ? a.date : "", typeof b.date === "string" ? b.date : "");
  if (byDate !== 0) return byDate;
  const byOdo = compareNullableNumber(finiteOrNull(a.odometer), finiteOrNull(b.odometer));
  if (byOdo !== 0) return byOdo;
  const byCreated = compareNullableNumber(timestampOrNull(a.created_at), timestampOrNull(b.created_at));
  if (byCreated !== 0) return byCreated;
  return compareString(String(a.id), String(b.id));
}

/** 連鎖計算の順（古い順）に並べた新しい配列を返す。入力は変更しない */
export function sortForChain<T extends ChainSortable>(records: readonly T[]): T[] {
  return [...records].sort(compareForChain);
}

// ------------------------------------------------------------------
// 連鎖計算
// ------------------------------------------------------------------

/** 区間距離の丸め（オドメーター差分の浮動小数点誤差を消す）。小数第 2 位 */
function roundDistance(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 1 台分の記録に連鎖計算を適用し、入力と **同じ順序** の新しい配列を返す（入力は変更しない）。
 * - total_distance: オドメーターモードのときだけ、オドメーター差分（null 可）で上書きする
 * - fuel_efficiency: 常に連鎖計算の結果で上書きする
 * 他のキーはそのまま（新しい列の既定値補完はしない。必要なら先に normalizeRecord を通す）。
 *
 * @param records 1 台分の記録（その車両に表示する未分類の記録も含める）。複数車両を混ぜないこと
 * @param vehicle 記録の車両。省略・null ならトリップモード
 */
export function applyFillChain<T extends FuelRecord>(
  records: readonly T[],
  vehicle?: Pick<Vehicle, "distance_mode"> | null
): T[] {
  const mode = distanceModeOf(vehicle);
  const order = records.map((_, i) => i).sort((i, j) => compareForChain(records[i], records[j]));

  const distances: (number | null)[] = new Array(records.length).fill(null);
  const efficiencies: (number | null)[] = new Array(records.length).fill(null);

  // オドメーターモードの基準: それまでの記録で見た最大のオドメーター（値が戻った記録では更新しない）
  let maxOdometer: number | null = null;
  // 走行区間（run）の累計。valid=false なら run 内に距離か給油量が不明な記録がある
  let runDistance = 0;
  let runFuel = 0;
  let runValid = true;

  for (const i of order) {
    const r = records[i];
    const missed = r.missed_previous === true;
    const odometer = sanitizeOdometer(r.odometer);

    let distance: number | null;
    if (mode === "odometer") {
      if (odometer === null) {
        distance = null;
      } else if (maxOdometer === null) {
        distance = null;
        maxOdometer = odometer;
      } else if (odometer <= maxOdometer) {
        distance = null;
      } else {
        distance = roundDistance(odometer - maxOdometer);
        maxOdometer = odometer; // missed_previous でも基準は更新する（距離だけ null にする）
      }
    } else {
      distance = finiteOrNull(r.total_distance);
    }
    if (missed) distance = null;
    distances[i] = distance;

    // missed_previous / 区間距離 null の記録で run を切り、その記録から新しい run を始める
    if (missed || distance === null) {
      runDistance = 0;
      runFuel = 0;
      runValid = true;
    }

    const fuel = finiteOrNull(r.fuel_amount);
    if (distance === null || fuel === null) runValid = false;
    else {
      runDistance += distance;
      runFuel += fuel;
    }

    if (r.is_full === false) {
      efficiencies[i] = null; // 部分給油: 次の満タン給油でまとめて計算する
    } else {
      efficiencies[i] = runValid && runFuel > 0 ? roundFuelEfficiency(runDistance / runFuel) : null;
      // 満タン給油で run を閉じる
      runDistance = 0;
      runFuel = 0;
      runValid = true;
    }

  }

  return records.map((r, i) => ({
    ...r,
    total_distance: mode === "odometer" ? distances[i] : r.total_distance,
    fuel_efficiency: efficiencies[i],
  }));
}

/**
 * 連鎖計算がその位置で基準にするオドメーター（フォームの「前回から ○○ km」表示用）。
 * applyFillChain と同じく、連鎖順でその位置より前の記録のオドメーターの最大値（running max）。無ければ null。
 *
 * @param records 1 台分の記録（順不同。useFuelRecords の records をそのまま渡せる）
 * @param at
 *   - `{ recordId }`: 既存の記録を編集するとき。その記録より前の記録が対象。見つからなければ null
 *   - `{ date }`: 新規に記録するとき。日付が `date` 以前の記録すべてが対象
 *     （同じ日付の既存の記録より後ろに入るとみなす）
 */
export function previousOdometer(
  records: readonly FuelRecord[],
  at: { recordId: string } | { date: string }
): number | null {
  const sorted = sortForChain(records);
  let end: number;
  if ("recordId" in at) {
    end = sorted.findIndex(r => r.id === at.recordId);
    if (end < 0) return null;
  } else {
    end = 0;
    for (const r of sorted) {
      // compareForChain と同じく、文字列でない日付は "" とみなす（先頭に並ぶ）
      const date = typeof r.date === "string" ? r.date : "";
      if (date > at.date) break;
      end += 1;
    }
  }
  let max: number | null = null;
  for (let i = 0; i < end; i++) {
    const o = sanitizeOdometer(sorted[i].odometer);
    if (o !== null && (max === null || o > max)) max = o;
  }
  return max;
}
