"use client";

import { Car, Bike, Edit2, Trash2, Check, Loader2 } from "lucide-react";
import { distanceModeOf, isFuelType } from "@/lib/fillChain";
import { FUEL_TYPE_LABELS, type Vehicle } from "@/lib/types";
import type { VehicleDraft } from "@/lib/useVehicleDraft";
import VehicleSettingsFields, {
  DISTANCE_MODE_SHORT_LABELS,
  VehicleTypeToggle,
  modeSwitchNote,
} from "./VehicleSettingsFields";

/**
 * 車両削除の確認文。
 * 既定車両（先頭）には未分類の記録も表示されており、useVehicles.deleteVehicle はそれらも削除する。
 */
export function deleteConfirmMessage(name: string, isDefault: boolean): string {
  const detail = isDefault
    ? "（関連する給油記録と、この車両に表示されている未分類の記録も削除されます）"
    : "（関連する給油記録も削除されます）";
  return `「${name}」を削除しますか？\n${detail}`;
}

interface VehicleRowProps {
  vehicle: Vehicle;
  /** 登録済みの車両数。1 台だけのときは削除ボタンを無効にする（最低 1 台は残す） */
  vehicleCount: number;
  /** この行を編集中か */
  isEditing: boolean;
  /** 編集中の下書き（isEditing のときだけ使う） */
  draft: VehicleDraft;
  /** 閲覧専用（クラウド障害中）。編集・削除を無効化する */
  readOnly: boolean;
  /** この行の保存中 */
  saving: boolean;
  /** この行の削除中（確認ダイアログ表示中を含む） */
  deleting: boolean;
  /** いずれかの行を削除中（二重クリック防止のため全行の削除ボタンを無効にする） */
  deleteLocked: boolean;
  onStartEdit: (vehicle: Vehicle) => void;
  onCancelEdit: () => void;
  onSave: (vehicle: Vehicle) => void;
  onDelete: (vehicle: Vehicle) => void;
}

/** 車両一覧の 1 行。通常表示と、その場での編集表示を切り替える */
export default function VehicleRow({
  vehicle: v,
  vehicleCount,
  isEditing,
  draft,
  readOnly,
  saving,
  deleting,
  deleteLocked,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: VehicleRowProps) {
  const isLast = vehicleCount <= 1;
  return (
    <div
      className={`p-3 rounded-2xl border transition-all duration-300 ${
        isEditing
          ? "bg-gray-950 border-blue-500/50 shadow-md shadow-blue-950/20"
          : "bg-gray-950/50 border-gray-800/80 hover:border-gray-700/60"
      } ${deleting ? "opacity-50" : ""}`}
    >
      {isEditing ? (
        /* 編集表示 */
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => draft.setName(e.target.value)}
              maxLength={20}
              required
              aria-label="車両の名前"
              disabled={saving}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition"
              placeholder="車両の名前"
            />
            <VehicleTypeToggle variant="edit" value={draft.type} onChange={draft.setType} />
          </div>
          <VehicleSettingsFields
            idPrefix={`manage-vehicles-edit-${v.id}`}
            mode={draft.mode}
            fuelType={draft.fuelType}
            onModeChange={draft.setMode}
            onFuelTypeChange={draft.setFuelType}
            disabled={saving}
            switchNote={modeSwitchNote(distanceModeOf(v), draft.mode)}
          />
          <div className="flex justify-end gap-2 text-xs font-bold pt-1">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={saving}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => onSave(v)}
              disabled={saving || !draft.isValid || readOnly}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition flex items-center gap-1 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              )}{" "}
              保存
            </button>
          </div>
        </div>
      ) : (
        /* 通常表示 */
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl bg-gray-900 border border-gray-800/80 ${v.type === "bike" ? "text-amber-500" : "text-blue-500"}`}
            >
              {v.type === "bike" ? (
                <Bike className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Car className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-semibold text-white truncate">{v.name}</span>
              <span className="block text-[10px] text-gray-500">
                {DISTANCE_MODE_SHORT_LABELS[distanceModeOf(v)]}
                {isFuelType(v.default_fuel_type) ? `・${FUEL_TYPE_LABELS[v.default_fuel_type]}` : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onStartEdit(v)}
              disabled={readOnly || deleting}
              className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-900 transition disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              title="車両名・タイプ・設定を編集"
              aria-label={`「${v.name}」を編集`}
            >
              <Edit2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(v)}
              disabled={isLast || readOnly || deleteLocked}
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-gray-900 transition disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              title={isLast ? "最低1台の車両は残す必要があります" : "この車両を削除"}
              aria-label={`「${v.name}」を削除`}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
