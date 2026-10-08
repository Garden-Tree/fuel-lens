"use client";

import { useId, useState, type Ref } from "react";
import { X, Save, Lock, Loader2, ChevronDown } from "lucide-react";
import {
  AFTER_MISSED_DISTANCE_NOTE,
  MISSED_PREVIOUS_DISTANCE_NOTE,
  ODOMETER_REQUIRED_MESSAGE,
  countChars,
  mergedRunNote,
  type DraftField,
  type UseRecordFormReturn,
} from "@/lib/useRecordForm";
import { formatPricePerUnit } from "@/lib/calculations";
import { MEMO_MAX_LENGTH, isFuelType } from "@/lib/fillChain";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/types";

interface Props {
  /** useRecordForm() の戻り値 */
  form: UseRecordFormReturn;
  onCancel: () => void;
  onSave: () => void;
  /** 保存処理中。ボタンを無効化してスピナーを出す */
  saving?: boolean;
  /** 閲覧専用など、入力・保存を一切受け付けない */
  disabled?: boolean;
  /** 保存ボタンを押せない追加条件（false で無効化し、saveHint を表示する） */
  canSave?: boolean;
  /** 保存できない理由の短い説明 */
  saveHint?: string;
  saveLabel?: string;
  cancelLabel?: string;
  /** 「要確認」として強調するフィールド（スキャン結果の低確信度・未読み取り項目） */
  highlightFields?: Partial<Record<DraftField, boolean>>;
  /** 先頭の入力欄（給油日）へフォーカスを当てるための ref */
  firstFieldRef?: Ref<HTMLInputElement>;
}

const BASE_INPUT =
  "w-full bg-gray-900 border rounded-lg p-2 text-white font-mono transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed";

function inputClass(opts: { error?: string; highlight?: boolean }) {
  if (opts.error) return `${BASE_INPUT} border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500`;
  if (opts.highlight) return `${BASE_INPUT} border-amber-500`;
  return `${BASE_INPUT} border-gray-600`;
}

