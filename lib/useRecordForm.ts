"use client";

import { useCallback, useMemo, useState } from "react";
import type { FuelRecord } from "./useFuelRecords";
import { calculateFuelMetrics } from "./calculations";

/**
 * 給油記録の入力フォーム状態を一元管理するフック。
 *
 * - 入力値は文字列のまま保持する（"4." や "4.78" のような途中入力で小数点が消えないようにするため）
 * - 検証（0 以上・有限の数値）とエラー文言を提供する
 * - 単価・燃費は calculateFuelMetrics で派生させ、入力に追従してライブ更新する
 * - `toRecord()` で数値 / null に変換した保存用オブジェクトを返す
 *
 * 手動入力・最新記録の編集・履歴の編集・スキャン結果の確認シートで共通利用する。
 */

export type NumericDraftField = "fuel_amount" | "total_cost" | "total_distance";
export type DraftField = NumericDraftField | "date" | "gas_station";

export type RecordDraft = Record<DraftField, string>;

export type RecordFormErrors = Partial<Record<DraftField, string>>;

/** 保存時に addRecord / updateRecord へ渡す形 */
export type RecordInput = Omit<FuelRecord, "id" | "vehicle_id" | "created_at">;

/** 今日の日付（ローカル）を YYYY-MM-DD で返す */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function numberToDraft(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

/** FuelRecord（または解析結果など同じ形の部分オブジェクト）から文字列ドラフトを作る */
export function recordToDraft(record?: Partial<FuelRecord> | null): RecordDraft {
  return {
    date: record?.date ?? "",
    fuel_amount: numberToDraft(record?.fuel_amount),
    total_cost: numberToDraft(record?.total_cost),
    total_distance: numberToDraft(record?.total_distance),
    gas_station: record?.gas_station ?? "",
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

export type ParsedDraft = {
  date: string;
  fuel_amount: number | null;
  total_cost: number | null;
  total_distance: number | null;
  gas_station: string | null;
};

/** ドラフト全体を解析し、数値と検証エラーをまとめて返す（フック外からも使える純粋関数） */
export function parseDraft(draft: RecordDraft): { parsed: ParsedDraft; errors: RecordFormErrors } {
  const errors: RecordFormErrors = {};
  const fuel = parseDraftNumber(draft.fuel_amount);
  const cost = parseDraftNumber(draft.total_cost);
  const dist = parseDraftNumber(draft.total_distance);
  if (fuel.error) errors.fuel_amount = fuel.error;
  if (cost.error) errors.total_cost = cost.error;
  if (dist.error) errors.total_distance = dist.error;

  const date = draft.date.trim();
  if (date === "") {
    // 空のまま保存すると（編集時に）記録の日付が黙って今日に変わってしまうため、必須にする
    errors.date = "日付を入力してください";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.date = "日付の形式が正しくありません";
  }

  const station = draft.gas_station.trim();
  return {
    parsed: {
      date,
      fuel_amount: fuel.value,
      total_cost: cost.value,
      total_distance: dist.value,
      gas_station: station === "" ? null : station,
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

export type UseRecordFormReturn = {
  /** 文字列のままの入力値 */
  draft: RecordDraft;
  /** 1 フィールドを更新する */
  setField: (field: DraftField, value: string) => void;
  /** ドラフト全体を差し替える（編集開始・解析結果の反映など） */
  reset: (record?: Partial<FuelRecord> | null) => void;
  /** 数値に変換済みの値 */
  parsed: ParsedDraft;
  /** フィールドごとの検証エラー */
  errors: RecordFormErrors;
  /** 検証エラーが 1 つもないか */
  isValid: boolean;
  /** 給油量 > 0 または 支払総額 > 0 のいずれかが入っているか（保存の最低条件） */
  hasCoreValue: boolean;
  /** 単価 (円/L) と燃費 (km/L)。入力に追従して再計算される */
  metrics: ReturnType<typeof calculateFuelMetrics>;
  /** 画面に表示する単価。再計算できなければ、給油量・支払総額が未変更の間に限り元の記録の単価にフォールバックする */
  pricePerUnitDisplay: number | null;
  /**
   * 保存用オブジェクト。date が空の場合は検証エラー（isValid=false）になるため UI からは保存されないが、
   * 最後の安全策として今日の日付を入れる
   */
  toRecord: () => RecordInput;
};

/**
 * @param initial 初期値となる記録（新規作成時は省略または `{ date: todayLocalISO() }`）
 */
export function useRecordForm(initial?: Partial<FuelRecord> | null): UseRecordFormReturn {
  const [draft, setDraft] = useState<RecordDraft>(() => recordToDraft(initial));
  // 単価が再計算できないとき（OCR で給油量が読めなかった等）に保持しておく元の単価。
  // 単価の算出元（給油量・支払総額）をユーザーが触った時点で破棄し、以後は再計算値のみを使う
  // （例: 編集中に支払総額を消したのに古い単価が残り、total_cost=null・単価=160 の不整合な行になるのを防ぐ）
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(initial?.price_per_unit ?? null);

  const setField = useCallback((field: DraftField, value: string) => {
    setDraft((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    if (field === "fuel_amount" || field === "total_cost") setFallbackPrice(null);
  }, []);

  const reset = useCallback((record?: Partial<FuelRecord> | null) => {
    setDraft(recordToDraft(record));
    setFallbackPrice(record?.price_per_unit ?? null);
  }, []);

  const { parsed, errors } = useMemo(() => parseDraft(draft), [draft]);

  const metrics = useMemo(
    () => calculateFuelMetrics(parsed.total_distance, parsed.fuel_amount, parsed.total_cost),
    [parsed.total_distance, parsed.fuel_amount, parsed.total_cost]
  );

  const isValid = Object.keys(errors).length === 0;
  const hasCoreValue =
    (parsed.fuel_amount != null && parsed.fuel_amount > 0) || (parsed.total_cost != null && parsed.total_cost > 0);

  const pricePerUnitDisplay = metrics.price_per_unit ?? fallbackPrice;

  const toRecord = useCallback((): RecordInput => {
    const { parsed: p } = parseDraft(draft);
    const m = calculateFuelMetrics(p.total_distance, p.fuel_amount, p.total_cost);
    return {
      date: p.date || todayLocalISO(),
      total_distance: p.total_distance,
      fuel_amount: p.fuel_amount,
      gas_station: p.gas_station,
      price_per_unit: m.price_per_unit ?? fallbackPrice,
      total_cost: p.total_cost,
      fuel_efficiency: m.fuel_efficiency,
    };
  }, [draft, fallbackPrice]);

  return {
    draft,
    setField,
    reset,
    parsed,
    errors,
    isValid,
    hasCoreValue,
    metrics,
    pricePerUnitDisplay,
    toRecord,
  };
}
