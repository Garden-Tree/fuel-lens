import { useState } from "react";
import { Car, Bike, Plus, X } from "lucide-react";
import { Vehicle } from "@/lib/useVehicles";
import AddVehicleModal from "./AddVehicleModal";

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onSelect: (id: string) => void;
  onAddVehicle: (name: string, type: "car" | "bike") => Promise<Vehicle>;
  onDeleteVehicle?: (id: string) => Promise<void>; // ★追加: 削除ハンドラー
}

export default function VehicleSelector({ vehicles, selectedVehicleId, onSelect, onAddVehicle, onDeleteVehicle }: VehicleSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="w-full mb-6">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {/* 車両タブグループ */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 backdrop-blur-xl border border-gray-800/80 rounded-2xl shadow-inner">
          {vehicles.map(v => {
            const isSelected = v.id === selectedVehicleId;
            return (
              <div key={v.id} className="relative flex items-center">
                <button
                  onClick={() => onSelect(v.id)}
                  className={`flex items-center gap-2 py-2 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex-shrink-0 ${
                    isSelected 
                      ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-950 scale-[1.02] pl-4 pr-8" 
                      : "text-gray-400 hover:text-white hover:bg-gray-900/50 px-4"
                  }`}
                >
                  {v.type === "bike" ? <Bike className="w-4 h-4 flex-shrink-0" /> : <Car className="w-4 h-4 flex-shrink-0" />}
                  <span className="truncate max-w-[120px] md:max-w-[180px]">{v.name}</span>
                </button>

                {/* 選択中で、かつ2台以上登録されている場合のみ削除ボタンを表示 */}
                {isSelected && vehicles.length > 1 && onDeleteVehicle && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`「${v.name}」を削除しますか？\n（Supabase設定によっては関連する給油記録も同時に削除されます）`)) {
                        try {
                          await onDeleteVehicle(v.id);
                        } catch {
                          alert("削除に失敗しました。");
                        }
                      }
                    }}
                    className="absolute right-1.5 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition duration-200"
                    title="この車両を削除"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* 車両追加ボタン */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center p-2 rounded-xl text-gray-500 hover:text-blue-400 hover:bg-gray-900/50 transition border border-dashed border-gray-800 hover:border-blue-500/50 flex-shrink-0"
            title="車両を追加"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 車両追加モーダル */}
      <AddVehicleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={async (name, type) => {
          await onAddVehicle(name, type);
        }}
      />
    </div>
  );
}
