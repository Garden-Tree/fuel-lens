/**
 * 連鎖計算（fill chain）と、記録・車両の新しい列（オドメーター・部分給油・記録漏れ・燃料種別・メモ・距離の入力方式）の
 * 既定値補完。純粋関数のみ（React・localStorage・Supabase には依存しない）。
 *
 * 仕様の正本は docs/design-fill-chain.md の 2 章。要点:
 * - 車両ごとに、記録を 日付昇順 → オドメーター昇順 → created_at 昇順 → id で並べる（sortForChain）
 * - 区間距離: トリップモードは入力値（total_distance）、オドメーターモードは
 *   それまでの記録で見た最大のオドメーター（running max）との差分。missed_previous なら null。
 *   missed_previous の記録が基準を進められなかった（オドメーターが null か基準以下）ときは基準が信頼できないので、
 *   次に基準を進める記録を先頭扱い（距離 null、基準をその値にする）にする。
 *   トリップモードの missed_previous は入力した区間距離を保持し（編集で消さない）、燃費だけ null にする
 * - 燃費: 直前の満タン給油の次の記録から満タン給油までを「走行区間（run）」として Σ距離 / Σ給油量。
 *   部分給油は null。run が切れるのは missed_previous の記録と、トリップモードで区間距離が null の記録だけ。
 *   切った記録自身は新しい run に含めない（燃費 null、給油量も持ち越さない。新しい run は次の記録から始まる）
 * - 燃費が出た記録には、その run の合計を導出値 run_distance / run_fuel / run_cost として付ける（保存しない。統計用）
 * - 持ち越し行（carry row）: オドメーターモードで、オドメーターが null か基準以下のため区間が出せなかった記録
 *   （missed_previous ではない）。基準が進まないので次に区間が出た記録の距離に持ち越し行の分も含まれる。
 *   したがって run を切らず、燃費は null、給油量は run に積み上げる（部分給油と同じ扱い。満タン給油でも run を閉じない）
 *
 * applyFillChain は 1 台分の記録を受け取る前提。複数車両の記録を混ぜて渡さないこと（呼び出し側でグループ化する。
 * 未分類の記録は既定車両のグループに入れる。useFuelRecords の fetchAllRecords を参照）。
 */

import { roundFuelEfficiency } from "./calculations";
import type { DistanceMode, FuelRecord, FuelType, NewRecordField, Vehicle } from "./types";

// ------------------------------------------------------------------
// 燃料種別・距離の入力方式（型と FUEL_TYPES / FUEL_TYPE_LABELS は lib/types.ts）
// ------------------------------------------------------------------

export function isFuelType(v: unknown): v is FuelType {
  return v === "regular" || v === "premium" || v === "diesel" || v === "other";
}

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
 * - total_distance: オドメーターモードのときだけ、オドメーター差分（null 可）で上書きする。
 *   トリップモードでは入力値のまま（missed_previous の記録も保持する。燃費の計算では区間不明として扱う）
 * - fuel_efficiency: 常に連鎖計算の結果で上書きする
 * - run_distance / run_fuel / run_cost（導出値。保存しない）: 燃費が出た満タン給油の記録（run を閉じた記録）にだけ付ける。
 *   その run（部分給油・持ち越し行と、閉じた記録自身）の Σ区間距離・Σ給油量・Σ支払総額（支払総額の無い記録が 1 件でもあれば null）。
 *   統計（lib/stats.ts の summarize）が run 単位で Σkm/ΣL と 円/km を出すために使う。それ以外の記録からは取り除く
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
  const { distances, efficiencies, runs } = computeChain(records, mode);
  return records.map((r, i) => {
    const out: FuelRecord = {
      ...r,
      // オドメーターモードは導出値。トリップモードは入力値（missed_previous の記録も保持する）
      total_distance: mode === "odometer" ? distances[i] : r.total_distance,
      fuel_efficiency: efficiencies[i],
    };
    const run = runs[i];
    if (run) {
      out.run_distance = run.distance;
      out.run_fuel = run.fuel;
      out.run_cost = run.cost;
    } else {
      // 入力に古い導出値が残っていても引き継がない
      delete out.run_distance;
      delete out.run_fuel;
      delete out.run_cost;
    }
    return out as T;
  });
}

/** 満タン給油で閉じた走行区間（run）の合計（applyFillChain が run_* として付ける値） */
type ClosedRun = { distance: number; fuel: number; cost: number | null };

