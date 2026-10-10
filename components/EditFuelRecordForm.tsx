"use client";

import { useId, useState, type ReactNode, type Ref } from "react";
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
import { formatKm } from "@/lib/format";
import { FUEL_TYPES, FUEL_TYPE_LABELS } from "@/lib/types";
import { GroupedList, ValueRow } from "@/components/ui";

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

/** 行の中の入力欄（右寄せ・透明背景）。16px 以上・高さ 40px 以上を保つ */
const ROW_INPUT =
  "h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-right text-base text-ink placeholder:text-faint transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60";

function rowInputClass(opts: { error?: string | boolean; highlight?: boolean; numeric?: boolean }) {
  const tone = opts.error
    ? "ring-1 ring-red-500 focus-visible:ring-2 focus-visible:ring-red-500"
    : opts.highlight
      ? "bg-warn-bg ring-1 ring-warn/60"
      : "";
  return `${ROW_INPUT} ${opts.numeric ? "num" : ""} ${tone}`;
}

/** 設定画面のような 1 行（左にラベル、右に入力欄と単位）。補足・エラーは行の下に全幅で出す */
function FormRow({
  label,
  htmlFor,
  badge,
  hint,
  children,
  below,
}: {
  /** ラベル本文 */
  label: ReactNode;
  htmlFor: string;
  /** 「要確認」バッジ */
  badge?: boolean;
  /** ラベルの下に添える短い説明 */
  hint?: ReactNode;
  /** 右側（入力欄と単位） */
  children: ReactNode;
  /** 行の下に出す補足・エラー */
  below?: ReactNode;
}) {
  return (
    <div className="px-4 py-1.5">
      <div className="flex min-h-[46px] items-center gap-3">
        <label htmlFor={htmlFor} className="flex max-w-[55%] shrink-0 flex-col text-[15px] text-ink">
          <span className="flex items-center gap-1.5">
            {label}
            {badge && (
              <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn">要確認</span>
            )}
          </span>
          {hint && <span className="text-xs font-normal text-sub">{hint}</span>}
        </label>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</div>
      </div>
      {below}
    </div>
  );
}

function Unit({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="shrink-0 text-[13px] text-sub">
      {children}
    </span>
  );
}

