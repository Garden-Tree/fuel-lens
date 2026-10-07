"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ScanLine } from "lucide-react";
import type { AnalyzeSuccessResponse, ConfidenceField } from "@/lib/analyze";
import {
  useRecordForm,
  todayLocalISO,
  visibleScanWarnings,
  type DraftField,
  type RecordFormContext,
  type RecordInput,
} from "@/lib/useRecordForm";
import { distanceModeOf } from "@/lib/fillChain";
import type { Vehicle } from "@/lib/useVehicles";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { formatPricePerUnit } from "@/lib/calculations";
import EditFuelRecordForm from "./EditFuelRecordForm";

/** この値未満の確信度は「要確認」として強調する */
const LOW_CONFIDENCE = 0.6;

interface Props {
  /** /api/analyze の成功レスポンス */
  result: AnalyzeSuccessResponse;
  /** 解析に使った画像（data URL）。サムネイルとして表示する */
  imageSrc: string | null;
  /** 記録先の車両（距離の入力方式・既定の燃料種別）。省略はトリップモード */
  vehicle?: Pick<Vehicle, "distance_mode" | "default_fuel_type"> | null;
  /** 連鎖計算で直前になる記録のオドメーター（オドメーターモードの「前回から ○○ km」に使う） */
  previousOdometer?: number | null;
  /** 確認シートで日付を直したときに、その日付での前回のオドメーターを返す（lib/fillChain.ts の previousOdometer） */
  getPreviousOdometer?: RecordFormContext["getPreviousOdometer"];
  /** 連鎖計算で直前に開いている run（部分給油の合算。lib/fillChain.ts の openRunBefore） */
  openRun?: RecordFormContext["openRun"];
  /** 確認シートで日付を直したときに、その日付での openRun を返す */
  getOpenRun?: RecordFormContext["getOpenRun"];
  /** 閲覧専用（クラウド障害中）なら保存を無効化する */
  readOnly?: boolean;
  /**
   * 「保存」押下時。重複確認・addRecord・トースト通知は呼び出し側が行う。
   * 失敗時は reject（throw）すればシートは開いたままになる。
   */
  onSave: (record: RecordInput) => Promise<void>;
  /** 「破棄」・Escape・背景クリック時 */
  onDiscard: () => void;
}

/**
 * スキャン結果の確認シート。
 * OCR 結果をフォームに流し込み、ユーザーが確認・修正してから保存する。
 * 読み取れなかった項目・確信度の低い項目は「要確認」として強調する。
 */