type ChainResult = {
  /** 入力と同じ順序の区間距離（燃費の計算上の値。run を切った記録は null） */
  distances: (number | null)[];
  /** 入力と同じ順序の燃費 */
  efficiencies: (number | null)[];
  /** 入力と同じ順序の、その記録が閉じた run の合計（燃費が出た満タン給油の記録だけ。それ以外は null） */
  runs: (ClosedRun | null)[];
  /** 最後の記録の後で開いている run（まだ満タン給油で閉じていない記録） */
  openRun: OpenRun;
  /** 最後の記録の後のオドメーターの基準（running max）。オドメーターモードでのみ意味を持つ */
  base: number | null;
  /** 基準が信頼できないか（記録漏れの記録が基準を進められず、その後まだ基準が進んでいない） */
  baseStale: boolean;
};

/** 連鎖計算の本体（docs/design-fill-chain.md 2 章） */
function computeChain(records: readonly FuelRecord[], mode: DistanceMode): ChainResult {
  const order = records.map((_, i) => i).sort((i, j) => compareForChain(records[i], records[j]));

  const distances: (number | null)[] = new Array(records.length).fill(null);
  const efficiencies: (number | null)[] = new Array(records.length).fill(null);
  const runs: (ClosedRun | null)[] = new Array(records.length).fill(null);

  // オドメーターモードの基準: それまでの記録で見た最大のオドメーター（値が戻った記録では更新しない）
  let maxOdometer: number | null = null;
  // 基準が信頼できないか（missed_previous の記録が基準を進められなかった）。次に基準を進める記録を先頭扱いにする
  let baseStale = false;
  // 走行区間（run）の累計。valid=false なら run 内に距離か給油量が不明な記録がある
  let runDistance = 0;
  let runFuel = 0;
  let runValid = true;
  let runCount = 0;
  // run の支払総額の合計。costValid=false なら支払総額の無い記録がある
  let runCost = 0;
  let runCostValid = true;

  const resetRun = () => {
    runDistance = 0;
    runFuel = 0;
    runValid = true;
    runCount = 0;
    runCost = 0;
    runCostValid = true;
  };

  /** 記録の給油量と支払総額を run に積む（距離は呼び出し側で扱う） */
  const addToRun = (fuel: number | null, cost: number | null) => {
    if (fuel === null) runValid = false;
    else runFuel += fuel;
    if (cost === null) runCostValid = false;
    else runCost += cost;
    runCount += 1;
  };

  for (const i of order) {
    const r = records[i];
    const missed = r.missed_previous === true;
    const odometer = sanitizeOdometer(r.odometer);
    const fuel = finiteOrNull(r.fuel_amount);
    const cost = finiteOrNull(r.total_cost);

    let distance: number | null;
    // 持ち越し行（オドメーターモードのみ）: 区間が出せないが run は切らない記録
    let carry = false;
    if (mode === "odometer") {
      let advanced = false;
      if (odometer === null) {
        distance = null;
        carry = true;
      } else if (maxOdometer === null || (baseStale && odometer > maxOdometer)) {
        // 先頭（基準が無い）、または記録漏れの後で基準が信頼できない: 区間は出せないが、ここから基準が始まる。持ち越し行ではない
        distance = null;
        maxOdometer = odometer;
        advanced = true;
      } else if (odometer <= maxOdometer) {
        distance = null; // 値が戻った・同じ値の記録は基準を更新しない
        carry = true;
      } else {
        distance = roundDistance(odometer - maxOdometer);
        maxOdometer = odometer; // missed_previous でも基準は更新する（距離だけ null にする）
        advanced = true;
      }
      if (advanced) baseStale = false;
      // 記録漏れの記録が基準を進められなかったら、基準と次の区間の間に記録されていない給油がある。
      // 基準を進める記録が現れるまで（間の持ち越し行を挟んでも）基準を信頼しない
      else if (missed) baseStale = true;
    } else {
      distance = finiteOrNull(r.total_distance);
    }

    // run を切る記録: missed_previous の記録と、トリップモードで区間距離が null の記録。
    // 切った記録自身は新しい run に含めない（新しい run は次の記録から始まる）。その記録の給油量は区間が不明なので持ち越さない。
    // missed_previous の区間は信頼できないので距離も null（持ち越し行にもしない）。
    // トリップモードの total_distance は applyFillChain が入力値を保持する（ここでは燃費の計算上だけ null）
    if (missed || (mode === "trip" && distance === null)) {
      distances[i] = null;
      efficiencies[i] = null;
      resetRun();
      continue;
    }
    distances[i] = distance;

    if (carry) {
      // 給油量だけを run に積み上げる（距離は次に区間が出た記録の差分に含まれる）。燃費は null で run は閉じない
      addToRun(fuel, cost);
      efficiencies[i] = null;
      continue;
    }

    // オドメーターモードの先頭（基準が無い・信頼できない）記録は run を切らないが、距離 null なので run は不明になる
    if (distance === null) runValid = false;
    else runDistance += distance;
    addToRun(fuel, cost);

    if (r.is_full === false) {
      efficiencies[i] = null; // 部分給油: 次の満タン給油でまとめて計算する
    } else {
      const efficiency = runValid && runFuel > 0 ? roundFuelEfficiency(runDistance / runFuel) : null;
      efficiencies[i] = efficiency;
      if (efficiency !== null) {
        runs[i] = { distance: runDistance, fuel: runFuel, cost: runCostValid ? runCost : null };
      }
      resetRun(); // 満タン給油で run を閉じる
    }
  }

  return {
    distances,
    efficiencies,
    runs,
    openRun: { distance: runDistance, fuel: runFuel, valid: runValid, count: runCount, baseStale },
    base: maxOdometer,
    baseStale,
  };
}

