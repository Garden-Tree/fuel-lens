"use client";

import { useCallback, useMemo, useState } from "react";
import type { FuelRecord } from "./useFuelRecords";
import type { Vehicle } from "./useVehicles";
import { calculateFuelMetrics } from "./calculations";
import {
  MEMO_MAX_LENGTH,
  distanceModeOf,
  isFuelType,
  sanitizeOdometer,
  type DistanceMode,
  type FuelType,
} from "./fillChain";

/**
 * 給油記録の入力フォーム状態を一元管理するフック。
 *
 * - 数値・文字の入力値は文字列のまま保持する（"4." や "4.78" のような途中入力で小数点が消えないようにするため）
 * - 検証（0 以上・有限の数値、メモの文字数、オドメーターモードのオドメーター必須）とエラー文言を提供する
 * - 単価・燃費は calculateFuelMetrics で派生させ、入力に追従してライブ更新する
 * - 車両の距離の入力方式（コンテキスト）に応じて区間距離を決める:
 *   トリップモードは入力値、オドメーターモードは「オドメーター − 前回のオドメーター」（docs/design-fill-chain.md 4 章）
 * - `toRecord()` で数値 / null に変換した保存用オブジェクトを返す
 *
 * 手動入力・最新記録の編集・履歴の編集・スキャン結果の確認シートで共通利用する。
 */

export type NumericDraftField = "fuel_amount" | "total_cost" | "total_distance" | "odometer";
/** 文字列で保持する入力欄 */
export type TextDraftField = NumericDraftField | "date" | "gas_station" | "memo";

export type RecordDraft = Record<TextDraftField, string> & {
  /** 満タン給油か（既定 true）。false は部分給油 */
  is_full: boolean;
  /** 前回の給油を記録し忘れた（既定 false） */
  missed_previous: boolean;
  /** 燃料種別。null は未指定 */
  fuel_type: FuelType | null;
};

export type DraftField = keyof RecordDraft;

export type RecordFormErrors = Partial<Record<DraftField, string>>;

/** 保存時に addRecord / updateRecord へ渡す形 */
export type RecordInput = Omit<FuelRecord, "id" | "vehicle_id" | "created_at">;

/**
 * フォームの前提となる車両の情報。
 * - vehicle: 記録の車両。distance_mode で入力方式を、default_fuel_type で新規記録の燃料種別の初期値を決める。省略はトリップモード
 * - previousOdometer: 連鎖計算で直前になる記録のオドメーター（lib/fillChain.ts の previousOdometer）。オドメーターモードでのみ使う
 */
export type RecordFormContext = {
  vehicle?: Pick<Vehicle, "distance_mode" | "default_fuel_type"> | null;
  previousOdometer?: number | null;
};

/** 部分給油のときの燃費欄の説明 */
export const PARTIAL_FILL_EFFICIENCY_NOTE = "次の満タン給油でまとめて計算";
/** 記録漏れのときの燃費欄の説明 */
export const MISSED_PREVIOUS_EFFICIENCY_NOTE = "記録漏れのため、この給油の燃費は計算しません";

/** 今日の日付（ローカル）を YYYY-MM-DD で返す */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function numberToDraft(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

/**
 * FuelRecord（または解析結果など同じ形の部分オブジェクト）から入力値を作る。
 * 燃料種別: 記録の値（既知の 4 値）を使う。新規の記録（id が無い）で未指定なら、車両の既定の燃料種別を初期値にする。
 */
export function recordToDraft(record?: Partial<FuelRecord> | null, context?: RecordFormContext | null): RecordDraft {
  const recordFuelType = record?.fuel_type;
  const stored = isFuelType(recordFuelType) ? recordFuelType : null;
  const isNew = !record?.id;
  const vehicleDefault = context?.vehicle?.default_fuel_type;
  return {
    date: record?.date ?? "",
    fuel_amount: numberToDraft(record?.fuel_amount),
    total_cost: numberToDraft(record?.total_cost),
    total_distance: numberToDraft(record?.total_distance),
    odometer: numberToDraft(record?.odometer),
    gas_station: record?.gas_station ?? "",
    memo: record?.memo ?? "",
    is_full: record?.is_full !== false,
    missed_previous: record?.missed_previous === true,
    fuel_type: stored ?? (isNew && isFuelType(vehicleDefault) ? vehicleDefault : null),
  };
}

/** 全角数字・全角ピリオド・全角マイナスを半角に正規化し、桁区切りカンマと空白を取り除く */
export function normalizeNumericInput(value: string): string {
  return value
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[．。]/g, ".")
    .replace(/[－ー−]/g, "-")
    .replace(/[,\s]/g, "");
}

