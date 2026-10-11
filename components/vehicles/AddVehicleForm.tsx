"use client";

import { Plus, Loader2 } from "lucide-react";
import type { VehicleDraft } from "@/lib/useVehicleDraft";
import { GroupedList, Section } from "@/components/ui";
import VehicleSettingsFields, { VEHICLE_ROW_INPUT, VehicleTypeToggle } from "./VehicleSettingsFields";

interface AddVehicleFormProps {
  draft: VehicleDraft;
  /** 追加処理中 */
  adding: boolean;
  /** 閲覧専用（クラウド障害中）。入力と追加を無効化する */
  readOnly: boolean;
  /** 送信時（名前が空・処理中・閲覧専用のガードは呼び出し側でも行う） */
  onSubmit: () => void;
}

/** 新しい車両・バイクの追加フォーム（独立したセクション） */
export default function AddVehicleForm({ draft, adding, readOnly, onSubmit }: AddVehicleFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
    >
      <Section title="車両・バイクの追加" headingLevel={4}>
        <GroupedList>
          <div className="flex min-h-[52px] items-center gap-3 px-4 py-1.5">
            <label htmlFor="manage-vehicles-new-name" className="shrink-0 text-[15px] text-ink">
              名前
            </label>
            <input
              id="manage-vehicles-new-name"
              type="text"
              value={draft.name}
              onChange={(e) => draft.setName(e.target.value)}
              placeholder="例: サブカー、カブ など"
              maxLength={20}
              required
              aria-label="新しい車両・バイクの名前"
              disabled={adding || readOnly}
              className={VEHICLE_ROW_INPUT}
            />
          </div>
          <div className="flex min-h-[52px] items-center justify-between gap-3 px-4 py-1.5">
            <span className="shrink-0 text-[15px] text-ink">タイプ</span>
            <VehicleTypeToggle
              value={draft.type}
              onChange={draft.setType}
              disabled={adding || readOnly}
              className="w-48"
            />
          </div>
          <VehicleSettingsFields
            idPrefix="manage-vehicles-new"
            mode={draft.mode}
            fuelType={draft.fuelType}
            onModeChange={draft.setMode}
            onFuelTypeChange={draft.setFuelType}
            disabled={adding || readOnly}
          />
        </GroupedList>
      </Section>
      <button
        type="submit"
        disabled={adding || !draft.isValid || readOnly}
        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-bold text-ground transition-colors hover:bg-[#5BB2FF] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
      >
        {adding ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}{" "}
        追加
      </button>
    </form>
  );
}