/** 開いている走行区間（直前の満タン給油の次の記録から、ある位置の手前まで）の合計 */
export type OpenRun = {
  /** 区間距離の合計（valid が false なら不完全な値） */
  distance: number;
  /** 給油量の合計（valid が false なら不完全な値） */
  fuel: number;
  /** run 内のすべての記録で区間距離と給油量が分かっているか。false なら合算した燃費は出せない */
  valid: boolean;
  /** run に含まれる記録の件数（部分給油と持ち越し行）。0 なら run は空 */
  count: number;
  /**
   * オドメーターモードで、その位置の基準が信頼できないか（記録漏れの記録が基準を進められず、その後まだ基準が進んでいない）。
   * true のとき previousOdometer は null で、フォームは「記録漏れの直後のため区間は計算できません」と出す。
   * openRunBefore は常に入れる（省略は false とみなす）
   */
  baseStale?: boolean;
};

/**
 * 連鎖の中の位置（previousOdometer / openRunBefore / chainBaseBefore）。
 * - `{ date, odometer? }`: 新規に記録するとき。その日付・オドメーターの記録を「いま」保存したときに並ぶ位置
 *   （compareForChain で前に並ぶ既存の記録すべての後ろ。同じ日付の記録もオドメーター → created_at の順に連鎖計算と同じく考慮する）。
 *   odometer が省略・null なら、同じ日付でオドメーターのある記録・created_at のある記録の後ろ、created_at の無い（古い）記録の前
 * - `{ recordId }`: 既存の記録を編集するとき。その記録の直前。見つからなければ位置なし
 * - `{ recordId, date?, odometer? }`: 既存の記録の日付・オドメーターを変えたとき。その記録自身を除き、
 *   変更後の日付・オドメーター（省略した方は保存値。created_at と id は保存値のまま）で並ぶ位置
 */
export type ChainPosition =
  | { date: string; odometer?: number | null }
  | { recordId: string; date?: string; odometer?: number | null };

/**
 * フォームで入力中の日付・オドメーターから ChainPosition を作る（フォームの getPreviousOdometer / getOpenRun 用）。
 * - 編集中の記録（recordId）が records にあれば `{ recordId, date, odometer }`。その記録自身を除き、
 *   created_at と id は保存値のまま並べるので、同じ日付の記録の中の位置が連鎖計算と一致する
 * - 新規の記録、または編集中の記録が records に無い（再読み込みで消えた）ときは新規として `{ date, odometer }`
 * odometer は入力中の値（未入力・省略は null。保存値ではなく入力値で位置を決める）。
 */
export function formChainPosition(
  records: readonly Pick<FuelRecord, "id">[],
  date: string,
  recordId?: string | null,
  odometer?: number | null
): ChainPosition {
  const odo = odometer ?? null;
  if (recordId && records.some(r => r.id === recordId)) return { recordId, date, odometer: odo };
  return { date, odometer: odo };
}

/**
 * 新規の記録の created_at の代わり。保存時刻（いま）は既存の記録の created_at より後なので、その代わりに最大の時刻を使う
 * （created_at の無い古い記録よりは前に並ぶ。compareForChain は created_at の無い記録を後ろに置く）。純粋関数のまま「いま」と同じ並びになる
 */
