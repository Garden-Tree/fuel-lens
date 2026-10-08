"use client";

import { Plus, Loader2 } from "lucide-react";
import type { VehicleDraft } from "@/lib/useVehicleDraft";
import VehicleSettingsFields, { VehicleTypeToggle } from "./VehicleSettingsFields";

interface AddVehicleFormProps {
  draft: VehicleDraft;
  /** 追加処理中 */
  adding: boolean;
  /** 閲覧専用（クラウド障害中）。入力と追加を無効化する */
  readOnly: boolean;
  /** 送信時（名前が空・処理中・閲覧専用のガードは呼び出し側でも行う） */
  onSubmit: () => void;
}

/** 新しい車両・バイクの追加フォーム */
export default function AddVehicleForm({ draft, adding, readOnly, onSubmit }: AddVehicleFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4 flex-shrink-0"
    >
      <label htmlFor="manage-vehicles-new-name" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
        新しい車両・バイクの追加
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex gap-2">
          <input
            id="manage-vehicles-new-name"
            type="text"
            value={draft.name}
            onChange={(e) => draft.setName(e.target.value)}
            placeholder="例: サブカー、カブ など"
            maxLength={20}
            required
            disabled={adding || readOnly}
            className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition disabled:opacity-60"
          />
          <VehicleTypeToggle variant="add" value={draft.type} onChange={draft.setType} disabled={readOnly} />
        </div>
        <button
          type="submit"
          disabled={adding || !draft.isValid || readOnly}
          className="py-3 px-5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 font-bold text-sm text-white rounded-xl shadow-lg shadow-blue-950 transition disabled:opacity-50 flex-shrink-0 flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {adding ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="w-4 h-4" aria-hidden="true" />
          )}{" "}
          追加
        </button>
      </div>
      <VehicleSettingsFields
        idPrefix="manage-vehicles-new"
        mode={draft.mode}
        fuelType={draft.fuelType}
        onModeChange={draft.setMode}
        onFuelTypeChange={draft.setFuelType}
        disabled={adding || readOnly}
      />
    </form>
  );
}
