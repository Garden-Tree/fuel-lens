"use client";

import { useState } from "react";
import { Car, Bike, Settings } from "lucide-react";
import type { Vehicle, VehicleSettings, VehicleType } from "@/lib/types";
import ManageVehiclesModal from "./ManageVehiclesModal";

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onSelect: (id: string) => void;
  onAddVehicle: (name: string, type: VehicleType, settings?: VehicleSettings) => Promise<Vehicle>;
  onDeleteVehicle: (id: string) => Promise<void>;
  onUpdateVehicle: (id: string, name: string, type: VehicleType, settings?: VehicleSettings) => Promise<void>;
  /** 閲覧専用（クラウド障害中）。車両の追加・編集・削除を無効化する（切り替えは可能） */
  readOnly?: boolean;
  /**
   * 車両一覧の読み込み中。true の間はタブの代わりにスケルトンを表示する。
   * 読み込みが始まったら開いている「車両を管理」モーダルは閉じる（以前の「スケルトンと差し替えて再マウント」と同じ動作）。
   */
  loading?: boolean;
  className?: string;
}

export default function VehicleSelector({
  vehicles,
  selectedVehicleId,
  onSelect,
  onAddVehicle,
  onDeleteVehicle,
  onUpdateVehicle,
  readOnly = false,
  loading = false,
  className = "w-full mb-6"
}: VehicleSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // 読み込み中はモーダルを描画しないので、開いていたら閉じておく（読み込み後に勝手に開き直さない）。
  // エフェクトではなく「レンダー中に state を調整する」React 推奨パターン
  if (loading && isModalOpen) {
    setIsModalOpen(false);
  }

  if (loading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 border border-gray-800/80 rounded-2xl shadow-inner">
            <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
            <div className="w-20 h-8 md:h-[36px] bg-gray-850 rounded-xl animate-pulse" />
            <div className="w-[34px] h-[34px] bg-gray-850 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
        {/* 車両タブグループ */}
        <div
          role="tablist"
          aria-label="車両の切り替え"
          className="flex items-center gap-2 p-1.5 bg-gray-950/40 backdrop-blur-xl border border-gray-800/80 rounded-2xl shadow-inner"
        >
          {vehicles.map(v => {
            const isSelected = v.id === selectedVehicleId;
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelect(v.id)}
                className={`flex items-center gap-2 py-2 px-4 min-h-10 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-950 scale-[1.02]"
                    : "text-gray-400 hover:text-white hover:bg-gray-900/50"
                }`}
              >
                {v.type === "bike" ? <Bike className="w-4 h-4 flex-shrink-0" aria-hidden="true" /> : <Car className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
                <span className="truncate max-w-[120px] md:max-w-[180px]">{v.name}</span>
              </button>
            );
          })}

          {/* 車両管理ボタン */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center p-2 min-w-10 min-h-10 rounded-xl text-gray-500 hover:text-blue-400 hover:bg-gray-900/50 transition border border-dashed border-gray-800 hover:border-blue-500/50 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            title="車両を管理"
            aria-label="車両を管理"
            aria-haspopup="dialog"
            aria-expanded={isModalOpen}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 車両管理モーダル */}
      <ManageVehiclesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vehicles={vehicles}
        onAdd={async (name, type, settings) => {
          return await onAddVehicle(name, type, settings);
        }}
        onDelete={async (id) => {
          await onDeleteVehicle(id);
        }}
        onUpdate={onUpdateVehicle}
        readOnly={readOnly}
      />
    </div>
  );
}
