"use client";

import type { ReactNode } from "react";
import { Calculator, Calendar, Edit2, Fuel } from "lucide-react";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import RecordBadges from "@/components/RecordBadges";
import RecordStats from "@/components/RecordStats";
import { efficiencyNullReason } from "@/lib/format";
import type { UseRecordFormReturn } from "@/lib/useRecordForm";
import type { DistanceMode, FuelRecord } from "@/lib/types";

/** 右カラムのカードの見出し行（「Latest Record」など + 右側の操作）と外枠 */
export function RecordCardFrame({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-8 w-full">
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Calculator className="w-4 h-4" /> {label}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

/** カード本体。フォームを開いている間は青枠で強調する */
export function RecordCardBody({ editing, children }: { editing: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border transition-colors duration-300 w-full ${editing ? "bg-gray-800 border-blue-500 ring-1 ring-blue-500" : "bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700"}`}
    >
      {children}
    </div>
  );
}

export type RecordFormPanelProps = {
  title: string;
  form: UseRecordFormReturn;
  saving: boolean;
  readOnly: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
};

/** カード内の入力フォーム（手動入力・最新記録の編集） */
export function RecordFormPanel({ title, form, saving, readOnly, canSave, onCancel, onSave }: RecordFormPanelProps) {
  return (
    <div className="p-5">
      <h3 className="text-sm font-bold text-gray-300 mb-4">{title}</h3>
      <EditFuelRecordForm
        form={form}
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        disabled={readOnly}
        canSave={canSave}
        saveHint="保存するには給油量または支払総額を入力してください"
      />
    </div>
  );
}

export type LatestRecordCardProps = {
  /** 表示する記録（スキャン・手動入力の直後はその記録、それ以外は最新の記録）。無ければ空の案内 */
  record: FuelRecord | null | undefined;
  /** record がスキャンで保存した直後の記録か（見出しを「Scanned Result」にする） */
  scanned: boolean;
  distanceMode: DistanceMode;
  readOnly: boolean;
  /** 編集フォームを開いているか */
  isEditing: boolean;
  form: UseRecordFormReturn;
  saving: boolean;
  onEdit: (record: FuelRecord) => void;
  onCancel: () => void;
  onSave: () => void;
};

/** メイン画面右カラムの最新記録カード（表示 / その場で編集 / 記録なしの案内） */
export default function LatestRecordCard({
  record,
  scanned,
  distanceMode,
  readOnly,
  isEditing,
  form,
  saving,
  onEdit,
  onCancel,
  onSave,
}: LatestRecordCardProps) {
  const label = record && scanned ? "Scanned Result" : "Latest Record";
  const action = record && !isEditing && (
    <button
      type="button"
      onClick={() => onEdit(record)}
      disabled={readOnly}
      className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Edit2 className="w-3 h-3" aria-hidden="true" /> 編集
    </button>
  );

  return (
    <RecordCardFrame label={label} action={action}>
      {record ? (
        <RecordCardBody editing={isEditing}>
          {isEditing ? (
            <RecordFormPanel
              title="給油記録の編集"
              form={form}
              saving={saving}
              readOnly={readOnly}
              canSave
              onCancel={onCancel}
              onSave={onSave}
            />
          ) : (
            /* 表示モード */
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {record.date || "日付不明"}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white font-mono tracking-tighter">
                      {record.fuel_efficiency ? record.fuel_efficiency.toFixed(2) : "--.--"}
                    </span>
                    <span className="text-sm font-bold text-blue-500">km/L</span>
                  </div>
                  {efficiencyNullReason(record) && (
                    <p className="text-[11px] text-gray-500 mt-0.5">燃費: {efficiencyNullReason(record)}</p>
                  )}
                  <RecordBadges record={record} className="mt-2" />
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-400 font-mono">¥{record.total_cost?.toLocaleString() || "---"}</p>
                  <p className="text-xs text-gray-500">Total Cost</p>
                </div>
              </div>

              <RecordStats record={record} distanceMode={distanceMode} variant="card" />
            </div>
          )}
        </RecordCardBody>
      ) : (
        <div className="bg-gray-900/30 border border-gray-800/80 rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[220px] w-full">
          <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center mb-3">
            <Fuel className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm font-bold text-gray-300 mb-1">給油記録がまだありません</p>
          <p className="text-xs text-gray-500 max-w-[280px] leading-relaxed">
            レシートやメーターの写真をスキャンするか、過去の記録を入力して最初の記録を作成しましょう！
          </p>
        </div>
      )}
    </RecordCardFrame>
  );
}