const NEW_RECORD_CREATED_AT = "9999-12-31T23:59:59.999Z";
/** 新規の記録の id の代わり（同じ created_at の記録の中で最後） */
const NEW_RECORD_ID = "￿";

/** 位置より前に並ぶ記録（連鎖順）。位置が無い（recordId が見つからない）なら null */
function recordsBefore(records: readonly FuelRecord[], at: ChainPosition): FuelRecord[] | null {
  const sorted = sortForChain(records);
  if ("recordId" in at) {
    const idx = sorted.findIndex(r => r.id === at.recordId);
    if (idx < 0) return null;
    if (at.date === undefined && at.odometer === undefined) return sorted.slice(0, idx);
    const self = sorted[idx];
    const candidate: FuelRecord = {
      ...self,
      date: at.date ?? self.date,
      odometer: at.odometer !== undefined ? sanitizeOdometer(at.odometer) : self.odometer,
    };
    return sorted.filter((r, i) => i !== idx && compareForChain(r, candidate) < 0);
  }
  const candidate = {
    id: NEW_RECORD_ID,
    date: at.date,
    odometer: sanitizeOdometer(at.odometer),
    created_at: NEW_RECORD_CREATED_AT,
  };
  return sorted.filter(r => compareForChain(r, candidate) < 0);
}

/**
 * ある位置の直前で「開いている run」（部分給油・持ち越し行が、直前の満タン給油や run の切れ目の後に積み上がったもの）の合計。
 * フォームの燃費プレビューを、保存後に連鎖計算が出す値（部分給油の分を合算した Σ距離 / Σ給油量）と一致させるために使う。
 * run が無ければ 0 / 0 / valid / count 0。給油量が null の記録や、オドメーターモードで基準の無い記録が含まれると valid は false。
 * baseStale（オドメーターモードで記録漏れの直後のため基準が無い）も返す。
 *
 * @param records 1 台分の記録（順不同）
 * @param vehicle 記録の車両。省略・null ならトリップモード
 * @param at 位置（ChainPosition。previousOdometer と同じ）
 */
export function openRunBefore(
  records: readonly FuelRecord[],
  vehicle: Pick<Vehicle, "distance_mode"> | null | undefined,
  at: ChainPosition
): OpenRun {
  const before = recordsBefore(records, at);
  if (before === null) return { distance: 0, fuel: 0, valid: true, count: 0, baseStale: false };
  return computeChain(before, distanceModeOf(vehicle)).openRun;
}

/**
 * 連鎖計算がその位置で基準にするオドメーターと、基準が信頼できないか。
 * - odometer: 連鎖順でその位置より前の記録のオドメーターの最大値（running max）。stale なら null。記録が無ければ null
 * - stale: 記録漏れ（missed_previous）の記録が基準を進められず、その後まだ基準が進んでいない（連鎖計算でも区間は null になる）
 */
export function chainBaseBefore(
  records: readonly FuelRecord[],
  at: ChainPosition
): { odometer: number | null; stale: boolean } {
  const before = recordsBefore(records, at);
  if (before === null) return { odometer: null, stale: false };
  const { base, baseStale } = computeChain(before, "odometer");
  return { odometer: baseStale ? null : base, stale: baseStale };
}

/**
 * 連鎖計算がその位置で基準にするオドメーター（フォームの「前回から ○○ km」表示用）。chainBaseBefore の odometer。
 * applyFillChain と同じく、連鎖順でその位置より前の記録のオドメーターの最大値（running max）。無ければ null。
 * 記録漏れ（missed_previous）の記録が基準を進められず、その後まだ基準が進んでいない位置でも null
 * （連鎖計算でも区間は null になる。理由を区別するときは chainBaseBefore の stale か openRunBefore の baseStale を使う）。
 *
 * @param records 1 台分の記録（順不同。useFuelRecords の records をそのまま渡せる）
 * @param at 位置（ChainPosition）
 *   - `{ recordId }`: 既存の記録を編集するとき。その記録より前の記録が対象。見つからなければ null
 *   - `{ date, odometer? }`: 新規に記録するとき。その日付・オドメーターの記録を「いま」保存したときに前に並ぶ記録が対象
 *   - `{ recordId, date?, odometer? }`: 既存の記録の日付・オドメーターを変えたとき（その記録自身は除く）
 */
export function previousOdometer(records: readonly FuelRecord[], at: ChainPosition): number | null {
  return chainBaseBefore(records, at).odometer;
}