export default function ScanReviewSheet({
  result,
  imageSrc,
  vehicle = null,
  previousOdometer = null,
  getPreviousOdometer,
  openRun = null,
  getOpenRun,
  readOnly = false,
  onSave,
  onDiscard,
}: Props) {
  const mode = distanceModeOf(vehicle);
  // オドメーターモードでは読み取ったオドメーターを主入力に入れる（トリップモードでは参考表示のみで保存しない）。
  // 燃料種別が読めなければ車両の既定値になる（useRecordForm の recordToDraft）。
  // スキャン結果はオドメーター未入力でも保存できる（odometerOptional。メーターが写っていない・読めないことがあるため）。
  // 未入力なら注意を出し、区間距離は null のまま保存する（連鎖計算では持ち越し行として次の区間にまとめて計算される）
  const form = useRecordForm(
    {
      date: result.date ?? todayLocalISO(),
      fuel_amount: result.fuel_amount,
      total_cost: result.total_cost,
      total_distance: result.total_distance,
      odometer: mode === "odometer" ? result.odometer : null,
      gas_station: result.gas_station,
      price_per_unit: result.price_per_unit,
      fuel_type: result.fuel_type,
    },
    { vehicle, previousOdometer, getPreviousOdometer, openRun, getOpenRun, odometerOptional: true }
  );

  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = "scan-review-title";

  // 要確認: 読み取れなかった（null）または確信度が低い項目
  const highlightFields = useMemo(() => {
    const conf = result.confidence ?? {};
    const low = (field: DraftField & ConfidenceField, value: unknown) => {
      const c = conf[field];
      return value == null || (typeof c === "number" && c < LOW_CONFIDENCE);
    };
    const h: Partial<Record<DraftField, boolean>> = {};
    if (low("date", result.date)) h.date = true;
    if (low("fuel_amount", result.fuel_amount)) h.fuel_amount = true;
    if (low("total_cost", result.total_cost)) h.total_cost = true;
    // 区間距離・オドメーターは、その方式で画面に出す欄だけを強調する
    if (mode === "trip" && low("total_distance", result.total_distance)) h.total_distance = true;
    if (mode === "odometer" && low("odometer", result.odometer)) h.odometer = true;
    if (low("gas_station", result.gas_station)) h.gas_station = true;
    return h;
  }, [result, mode]);

  // オドメーターモードでは、区間距離（トリップメーター）の読み取り値についての注意は出さない（保存に使わないため）
  const warnings = visibleScanWarnings(result.warnings, mode);

  // 先頭の入力欄へフォーカスし、シート内でフォーカスを循環させる（背面の車両タブ等へ Tab で出られないように）。
  // 閉じたら開く前にフォーカスされていた要素へ戻す
  useFocusTrap(panelRef, { active: true, initialFocusRef: firstFieldRef });

  // Escape で破棄（保存中は無視）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        e.stopPropagation();
        onDiscard();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDiscard, saving]);

  // 背面のスクロールを止める
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSave = async () => {
    if (saving || readOnly || !form.isValid || !form.hasCoreValue) return;
    setSaving(true);
    try {
      await onSave(form.toRecord());
    } catch {
      // エラーのトースト表示は呼び出し側で行う。シートは開いたまま再試行できるようにする
    } finally {
      setSaving(false);
    }
  };

  const { metrics } = form;

  // 背景クリックで破棄（パネル内から背景へドラッグして離した場合は閉じない）
  const backdropHandlers = useBackdropClose(onDiscard, !saving);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      {...backdropHandlers}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-gray-700 bg-gray-900 shadow-2xl"
      >
        <div className="p-5 space-y-4">
          {/* ヘッダー */}
          <div className="flex items-start gap-3">
            {imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt="解析した画像のサムネイル"
                className="w-16 h-16 rounded-xl object-cover border border-gray-700 flex-shrink-0"
                draggable={false}
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                <ScanLine className="w-6 h-6 text-gray-500" aria-hidden="true" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-base font-bold text-white">
                読み取り結果の確認
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                内容を確認・修正してから保存してください。
                {Object.keys(highlightFields).length > 0 && (
                  <>
                    <span className="text-amber-400 font-semibold">「要確認」</span>
                    の項目は読み取れなかったか、確信度が低い項目です。
                  </>
                )}
              </p>
              {mode === "trip" && result.odometer != null && (
                <p className="text-[11px] text-gray-500 mt-1 font-mono">
                  ODO: {result.odometer.toLocaleString()} km（参考）
                </p>
              )}
            </div>
          </div>

          {/* 妥当性チェックの注意 */}
          {warnings.length > 0 && (
            <div
              role="alert"
              className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-200"
            >
              <p className="flex items-center gap-1.5 font-bold text-amber-300 mb-1">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" /> 確認が必要な項目があります
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ライブ指標 */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-black/30 border border-white/5 p-3" aria-live="polite">
            <div>
              <p className="text-[10px] text-gray-500 uppercase">燃費</p>
              <p className="font-mono text-xl font-bold text-white">
                {metrics.fuel_efficiency != null ? metrics.fuel_efficiency.toFixed(2) : "--.--"}
                <span className="ml-1 text-xs text-blue-400">km/L</span>
              </p>
              {form.efficiencyNote && <p className="text-[10px] text-amber-300/90">{form.efficiencyNote}</p>}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase">単価</p>
              <p className="font-mono text-xl font-bold text-white">
                {form.pricePerUnitDisplay != null ? `¥${formatPricePerUnit(form.pricePerUnitDisplay)}` : "---"}
                <span className="ml-1 text-xs text-gray-400">/L</span>
              </p>
            </div>
          </div>

          {readOnly && (
            <p className="text-[11px] text-amber-400" role="status">
              閲覧専用（クラウド接続待ち）のため、現在は保存できません。
            </p>
          )}

          <EditFuelRecordForm
            form={form}
            onCancel={onDiscard}
            onSave={handleSave}
            saving={saving}
            disabled={readOnly}
            canSave={form.hasCoreValue}
            saveHint="保存するには給油量または支払総額を入力してください"
            saveLabel="保存"
            cancelLabel="破棄"
            highlightFields={highlightFields}
            firstFieldRef={firstFieldRef}
          />
        </div>
      </div>
    </div>
  );
}
