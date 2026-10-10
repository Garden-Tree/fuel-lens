"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, ScanLine } from "lucide-react";
import type { AnalyzeSuccessResponse, ConfidenceField } from "@/lib/analyze";
import { useRecordForm, visibleScanWarnings, type DraftField } from "@/lib/useRecordForm";
import { distanceModeOf } from "@/lib/fillChain";
import { todayLocalISO } from "@/lib/dates";
import type { FuelRecord, RecordInput, Vehicle } from "@/lib/types";
import { formatKm } from "@/lib/format";
import EditFuelRecordForm from "./EditFuelRecordForm";
import Modal from "./Modal";

/** 読み取った値の 1 項目（大きな等幅数字）。警告があるときは「要確認」バッジを付ける */
function BigValue({
  label,
  value,
  unit,
  tone = "default",
  warn = false,
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "money";
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1 text-xs text-sub">
        {label}
        {warn && <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[10px] font-bold text-warn">要確認</span>}
      </p>
      <p className="mt-1 truncate">
        <span className={`num text-xl font-bold ${tone === "money" ? "text-money" : "text-ink"}`}>{value}</span>
        {unit && <span className="ml-0.5 text-[13px] text-sub">{unit}</span>}
      </p>
    </div>
  );
}

/** この値未満の確信度は「要確認」として強調する */
const LOW_CONFIDENCE = 0.6;

interface Props {
  /** /api/analyze の成功レスポンス */
  result: AnalyzeSuccessResponse;
  /** 解析に使った画像（data URL）。サムネイルとして表示する */
  imageSrc: string | null;
  /** 記録先の車両（距離の入力方式・既定の燃料種別）。省略はトリップモード */
  vehicle?: Pick<Vehicle, "distance_mode" | "default_fuel_type"> | null;
  /**
   * 記録先の車両の記録（useVehicleScope の records）。燃費・区間距離のプレビューは、読み取り結果をここに差し込んだ連鎖計算の結果
   * （lib/fillChain.ts の previewInChain。前回のオドメーター・部分給油の合算・同じ日付の中の位置も含む）。省略は記録なし
   */
  records?: readonly FuelRecord[];
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
  records,
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
    { vehicle, records, odometerOptional: true },
  );

  const [saving, setSaving] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
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

  // 警告が指している項目に「要確認」を付ける（燃費が高すぎる = 区間距離か給油量の読み違い）
  const warnedFields = new Set<"distance" | "fuel">();
  for (const w of warnings) {
    if (w.code === "FUEL_TOO_LARGE") warnedFields.add("fuel");
    else if (w.code === "DISTANCE_TOO_LARGE") warnedFields.add("distance");
    else {
      warnedFields.add("distance");
      warnedFields.add("fuel");
    }
  }
  const { parsed } = form;
  const distanceValue = mode === "odometer" ? parsed.odometer : parsed.total_distance;

  return (
    // フォーカストラップ・Escape・背景クリック・本文スクロールのロックは Modal に任せる（保存中は閉じない）
    <Modal
      open
      onClose={onDiscard}
      title="読み取り結果の確認"
      labelledBy={titleId}
      disableClose={saving}
      lockBodyScroll
      initialFocusRef={firstFieldRef}
      backdropClassName="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      panelClassName="w-full max-w-lg max-h-[92dvh] sm:max-h-[92vh] overflow-y-auto rounded-t-hero sm:rounded-hero border border-line bg-ground shadow-2xl shadow-black/50"
    >
      <div className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
        {/* シートのつまみ（スマホ） */}
        <div className="mx-auto -mt-1 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />

        {/* ヘッダー */}
        <div className="flex items-start gap-3">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt="解析した画像のサムネイル"
              className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover"
              draggable={false}
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface">
              <ScanLine className="h-6 w-6 text-faint" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-xl font-bold text-ink">
              読み取り結果の確認
            </h2>
            <p className="mt-0.5 text-xs text-sub">
              内容を確認・修正してから保存してください。
              {Object.keys(highlightFields).length > 0 && (
                <>
                  <span className="font-semibold text-warn">「要確認」</span>
                  の項目は読み取れなかったか、確信度が低い項目です。
                </>
              )}
            </p>
            {mode === "trip" && result.odometer != null && (
              <p className="mt-1 text-[11px] text-sub">
                ODO: <span className="num">{result.odometer.toLocaleString()}</span> km（参考）
              </p>
            )}
          </div>
        </div>

        {/* 読み取った値（編集すると追従する） */}
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-surface p-4" aria-live="polite">
          <BigValue
            label={mode === "odometer" ? "オドメーター" : "区間距離"}
            value={distanceValue != null ? formatKm(distanceValue) : "--"}
            unit="km"
            warn={warnedFields.has("distance")}
          />
          <BigValue
            label="給油量"
            value={parsed.fuel_amount != null ? formatKm(parsed.fuel_amount) : "--"}
            unit="L"
            warn={warnedFields.has("fuel")}
          />
          <BigValue
            label="支払総額"
            value={parsed.total_cost != null ? `¥${parsed.total_cost.toLocaleString("ja-JP")}` : "--"}
            tone="money"
          />
        </div>

        {/* 妥当性チェックの注意 */}
        {warnings.length > 0 && (
          <div role="alert" className="rounded-2xl border border-warn/40 bg-warn-bg p-3 text-xs text-warn">
            <p className="mb-1 flex items-center gap-1.5 font-bold">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" /> 確認が必要な項目があります
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {warnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </div>
        )}

        {readOnly && (
          <p className="text-xs text-warn" role="status">
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
    </Modal>
  );
}
