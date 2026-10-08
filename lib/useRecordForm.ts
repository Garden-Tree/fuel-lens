"use client";

import { useCallback, useMemo, useState } from "react";
import type { DistanceMode, FuelRecord, RecordInput } from "./types";
import { calculateFuelMetrics } from "./calculations";
import { distanceModeOf, previewInChain } from "./fillChain";
import {
  EFFICIENCY_SOURCE_FIELDS,
  buildRecordInput,
  efficiencyFallbackOf,
  efficiencyNoteOf,
  formEfficiencyOf,
  formTargetOf,
  odometerHintOf,
  odometerRequiredFor,
  parseDraft,
  previewCandidateOf,
  recordToDraft,
  type DraftField,
  type EfficiencyFallback,
  type ParsedDraft,
  type RecordDraft,
  type RecordFormContext,
  type RecordFormErrors,
  type RecordFormTarget,
} from "./recordDraft";

// 純粋なヘルパーは lib/recordDraft.ts。既存の import 先（@/lib/useRecordForm）のまま使えるよう再エクスポートする
// （"use client" のモジュールでは export * が使えないため名前を列挙する）
export {
  AFTER_MISSED_DISTANCE_NOTE,
  EFFICIENCY_SOURCE_FIELDS,
  MISSED_PREVIOUS_DISTANCE_NOTE,
  MISSED_PREVIOUS_EFFICIENCY_NOTE,
  ODOMETER_OPTIONAL_HINT,
  ODOMETER_REQUIRED_MESSAGE,
  PARTIAL_FILL_EFFICIENCY_NOTE,
  buildRecordInput,
  countChars,
  efficiencyFallbackOf,
  efficiencyNoteOf,
  findDuplicateRecord,
  formEfficiencyOf,
  formPreviewOf,
  formTargetOf,
  mergedRunNote,
  normalizeNumericInput,
  odometerHintOf,
  odometerRequiredFor,
  parseDraft,
  parseDraftNumber,
  previewCandidateOf,
  recordToDraft,
  visibleScanWarnings,
} from "./recordDraft";
export type {
  ChainDraftFields,
  DraftField,
  EfficiencyFallback,
  NumericDraftField,
  ParseDraftOptions,
  ParsedDraft,
  ParsedNumber,
  RecordDraft,
  RecordFormContext,
  RecordFormErrors,
  RecordFormTarget,
  TextDraftField,
} from "./recordDraft";
/** @deprecated lib/types.ts から import する（互換のための再エクスポート） */
export type { RecordInput } from "./types";
/** @deprecated lib/dates.ts から import する（互換のための再エクスポート） */
export { todayLocalISO } from "./dates";

/**
 * 給油記録の入力フォーム状態を一元管理するフック。
 *
 * - 数値・文字の入力値は文字列のまま保持する（"4." や "4.78" のような途中入力で小数点が消えないようにするため）
 * - 検証（0 以上・有限の数値、メモの文字数、オドメーターモードのオドメーター必須）とエラー文言を提供する。
 *   オドメーターが必須なのは「手動で新規に記録するとき」だけ（odometerRequiredFor を参照）。
 *   既存の記録の編集とスキャン結果では未入力でも保存でき、注意表示（ODOMETER_OPTIONAL_HINT）を出す。
 *   オドメーターの無い記録は連鎖計算で「持ち越し行」になり、区間距離は null のまま次の区間にまとめて計算される
 * - 燃費・区間距離（オドメーターモード）・前回のオドメーターは、入力中の記録を context.records に差し込んだ連鎖計算の結果
 *   （lib/fillChain.ts の previewInChain）。保存後に連鎖計算が出す値と常に一致する（docs/design-fill-chain.md 4 章）
 * - 単価は calculateFuelMetrics で派生させ、入力に追従してライブ更新する
 * - `toRecord()` で数値 / null に変換した保存用オブジェクトを返す
 *
 * 手動入力・最新記録の編集・履歴の編集・スキャン結果の確認シートで共通利用する。
 */

