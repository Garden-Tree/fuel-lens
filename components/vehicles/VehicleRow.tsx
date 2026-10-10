"use client";

import { Car, Bike, Pencil, Trash2, Check, Loader2 } from "lucide-react";
import { distanceModeOf, isFuelType } from "@/lib/fillChain";
import { FUEL_TYPE_LABELS, type Vehicle } from "@/lib/types";
import type { VehicleDraft } from "@/lib/useVehicleDraft";
import { IconButton, ListRow } from "@/components/ui";
import VehicleSettingsFields, {
  DISTANCE_MODE_SHORT_LABELS,
  VEHICLE_ROW_INPUT,
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

/** 車両一覧の 1 行（GroupedList の子）。通常表示と、その場での編集表示を切り替える */
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

  if (!isEditing) {
    const subtitle = `${DISTANCE_MODE_SHORT_LABELS[distanceModeOf(v)]}${
      isFuelType(v.default_fuel_type) ? `・${FUEL_TYPE_LABELS[v.default_fuel_type]}` : ""
    }`;
    return (
      <ListRow
        className={deleting ? "opacity-50" : ""}
        leading={
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 ${
              v.type === "bike" ? "text-warn" : "text-accent"
            }`}
          >
            {v.type === "bike" ? (
              <Bike className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <Car className="h-[18px] w-[18px]" aria-hidden="true" />
            )}
          </span>
        }
        title={v.name}
        subtitle={subtitle}
        trailing={
          <>
            <IconButton
              variant="ghost"
              onClick={() => onStartEdit(v)}
              disabled={readOnly || deleting}
              title="車両名・タイプ・設定を編集"
              aria-label={`「${v.name}」を編集`}
            >
              <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
            </IconButton>
            <IconButton
              variant="ghost"
              onClick={() => onDelete(v)}
              disabled={isLast || readOnly || deleteLocked}
              title={isLast ? "最低1台の車両は残す必要があります" : "この車両を削除"}
              aria-label={`「${v.name}」を削除`}
              className="hover:text-red-400"
            >
              {deleting ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
            </IconButton>
          </>
        }
      />
    );
  }

  /* 編集表示（その場で入力する行） */
  const nameId = `manage-vehicles-edit-${v.id}-name`;
  return (
    <div className="bg-surface-2/30">
      <div className="flex min-h-[52px] items-center gap-3 px-4 py-1.5">
        <label htmlFor={nameId} className="shrink-0 text-[15px] text-ink">
          名前
        </label>
        <input
          id={nameId}
          type="text"
          value={draft.name}
          onChange={(e) => draft.setName(e.target.value)}
          maxLength={20}
          required
          aria-label="車両の名前"
          disabled={saving}
          placeholder="車両の名前"
          className={VEHICLE_ROW_INPUT}
        />
      </div>
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-t border-line px-4 py-1.5">
        <span className="shrink-0 text-[15px] text-ink">タイプ</span>
        <VehicleTypeToggle value={draft.type} onChange={draft.setType} disabled={saving} className="w-48" />
      </div>
      <div className="border-t border-line">
        <VehicleSettingsFields
          idPrefix={`manage-vehicles-edit-${v.id}`}
          mode={draft.mode}
          fuelType={draft.fuelType}
          onModeChange={draft.setMode}
          onFuelTypeChange={draft.setFuelType}
          disabled={saving}
          switchNote={modeSwitchNote(distanceModeOf(v), draft.mode)}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-3 text-sm font-bold">
        <button
          type="button"
          onClick={onCancelEdit}
          disabled={saving}
          className="h-10 rounded-xl border border-border bg-surface px-4 text-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => onSave(v)}
          disabled={saving || !draft.isValid || readOnly}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-5 text-ground transition-colors hover:bg-[#5BB2FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground disabled:opacity-40 disabled:hover:bg-accent"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}{" "}
          保存
        </button>
      </div>
    </div>
  );
}
