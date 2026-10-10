"use client";

import { useState } from "react";
import { Car, Bike, Settings } from "lucide-react";
import { Menu, MenuItem } from "./ui/Menu";
import type { Vehicle, VehicleSettings, VehicleType } from "@/lib/types";
import ManageVehiclesModal from "./ManageVehiclesModal";

/**
 * 車両の切り替えチップ「<車両名> ▾」（ヘッダー右側）。押すと車両の一覧（選択中にチェック）と「車両を管理」のメニューを開く。
 * 「車両を管理」は ManageVehiclesModal を開く。長い車両名は省略記号で切る。
 */
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
   * 車両一覧の読み込み中。true の間はチップの代わりにスケルトンを表示する。
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
  className = "",
}: VehicleSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  // 読み込み中はモーダルを描画しないので、開いていたら閉じておく（読み込み後に勝手に開き直さない）。
  // エフェクトではなく「レンダー中に state を調整する」React 推奨パターン
  if (loading && isModalOpen) {
    setIsModalOpen(false);
  }

  if (loading) {
    return (
      <div className={`flex min-w-0 justify-end ${className}`}>
        <div className="h-10 w-28 rounded-xl border border-border bg-surface animate-pulse" aria-hidden="true" />
      </div>
    );
  }

  const selected = vehicles.find(v => v.id === selectedVehicleId);
  const selectedName = selected?.name ?? "車両";

  return (
    <div className={`flex min-w-0 justify-end ${className}`}>
      <Menu
        label="車両の切り替え"
        trigger={selectedName}
        triggerAriaLabel={`車両: ${selectedName}`}
        triggerClassName="max-w-[min(240px,52vw)]"
        align="end"
      >
        {vehicles.map(v => (
          <MenuItem
            key={v.id}
            checked={v.id === selectedVehicleId}
            onSelect={() => onSelect(v.id)}
            icon={v.type === "bike" ? <Bike className="h-4 w-4" aria-hidden="true" /> : <Car className="h-4 w-4" aria-hidden="true" />}
          >
            {v.name}
          </MenuItem>
        ))}
        <MenuItem separated onSelect={() => setIsModalOpen(true)} icon={<Settings className="h-4 w-4" aria-hidden="true" />}>
          車両を管理
        </MenuItem>
      </Menu>

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