export type UseRecordFormReturn = {
  /** 入力値（数値・文字は文字列のまま） */
  draft: RecordDraft;
  /** 1 フィールドを更新する */
  setField: <K extends DraftField>(field: K, value: RecordDraft[K]) => void;
  /**
   * ドラフト全体を差し替える（編集開始・解析結果の反映など）。
   * context で車両（距離の入力方式・既定の燃料種別）と、その車両の記録（プレビューの連鎖計算に使う）を渡す。省略はトリップモード・記録なし
   */
  reset: (record?: Partial<FuelRecord> | null, context?: RecordFormContext | null) => void;
  /** 距離の入力方式（reset で渡した車両の方式） */
  distanceMode: DistanceMode;
  /**
   * 連鎖計算でこの記録の直前の基準になるオドメーター（オドメーターモードの「前回から ○○ km」。previewInChain の base）。
   * 入力中の日付・オドメーターでの位置の値。無い・基準が信頼できないときは null
   */
  previousOdometer: number | null;
  /**
   * 直前の記録漏れのために基準（前回のオドメーター）が無いか（previewInChain の baseStale）。
   * true のとき previousOdometer は null で、区間は連鎖計算でも計算されない（AFTER_MISSED_DISTANCE_NOTE を出す）
   */
  previousOdometerStale: boolean;
  /** オドメーターが必須か（オドメーターモードの手動の新規記録のみ。odometerRequiredFor） */
  odometerRequired: boolean;
  /** オドメーター未入力の注意（必須でないときだけ。ODOMETER_OPTIONAL_HINT）。それ以外は null */
  odometerHint: string | null;
  /** 数値に変換済みの値（total_distance はオドメーターモードでは連鎖計算の導出値） */
  parsed: ParsedDraft;
  /** フィールドごとの検証エラー */
  errors: RecordFormErrors;
  /** 検証エラーが 1 つもないか */
  isValid: boolean;
  /** 給油量 > 0 または 支払総額 > 0 のいずれかが入っているか（保存の最低条件） */
  hasCoreValue: boolean;
  /**
   * 単価 (円/L) と燃費 (km/L)。入力に追従して再計算される。
   * 燃費は連鎖計算のプレビュー（部分給油・記録漏れは null）。元の記録の値がある間（算出元が未変更の間）は保存値（null を含む）を返す
   */
  metrics: ReturnType<typeof calculateFuelMetrics>;
  /** 燃費が null になる理由の短い説明（部分給油・記録漏れ）。それ以外は null */
  efficiencyNote: string | null;
  /** 燃費のプレビューに合算した部分給油・持ち越し行の件数（0 なら合算なし。mergedRunNote の n） */
  mergedRunCount: number;
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

const NO_RECORDS: readonly FuelRecord[] = [];

/**
 * @param initial 初期値となる記録（新規作成時は省略または `{ date: todayLocalISO() }`）
 * @param initialContext 車両とその記録（reset で差し替えられる）
 */
export function useRecordForm(
  initial?: Partial<FuelRecord> | null,
  initialContext?: RecordFormContext | null
): UseRecordFormReturn {
  const [draft, setDraft] = useState<RecordDraft>(() => recordToDraft(initial, initialContext));
  const [context, setContext] = useState<RecordFormContext | null>(initialContext ?? null);
  // 編集中の記録の ID と開いたときの日付（オドメーター必須の判定・連鎖の中の位置）
  const [target, setTarget] = useState<RecordFormTarget>(() => formTargetOf(initial));
  // 単価が再計算できないとき（OCR で給油量が読めなかった等）に保持しておく元の単価。
  // 単価の算出元（給油量・支払総額）をユーザーが触った時点で破棄し、以後は再計算値のみを使う
  // （例: 編集中に支払総額を消したのに古い単価が残り、total_cost=null・単価=160 の不整合な行になるのを防ぐ）
  const [fallbackPrice, setFallbackPrice] = useState<number | null>(initial?.price_per_unit ?? null);
  // 元の記録の燃費（null を含む）。店舗名だけの編集で保存値を書き換えないよう、算出元（区間距離・給油量など）を触るまで保持する
  const [fallbackEfficiency, setFallbackEfficiency] = useState<EfficiencyFallback>(() => efficiencyFallbackOf(initial));

  const setField = useCallback(<K extends DraftField>(field: K, value: RecordDraft[K]) => {
    setDraft((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    if (field === "fuel_amount" || field === "total_cost") setFallbackPrice(null);
    if (EFFICIENCY_SOURCE_FIELDS.has(field)) setFallbackEfficiency(null);
  }, []);

  const reset = useCallback((record?: Partial<FuelRecord> | null, nextContext?: RecordFormContext | null) => {
    setDraft(recordToDraft(record, nextContext));
    setContext(nextContext ?? null);
    setTarget(formTargetOf(record));
    setFallbackPrice(record?.price_per_unit ?? null);
    setFallbackEfficiency(efficiencyFallbackOf(record));
  }, []);

  const vehicle = context?.vehicle ?? null;
  const records = context?.records ?? NO_RECORDS;
  const distanceMode = distanceModeOf(vehicle);

  // 連鎖計算のプレビュー: 入力中の記録を records に差し込んだ結果。店舗名・メモ・燃料種別の入力では計算し直さない
  const { date, odometer, total_distance, fuel_amount, total_cost, is_full, missed_previous } = draft;
  const preview = useMemo(
    () =>
      previewInChain(
        records,
        vehicle,
        previewCandidateOf({ date, odometer, total_distance, fuel_amount, total_cost, is_full, missed_previous }, target)
      ),
    [records, vehicle, target, date, odometer, total_distance, fuel_amount, total_cost, is_full, missed_previous]
  );

  const odometerRequired = odometerRequiredFor(context, target);
  const { parsed, errors } = useMemo(
    () => parseDraft(draft, context, { odometerRequired, preview }),
    [draft, context, odometerRequired, preview]
  );
  const odometerHint = odometerHintOf(distanceMode, parsed, errors);

  const { fuel_efficiency, mergedRunCount } = formEfficiencyOf(parsed, fallbackEfficiency, preview);
  const metrics = useMemo(
    () => ({
      price_per_unit: calculateFuelMetrics(parsed.total_distance, parsed.fuel_amount, parsed.total_cost).price_per_unit,
      fuel_efficiency,
    }),
    [parsed, fuel_efficiency]
  );

  const efficiencyNote = efficiencyNoteOf(parsed);

  const isValid = Object.keys(errors).length === 0;
  const hasCoreValue =
    (parsed.fuel_amount != null && parsed.fuel_amount > 0) || (parsed.total_cost != null && parsed.total_cost > 0);

  const pricePerUnitDisplay = metrics.price_per_unit ?? fallbackPrice;

  const toRecord = useCallback(
    (): RecordInput => buildRecordInput(draft, fallbackPrice, fallbackEfficiency, context, target),
    [draft, fallbackPrice, fallbackEfficiency, context, target]
  );

  return {
    draft,
    setField,
    reset,
    distanceMode,
    previousOdometer: preview.base,
    previousOdometerStale: preview.baseStale,
    odometerRequired,
    odometerHint,
    parsed,
    errors,
    isValid,
    hasCoreValue,
    metrics,
    efficiencyNote,
    mergedRunCount,
    pricePerUnitDisplay,
    toRecord,
  };
}