function formatKm(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

export default function EditFuelRecordForm({
  form,
  onCancel,
  onSave,
  saving = false,
  disabled = false,
  canSave = true,
  saveHint,
  saveLabel = "保存",
  cancelLabel = "キャンセル",
  highlightFields,
  firstFieldRef,
}: Props) {
  const uid = useId();
  const {
    draft,
    setField,
    errors,
    metrics,
    pricePerUnitDisplay,
    parsed,
    distanceMode,
    previousOdometer,
    previousOdometerStale,
    efficiencyNote,
    mergedRunCount,
    odometerRequired,
    odometerHint,
  } = form;
  const idFor = (field: DraftField) => `${uid}-${field}`;
  const errorIdFor = (field: DraftField) => `${uid}-${field}-error`;
  const inputsDisabled = disabled || saving;
  const saveDisabled = inputsDisabled || !form.isValid || !canSave;

  // 詳細欄（記録漏れ・燃料種別・メモ）。記録漏れ・メモが入っている記録を開いたときは最初から開く
  const [detailsOpen, setDetailsOpen] = useState(() => draft.missed_previous || draft.memo.trim() !== "");
  // メモのエラーは折りたたみの中に隠さない
  const showDetails = detailsOpen || !!errors.memo;
  const detailsId = `${uid}-details`;

  // オドメーターモードで未入力のときは「必須」の案内（赤いエラーではなく注意表示）にする。
  // 必須なのは手動の新規記録だけ。編集・スキャン結果では odometerHint（保存はできる）を出す（useRecordForm の odometerRequiredFor）
  const odometerMissing = errors.odometer === ODOMETER_REQUIRED_MESSAGE;
  const odometerHintId = `${uid}-odometer-hint`;

  const renderLabel = (field: DraftField, text: string, extra?: React.ReactNode) => (
    <label htmlFor={idFor(field)} className="text-xs text-gray-500 block mb-1">
      <span className="flex items-center gap-1">
        {text}
        {highlightFields?.[field] && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">要確認</span>
        )}
      </span>
      {extra}
    </label>
  );

  const renderError = (field: DraftField) =>
    errors[field] ? (
      <p id={errorIdFor(field)} role="alert" className="mt-1 text-[11px] text-red-400">
        {errors[field]}
      </p>
    ) : null;

  const ariaProps = (field: DraftField) => ({
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": errors[field] ? errorIdFor(field) : undefined,
  });

  // オドメーターモードの「前回から ○○ km」の表示
  const odometerDistanceText = (() => {
    if (draft.missed_previous) return MISSED_PREVIOUS_DISTANCE_NOTE;
    if (previousOdometer === null) {
      // 直前の記録漏れで基準が無い（連鎖計算でもこの記録から基準がやり直しになる）か、そもそも前回の記録が無い
      return previousOdometerStale ? AFTER_MISSED_DISTANCE_NOTE : "前回のオドメーターが無いため区間は計算できません";
    }
    if (parsed.total_distance !== null) return `前回から ${formatKm(parsed.total_distance)} km（自動計算）`;
    if (parsed.odometer === null) return `前回のオドメーター: ${formatKm(previousOdometer)} km`;
    return `前回（${formatKm(previousOdometer)} km）より大きい値を入力すると区間を計算します`;
  })();

  const memoLength = countChars(draft.memo.trim());
  const detailsSummary = [
    draft.missed_previous ? "記録漏れ" : null,
    isFuelType(draft.fuel_type) ? FUEL_TYPE_LABELS[draft.fuel_type] : null,
    draft.memo.trim() ? "メモあり" : null,
  ].filter(Boolean);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!saveDisabled) onSave();
      }}
    >
      <div>
        {renderLabel("date", "給油日")}
        <input
          id={idFor("date")}
          ref={firstFieldRef}
          type="date"
          value={draft.date}
          disabled={inputsDisabled}
          onChange={(e) => setField("date", e.target.value)}
          className={inputClass({ error: errors.date, highlight: highlightFields?.date })}
          {...ariaProps("date")}
        />
        {renderError("date")}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          {renderLabel("fuel_amount", "給油量 (L)")}
          <input
            id={idFor("fuel_amount")}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="例: 35.2"
            value={draft.fuel_amount}
            disabled={inputsDisabled}
            onChange={(e) => setField("fuel_amount", e.target.value)}
            className={inputClass({ error: errors.fuel_amount, highlight: highlightFields?.fuel_amount })}
            {...ariaProps("fuel_amount")}
          />
          {renderError("fuel_amount")}
        </div>
        <div>
          {renderLabel("total_cost", "支払総額 (円)")}
          <input
            id={idFor("total_cost")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="例: 5800"
            value={draft.total_cost}
            disabled={inputsDisabled}
            onChange={(e) => setField("total_cost", e.target.value)}
            className={inputClass({ error: errors.total_cost, highlight: highlightFields?.total_cost })}
            {...ariaProps("total_cost")}
          />
          {renderError("total_cost")}
        </div>
        {distanceMode === "odometer" ? (
          <div>
            {renderLabel(
              "odometer",
              "オドメーター (km)",
              <span className="block text-[10px] text-gray-600 font-normal">給油時の積算距離</span>
            )}
            <input
              id={idFor("odometer")}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例: 12345"
              value={draft.odometer}
              disabled={inputsDisabled}
              onChange={(e) => setField("odometer", e.target.value)}
              aria-required={odometerRequired ? "true" : undefined}
              className={inputClass({
                error: odometerMissing ? undefined : errors.odometer,
                highlight: odometerMissing || !!odometerHint || highlightFields?.odometer,
              })}
              aria-invalid={errors.odometer && !odometerMissing ? true : undefined}
              aria-describedby={`${errors.odometer ? `${errorIdFor("odometer")} ` : ""}${
                odometerHint ? `${odometerHintId} ` : ""
              }${uid}-odometer-distance`}
            />
            {errors.odometer &&
              (odometerMissing ? (
                <p id={errorIdFor("odometer")} className="mt-1 text-[11px] text-amber-400">
                  {errors.odometer}
                </p>
              ) : (
                renderError("odometer")
              ))}
            {odometerHint && (
              <p id={odometerHintId} className="mt-1 text-[11px] text-amber-400">
                {odometerHint}
              </p>
            )}
            <p id={`${uid}-odometer-distance`} className="mt-1 text-[11px] text-gray-400" aria-live="polite">
              {odometerDistanceText}
            </p>
          </div>
        ) : (
          <div>
            {renderLabel(
              "total_distance",
              "走行距離 (km)",
              <span className="block text-[10px] text-gray-600 font-normal">前回給油からの区間距離（トリップメーター）</span>
            )}
            <input
              id={idFor("total_distance")}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例: 412.5"
              value={draft.total_distance}
              disabled={inputsDisabled}
              onChange={(e) => setField("total_distance", e.target.value)}
              className={inputClass({ error: errors.total_distance, highlight: highlightFields?.total_distance })}
              {...ariaProps("total_distance")}
            />
            {renderError("total_distance")}
          </div>
        )}
        <div>
          <label htmlFor={`${uid}-price_per_unit`} className="text-xs text-gray-500 flex items-center gap-1 mb-1">
            単価 (円/L) <Lock className="w-3 h-3 opacity-50" aria-hidden="true" />
          </label>
          <input
            id={`${uid}-price_per_unit`}
            type="text"
            value={pricePerUnitDisplay != null ? formatPricePerUnit(pricePerUnitDisplay) : ""}
            readOnly
            tabIndex={-1}
            aria-readonly="true"
            className="w-full bg-gray-950/50 border border-gray-800 rounded-lg p-2 text-gray-500 font-mono focus:outline-none cursor-not-allowed"
          />
        </div>
      </div>
      <div>
        {renderLabel("gas_station", "ガソリンスタンド名")}
        <input
          id={idFor("gas_station")}
          type="text"
          value={draft.gas_station}
          maxLength={100}
          disabled={inputsDisabled}
          onChange={(e) => setField("gas_station", e.target.value)}
          className={`${inputClass({ highlight: highlightFields?.gas_station })} text-sm font-sans`}
        />
      </div>

      {/* 満タン給油（既定 on）。off は部分給油 */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id={`${uid}-is_full-label`} className="text-sm text-gray-300">
            満タン給油
          </p>
          <p id={`${uid}-is_full-hint`} className="text-[10px] text-gray-500">
            {draft.is_full ? "満タンまで給油した" : "部分給油として記録します（燃費は次の満タン給油でまとめて計算）"}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={draft.is_full}
          aria-labelledby={`${uid}-is_full-label`}
          aria-describedby={`${uid}-is_full-hint`}
          disabled={inputsDisabled}
          onClick={() => setField("is_full", !draft.is_full)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-60 disabled:cursor-not-allowed ${
            draft.is_full ? "bg-blue-600 border-blue-500" : "bg-gray-700 border-gray-600"
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
              draft.is_full ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* 詳細（記録漏れ・燃料種別・メモ） */}
      <div className="rounded-lg border border-gray-700/70">
        <button
          type="button"
          aria-expanded={showDetails}
          aria-controls={detailsId}
          onClick={() => setDetailsOpen((open) => !open)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-200 transition rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-semibold">詳細</span>
            {!showDetails && detailsSummary.length > 0 && (
              <span className="truncate text-[10px] text-gray-500">{detailsSummary.join("・")}</span>
            )}
          </span>
          <ChevronDown
            className={`w-4 h-4 flex-shrink-0 transition-transform ${showDetails ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <div id={detailsId} hidden={!showDetails} className="space-y-4 px-3 pb-3 pt-1">
          <div className="flex items-start gap-2">
            <input
              id={idFor("missed_previous")}
              type="checkbox"
              checked={draft.missed_previous}
              disabled={inputsDisabled}
              onChange={(e) => setField("missed_previous", e.target.checked)}
              aria-describedby={`${uid}-missed_previous-hint`}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-blue-500 disabled:opacity-60"
            />
            <div>
              <label htmlFor={idFor("missed_previous")} className="text-sm text-gray-300">
                前回の給油を記録し忘れた
              </label>
              <p id={`${uid}-missed_previous-hint`} className="text-[10px] text-gray-500">
                この給油までの区間は燃費の計算から外します
              </p>
            </div>
          </div>

          <div>
            {renderLabel("fuel_type", "燃料種別")}
            <select
              id={idFor("fuel_type")}
              value={draft.fuel_type ?? ""}
              disabled={inputsDisabled}
              onChange={(e) => setField("fuel_type", isFuelType(e.target.value) ? e.target.value : null)}
              className={`${inputClass({ highlight: highlightFields?.fuel_type })} text-sm font-sans`}
            >
              <option value="">未指定</option>
              {FUEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FUEL_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              {renderLabel("memo", "メモ（任意）")}
              <span
                id={`${uid}-memo-count`}
                className={`text-[10px] font-mono ${memoLength > MEMO_MAX_LENGTH ? "text-red-400" : "text-gray-500"}`}
              >
                {memoLength}/{MEMO_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id={idFor("memo")}
              value={draft.memo}
              rows={2}
              disabled={inputsDisabled}
              onChange={(e) => setField("memo", e.target.value)}
              aria-invalid={errors.memo ? true : undefined}
              aria-describedby={`${uid}-memo-count${errors.memo ? ` ${errorIdFor("memo")}` : ""}`}
              className={`${inputClass({ error: errors.memo })} text-sm font-sans resize-y`}
            />
            {renderError("memo")}
          </div>
        </div>
      </div>

      {/* ライブ表示: 燃費 */}
      <p className="text-xs text-gray-500" aria-live="polite">
        燃費:{" "}
        <span className="font-mono font-bold text-blue-300">
          {metrics.fuel_efficiency != null ? metrics.fuel_efficiency.toFixed(2) : "--.--"}
        </span>{" "}
        km/L
        {efficiencyNote && <span className="ml-1 text-amber-300/90">（{efficiencyNote}）</span>}
        {mergedRunCount > 0 && metrics.fuel_efficiency != null && (
          <span className="block mt-0.5 text-[10px] text-gray-500">{mergedRunNote(mergedRunCount)}</span>
        )}
      </p>

      {!canSave && saveHint && (
        <p className="text-[11px] text-amber-400" role="status">
          {saveHint}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold flex items-center justify-center gap-2 text-sm transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
        >
          <X className="w-4 h-4" aria-hidden="true" /> {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={saveDisabled}
          className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-900/50 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Save className="w-4 h-4" aria-hidden="true" />}
          {saving ? "保存中..." : saveLabel}
        </button>
      </div>
    </form>
  );
}