export type ParsedNumber = { value: number | null; error?: string };

/**
 * 文字列ドラフトを数値に変換する。
 * - 空文字 → null（未入力）
 * - "4." のような途中入力 → 4（エラーなし）
 * - 数値として読めない / 負数 / 無限大 → エラー
 */
export function parseDraftNumber(raw: string): ParsedNumber {
  const s = normalizeNumericInput(raw);
  if (s === "") return { value: null };
  if (!/^-?\d*\.?\d*$/.test(s) || s === "-" || s === "." || s === "-.") {
    return { value: null, error: "数値を入力してください" };
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return { value: null, error: "数値を入力してください" };
  if (n < 0) return { value: null, error: "0以上の値を入力してください" };
  return { value: n };
}

/** 文字数（コードポイント数。DB の char_length と同じ数え方） */
export function countChars(value: string): number {
  return Array.from(value).length;
}

/**
 * オドメーター差分の区間距離。どちらかが無い・差が 0 以下なら null。
 * 小数第 2 位で丸める（lib/fillChain.ts の applyFillChain と同じ）。
 */
export function deriveOdometerDistance(
  odometer: number | null | undefined,
  previous: number | null | undefined
): number | null {
  const cur = sanitizeOdometer(odometer);
  const prev = sanitizeOdometer(previous);
  if (cur === null || prev === null || cur - prev <= 0) return null;
  return Math.round((cur - prev) * 100) / 100;
}

export type ParsedDraft = {
  date: string;
  fuel_amount: number | null;
  total_cost: number | null;
  /** 区間距離 (km)。トリップモードは入力値、オドメーターモードは odometer − previousOdometer（計算できなければ null） */
  total_distance: number | null;
  /** オドメーター (km) */
  odometer: number | null;
  gas_station: string | null;
  is_full: boolean;
  missed_previous: boolean;
  fuel_type: FuelType | null;
  /** 前後の空白を除いたメモ。空なら null */
  memo: string | null;
};

type ResolvedContext = { mode: DistanceMode; previousOdometer: number | null };

function resolveContext(context?: RecordFormContext | null): ResolvedContext {
  return {
    mode: distanceModeOf(context?.vehicle),
    previousOdometer: sanitizeOdometer(context?.previousOdometer),
  };
}

/** オドメーターモードでオドメーターが空のときのエラー文言 */
export const ODOMETER_REQUIRED_MESSAGE = "オドメーターを入力してください";

/** ドラフト全体を解析し、数値と検証エラーをまとめて返す（フック外からも使える純粋関数） */
export function parseDraft(
  draft: RecordDraft,
  context?: RecordFormContext | null
): { parsed: ParsedDraft; errors: RecordFormErrors } {
  const { mode, previousOdometer } = resolveContext(context);
  const errors: RecordFormErrors = {};
  const fuel = parseDraftNumber(draft.fuel_amount);
  const cost = parseDraftNumber(draft.total_cost);
  const dist = parseDraftNumber(draft.total_distance);
  const odo = parseDraftNumber(draft.odometer);
  if (fuel.error) errors.fuel_amount = fuel.error;
  if (cost.error) errors.total_cost = cost.error;
  // 画面に出ていない欄のエラーで保存できなくならないよう、方式ごとに表示する欄だけを検証する
  if (mode === "trip") {
    if (dist.error) errors.total_distance = dist.error;
  } else if (odo.error) {
    errors.odometer = odo.error;
  } else if (odo.value === null) {
    errors.odometer = ODOMETER_REQUIRED_MESSAGE;
  }

  const date = draft.date.trim();
  if (date === "") {
    // 空のまま保存すると（編集時に）記録の日付が黙って今日に変わってしまうため、必須にする
    errors.date = "日付を入力してください";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = "日付の形式が正しくありません";
  }

  const memo = draft.memo.trim();
  if (countChars(memo) > MEMO_MAX_LENGTH) {
    errors.memo = `メモは${MEMO_MAX_LENGTH}文字以内で入力してください`;
  }

  const station = draft.gas_station.trim();
  return {
    parsed: {
      date,
      fuel_amount: fuel.value,
      total_cost: cost.value,
      total_distance: mode === "odometer" ? deriveOdometerDistance(odo.value, previousOdometer) : dist.value,
      odometer: odo.value,
      gas_station: station === "" ? null : station,
      is_full: draft.is_full,
      missed_previous: draft.missed_previous,
      fuel_type: isFuelType(draft.fuel_type) ? draft.fuel_type : null,
      memo: memo === "" ? null : memo,
    },
    errors,
  };
}

/**
 * 既存の記録に「同じ日付・同じ給油量（誤差 0.01 未満）・同じ支払総額（null 同士も一致）」の
 * 記録があれば返す。重複保存の確認に使う。
 */
export function findDuplicateRecord(
  records: readonly FuelRecord[],
  candidate: Pick<RecordInput, "date" | "fuel_amount" | "total_cost">,
  excludeId?: string | null
): FuelRecord | null {
  for (const r of records) {
    if (excludeId && r.id === excludeId) continue;
    if ((r.date ?? "") !== (candidate.date ?? "")) continue;
    const a = r.fuel_amount;
    const b = candidate.fuel_amount;
    const sameAmount = a == null || b == null ? a == null && b == null : Math.abs(a - b) < 0.01;
    if (!sameAmount) continue;
    const sameCost = (r.total_cost ?? null) === (candidate.total_cost ?? null);
    if (!sameCost) continue;
    return r;
  }
  return null;
}

/**
 * 元の記録から引き継ぐ燃費。`null` は「引き継がない（再計算する）」、`{ value }` は保存値（null を含む）をそのまま使う。
 * 部分給油の後の満タン給油の行（前回の満タンからの距離合計 ÷ 給油量合計）などは、行の距離 ÷ 給油量で
 * 再計算すると値が変わってしまうため、区間距離・オドメーター・給油量・満タン・記録漏れを編集するまでは元の値を保つ。
 */
export type EfficiencyFallback = { value: number | null } | null;

/** 記録（の部分オブジェクト）から燃費の引き継ぎ値を作る。fuel_efficiency を持たない（新規・スキャン結果）なら引き継がない */
export function efficiencyFallbackOf(record?: Partial<FuelRecord> | null): EfficiencyFallback {
  return record && record.fuel_efficiency !== undefined ? { value: record.fuel_efficiency ?? null } : null;
}

/** 変更したら燃費の引き継ぎを破棄する（燃費の算出元の）入力欄 */
const EFFICIENCY_SOURCE_FIELDS: ReadonlySet<DraftField> = new Set<DraftField>([
  "fuel_amount",
  "total_distance",
  "odometer",
  "is_full",
  "missed_previous",
]);

/**
 * 解析済みの値から燃費を決める。
 * - 部分給油・記録漏れ: null（連鎖計算でも null。部分給油は次の満タン給油でまとめて計算される）
 * - 引き継ぎ値があればその値（null を含む）
 * - それ以外は 区間距離 ÷ 給油量
 */
function resolveEfficiency(parsed: ParsedDraft, fallbackEfficiency: EfficiencyFallback): number | null {
  if (!parsed.is_full || parsed.missed_previous) return null;
  if (fallbackEfficiency) return fallbackEfficiency.value;
  return calculateFuelMetrics(parsed.total_distance, parsed.fuel_amount, parsed.total_cost).fuel_efficiency;
}

/**
 * ドラフトから保存用オブジェクトを作る（フック外からも使える純粋関数）。
 * - 区間距離: トリップモードは入力値、オドメーターモードは導出値
 * - 単価: 再計算できなければ fallbackPrice
 * - 燃費: 部分給油・記録漏れは null。それ以外は fallbackEfficiency があればその値（null を含む）、なければ再計算値
 * - メモ: 前後の空白を除き、空なら null
 */
export function buildRecordInput(
  draft: RecordDraft,
  fallbackPrice: number | null,
  fallbackEfficiency: EfficiencyFallback,
  context?: RecordFormContext | null
): RecordInput {
  const { parsed: p } = parseDraft(draft, context);
  const m = calculateFuelMetrics(p.total_distance, p.fuel_amount, p.total_cost);
  return {
    date: p.date || todayLocalISO(),
    total_distance: p.total_distance,
    fuel_amount: p.fuel_amount,
    gas_station: p.gas_station,
    price_per_unit: m.price_per_unit ?? fallbackPrice,
    total_cost: p.total_cost,
    fuel_efficiency: resolveEfficiency(p, fallbackEfficiency),
    odometer: p.odometer,
    is_full: p.is_full,
    missed_previous: p.missed_previous,
    fuel_type: p.fuel_type,
    memo: p.memo,
  };
}

/** 燃費が null になる理由（部分給油・記録漏れ）の短い説明。それ以外は null */
export function efficiencyNoteOf(parsed: Pick<ParsedDraft, "is_full" | "missed_previous">): string | null {
  if (!parsed.is_full) return PARTIAL_FILL_EFFICIENCY_NOTE;
  if (parsed.missed_previous) return MISSED_PREVIOUS_EFFICIENCY_NOTE;
  return null;
}

export type UseRecordFormReturn = {
  /** 入力値（数値・文字は文字列のまま） */
  draft: RecordDraft;
  /** 1 フィールドを更新する */
  setField: <K extends DraftField>(field: K, value: RecordDraft[K]) => void;
  /**
   * ドラフト全体を差し替える（編集開始・解析結果の反映など）。
   * context で車両（距離の入力方式・既定の燃料種別）と前回のオドメーターを渡す。省略はトリップモード
   */
  reset: (record?: Partial<FuelRecord> | null, context?: RecordFormContext | null) => void;
  /** 距離の入力方式（reset で渡した車両の方式） */
  distanceMode: DistanceMode;
  /** 前回の記録のオドメーター（reset で渡した値。オドメーターモードの区間距離の計算に使う） */
  previousOdometer: number | null;
  /** 数値に変換済みの値（total_distance はオドメーターモードでは導出値） */
  parsed: ParsedDraft;
  /** フィールドごとの検証エラー */
  errors: RecordFormErrors;
  /** 検証エラーが 1 つもないか */
  isValid: boolean;
  /** 給油量 > 0 または 支払総額 > 0 のいずれかが入っているか（保存の最低条件） */
  hasCoreValue: boolean;
  /**
   * 単価 (円/L) と燃費 (km/L)。入力に追従して再計算される。
   * 燃費は部分給油・記録漏れなら null。元の記録の値がある間（算出元が未変更の間）は保存値（null を含む）を返す
   */
  metrics: ReturnType<typeof calculateFuelMetrics>;
  /** 燃費が null になる理由の短い説明（部分給油・記録漏れ）。それ以外は null */
  efficiencyNote: string | null;
  /**
   * 画面に表示する単価 (円/L、0.1 円単位の数値)。再計算できなければ、給油量・支払総額が未変更の間に限り元の記録の単価にフォールバックする。
   * 文字列にするときは `formatPricePerUnit`（lib/calculations.ts）を使う
   */
  pricePerUnitDisplay: number | null;
  /**
   * 保存用オブジェクト。date が空の場合は検証エラー（isValid=false）になるため UI からは保存されないが、
   * 最後の安全策として今日の日付を入れる
   */
  toRecord: () => RecordInput;
};

/**
 * @param initial 初期値となる記録（新規作成時は省略または `{ date: todayLocalISO() }`）
 * @param initialContext 車両と前回のオドメーター（reset で差し替えられる）
 */
export function useRecordForm(
  initial?: Partial<FuelRecord> | null,
  initialContext?: RecordFormContext | null
): UseRecordFormReturn {
  const [draft, setDraft] = useState<RecordDraft>(() => recordToDraft(initial, initialContext));
  const [context, setContext] = useState<RecordFormContext | null>(initialContext ?? null);
  // 単価が再計算できないとき（OCR で給油量が読めなかった等）に保持しておく元の単価。
  // 単価の算出元（給油量・支払総額）をユーザーが触った時点で破棄し、以後は再計算値のみを使う
  // （例: 編集中に支払総額を消したのに古い単価が残り、total_cost=null・単価=160 の不整合な行になるのを防ぐ）
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(initial?.price_per_unit ?? null);
  // 元の記録の燃費（null を含む）。部分給油の後の満タン給油など、連鎖計算で複数区間を合算した行の燃費を
  // 店舗名だけの編集で再計算して書き換えないよう、算出元（区間距離・給油量など）を触るまで保持する
  const [fallbackEfficiency, setFallbackEfficiency] = useState<EfficiencyFallback>(() => efficiencyFallbackOf(initial));

  const setField = useCallback(<K extends DraftField>(field: K, value: RecordDraft[K]) => {
    setDraft((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    if (field === "fuel_amount" || field === "total_cost") setFallbackPrice(null);
    if (EFFICIENCY_SOURCE_FIELDS.has(field)) setFallbackEfficiency(null);
  }, []);

  const reset = useCallback((record?: Partial<FuelRecord> | null, nextContext?: RecordFormContext | null) => {
    setDraft(recordToDraft(record, nextContext));
    setContext(nextContext ?? null);
    setFallbackPrice(record?.price_per_unit ?? null);
    setFallbackEfficiency(efficiencyFallbackOf(record));
  }, []);

  const { parsed, errors } = useMemo(() => parseDraft(draft, context), [draft, context]);
  const resolved = useMemo(() => resolveContext(context), [context]);

  const metrics = useMemo(() => {
    const m = calculateFuelMetrics(parsed.total_distance, parsed.fuel_amount, parsed.total_cost);
    return { ...m, fuel_efficiency: resolveEfficiency(parsed, fallbackEfficiency) };
  }, [parsed, fallbackEfficiency]);

  const efficiencyNote = efficiencyNoteOf(parsed);

  const isValid = Object.keys(errors).length === 0;
  const hasCoreValue =
    (parsed.fuel_amount != null && parsed.fuel_amount > 0) || (parsed.total_cost != null && parsed.total_cost > 0);

  const pricePerUnitDisplay = metrics.price_per_unit ?? fallbackPrice;

  const toRecord = useCallback(
    (): RecordInput => buildRecordInput(draft, fallbackPrice, fallbackEfficiency, context),
    [draft, fallbackPrice, fallbackEfficiency, context]
  );

  return {
    draft,
    setField,
    reset,
    distanceMode: resolved.mode,
    previousOdometer: resolved.previousOdometer,
    parsed,
    errors,
    isValid,
    hasCoreValue,
    metrics,
    efficiencyNote,
    pricePerUnitDisplay,
    toRecord,
  };
}
