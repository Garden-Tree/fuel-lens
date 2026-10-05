"use client";

import { useId, type Ref } from "react";
import { X, Save, Lock, Loader2 } from "lucide-react";
import type { DraftField, UseRecordFormReturn } from "@/lib/useRecordForm";
import { formatPricePerUnit } from "@/lib/calculations";

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
  const { draft, setField, errors, metrics, pricePerUnitDisplay } = form;
  const idFor = (field: DraftField) => `${uid}-${field}`;
  const errorIdFor = (field: DraftField) => `${uid}-${field}-error`;
  const inputsDisabled = disabled || saving;
  const saveDisabled = inputsDisabled || !form.isValid || !canSave;

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

      {/* ライブ表示: 燃費 */}
      <p className="text-xs text-gray-500" aria-live="polite">
        燃費:{" "}
        <span className="font-mono font-bold text-blue-300">
          {metrics.fuel_efficiency != null ? metrics.fuel_efficiency.toFixed(2) : "--.--"}
        </span>{" "}
        km/L
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