/** スイッチ（role="switch"）。ラベルと説明は呼び出し側の id で結びつける */
function Switch({
  checked,
  onChange,
  disabled,
  labelId,
  hintId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelId: string;
  hintId: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors after:absolute after:-inset-2 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-accent" : "bg-surface-2 ring-1 ring-inset ring-border"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full shadow transition-transform ${
          checked ? "translate-x-6 bg-ground" : "translate-x-1 bg-sub"
        }`}
      />
    </button>
  );
}

/** スイッチの行（ラベルと説明が左、スイッチが右） */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-[15px] text-ink">
          {label}
        </p>
        <p id={`${id}-hint`} className="text-xs text-sub">
          {hint}
        </p>
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} labelId={`${id}-label`} hintId={`${id}-hint`} />
    </div>
  );
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

  const renderError = (field: DraftField) =>
    errors[field] ? (
      <p id={errorIdFor(field)} role="alert" className="pb-1 text-xs text-red-400">
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
      {/* 入力欄（設定画面のような行） */}
      <GroupedList>
        <FormRow label="給油日" htmlFor={idFor("date")} badge={highlightFields?.date} below={renderError("date")}>
          <input
            id={idFor("date")}
            ref={firstFieldRef}
            type="date"
            value={draft.date}
            disabled={inputsDisabled}
            onChange={(e) => setField("date", e.target.value)}
            className={`${rowInputClass({ error: errors.date, highlight: highlightFields?.date, numeric: true })} [color-scheme:dark]`}
            {...ariaProps("date")}
          />
        </FormRow>

        <FormRow
          label={
            <>
              給油量<span className="sr-only"> (L)</span>
            </>
          }
          htmlFor={idFor("fuel_amount")}
          badge={highlightFields?.fuel_amount}
          below={renderError("fuel_amount")}
        >
          <input
            id={idFor("fuel_amount")}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="例: 35.2"
            value={draft.fuel_amount}
            disabled={inputsDisabled}
            onChange={(e) => setField("fuel_amount", e.target.value)}
            className={rowInputClass({ error: errors.fuel_amount, highlight: highlightFields?.fuel_amount, numeric: true })}
            {...ariaProps("fuel_amount")}
          />
          <Unit>L</Unit>
        </FormRow>

        <FormRow
          label={
            <>
              支払総額<span className="sr-only"> (円)</span>
            </>
          }
          htmlFor={idFor("total_cost")}
          badge={highlightFields?.total_cost}
          below={renderError("total_cost")}
        >
          <input
            id={idFor("total_cost")}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="例: 5800"
            value={draft.total_cost}
            disabled={inputsDisabled}
            onChange={(e) => setField("total_cost", e.target.value)}
            className={rowInputClass({ error: errors.total_cost, highlight: highlightFields?.total_cost, numeric: true })}
            {...ariaProps("total_cost")}
          />
          <Unit>円</Unit>
        </FormRow>

        {distanceMode === "odometer" ? (
          <FormRow
            label="オドメーター"
            hint="給油時の積算距離"
            htmlFor={idFor("odometer")}
            badge={highlightFields?.odometer}
            below={
              <>
                {errors.odometer &&
                  (odometerMissing ? (
                    <p id={errorIdFor("odometer")} className="pb-1 text-xs text-warn">
                      {errors.odometer}
                    </p>
                  ) : (
                    renderError("odometer")
                  ))}
                {odometerHint && (
                  <p id={odometerHintId} className="pb-1 text-xs text-warn">
                    {odometerHint}
                  </p>
                )}
                <p id={`${uid}-odometer-distance`} className="pb-1 text-xs text-sub" aria-live="polite">
                  {odometerDistanceText}
                </p>
              </>
            }
          >
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
              className={rowInputClass({
                error: odometerMissing ? undefined : errors.odometer,
                highlight: odometerMissing || !!odometerHint || highlightFields?.odometer,
                numeric: true,
              })}
              aria-invalid={errors.odometer && !odometerMissing ? true : undefined}
              aria-describedby={`${errors.odometer ? `${errorIdFor("odometer")} ` : ""}${
                odometerHint ? `${odometerHintId} ` : ""
              }${uid}-odometer-distance`}
            />
            <Unit>km</Unit>
          </FormRow>
        ) : (
          <FormRow
            label="走行距離"
            hint="前回給油からの区間距離（トリップメーター）"
            htmlFor={idFor("total_distance")}
            badge={highlightFields?.total_distance}
            below={renderError("total_distance")}
          >
            <input
              id={idFor("total_distance")}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="例: 412.5"
              value={draft.total_distance}
              disabled={inputsDisabled}
              onChange={(e) => setField("total_distance", e.target.value)}
              className={rowInputClass({
                error: errors.total_distance,
                highlight: highlightFields?.total_distance,
                numeric: true,
              })}
              {...ariaProps("total_distance")}
            />
            <Unit>km</Unit>
          </FormRow>
        )}

        <FormRow
          label={
            <>
              単価<span className="sr-only"> (円/L)</span>
              <Lock className="h-3 w-3 text-faint" aria-hidden="true" />
            </>
          }
          htmlFor={`${uid}-price_per_unit`}
        >
          <input
            id={`${uid}-price_per_unit`}
            type="text"
            value={pricePerUnitDisplay != null ? formatPricePerUnit(pricePerUnitDisplay) : ""}
            readOnly
            tabIndex={-1}
            aria-readonly="true"
            className="num h-10 min-w-0 flex-1 cursor-not-allowed rounded-lg bg-transparent px-2 text-right text-base text-sub focus:outline-none"
          />
          <Unit>円/L</Unit>
        </FormRow>

        <FormRow label="ガソリンスタンド名" htmlFor={idFor("gas_station")} badge={highlightFields?.gas_station}>
          <input
            id={idFor("gas_station")}
            type="text"
            value={draft.gas_station}
            maxLength={100}
            disabled={inputsDisabled}
            onChange={(e) => setField("gas_station", e.target.value)}
            className={rowInputClass({ highlight: highlightFields?.gas_station })}
          />
        </FormRow>

        {/* 満タン給油（既定 on）。off は部分給油 */}
        <SwitchRow
          id={`${uid}-is_full`}
          label="満タン給油"
          hint={draft.is_full ? "満タンまで給油した" : "部分給油として記録します（燃費は次の満タン給油でまとめて計算）"}
          checked={draft.is_full}
          onChange={(next) => setField("is_full", next)}
          disabled={inputsDisabled}
        />
      </GroupedList>

      {/* 詳細（記録漏れ・燃料種別・メモ） */}
      <GroupedList>
        <div>
          <button
            type="button"
            aria-expanded={showDetails}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            className="flex min-h-[46px] w-full items-center justify-between gap-2 px-4 text-left text-[15px] text-ink transition-colors hover:bg-surface-2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span>詳細</span>
              {!showDetails && detailsSummary.length > 0 && (
                <span className="truncate text-xs text-sub">{detailsSummary.join("・")}</span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-faint transition-transform ${showDetails ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          <div id={detailsId} hidden={!showDetails} className="divide-y divide-line border-t border-line">
            <SwitchRow
              id={`${uid}-missed_previous`}
              label="前回の給油を記録し忘れた"
              hint="この給油までの区間は燃費の計算から外します"
              checked={draft.missed_previous}
              onChange={(next) => setField("missed_previous", next)}
              disabled={inputsDisabled}
            />

            <FormRow label="燃料種別" htmlFor={idFor("fuel_type")} badge={highlightFields?.fuel_type}>
              <select
                id={idFor("fuel_type")}
                value={draft.fuel_type ?? ""}
                disabled={inputsDisabled}
                onChange={(e) => setField("fuel_type", isFuelType(e.target.value) ? e.target.value : null)}
                className={`${rowInputClass({ highlight: highlightFields?.fuel_type })} cursor-pointer [color-scheme:dark]`}
              >
                <option value="">未指定</option>
                {FUEL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {FUEL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </FormRow>

            <div className="px-4 py-2.5">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label htmlFor={idFor("memo")} className="flex items-center gap-1.5 text-[15px] text-ink">
                  メモ（任意）
                  {highlightFields?.memo && (
                    <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn">要確認</span>
                  )}
                </label>
                <span
                  id={`${uid}-memo-count`}
                  className={`num text-xs ${memoLength > MEMO_MAX_LENGTH ? "text-red-400" : "text-sub"}`}
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
                className={`min-h-[72px] w-full resize-y rounded-xl border bg-ground p-3 text-base text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                  errors.memo ? "border-red-500" : "border-border"
                }`}
              />
              {errors.memo && (
                <p id={errorIdFor("memo")} role="alert" className="mt-1 text-xs text-red-400">
                  {errors.memo}
                </p>
              )}
            </div>
          </div>
        </div>
      </GroupedList>

      {/* ライブ表示: 区間距離・燃費 */}
      <div aria-live="polite">
        <GroupedList>
          <ValueRow
            label="区間距離"
            value={parsed.total_distance != null ? formatKm(parsed.total_distance) : "--"}
            unit=" km"
          />
          <ValueRow
            label="燃費"
            tone={metrics.fuel_efficiency != null ? "accent" : "sub"}
            value={metrics.fuel_efficiency != null ? metrics.fuel_efficiency.toFixed(2) : "--.--"}
            unit=" km/L"
          />
          {(efficiencyNote || (mergedRunCount > 0 && metrics.fuel_efficiency != null)) && (
            <div className="space-y-0.5 px-4 py-2 text-xs">
              {efficiencyNote && <p className="text-warn">（{efficiencyNote}）</p>}
              {mergedRunCount > 0 && metrics.fuel_efficiency != null && (
                <p className="text-sub">{mergedRunNote(mergedRunCount)}</p>
              )}
            </div>
          )}
        </GroupedList>
      </div>

      {!canSave && saveHint && (
        <p className="text-xs text-warn" role="status">
          {saveHint}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-bold text-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        >
          <X className="h-4 w-4" aria-hidden="true" /> {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={saveDisabled}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-ground transition-colors hover:bg-[#5BB2FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? "保存中..." : saveLabel}
        </button>
      </div>
    </form>
  );
}
