import { useState } from "react";
import { Car, Bike, Settings } from "lucide-react";
import { Vehicle } from "@/lib/useVehicles";
import ManageVehiclesModal from "./ManageVehiclesModal";

interface VehicleSelectorProps {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onSelect: (id: string) => void;
  onAddVehicle: (name: string, type: "car" | "bike") => Promise<Vehicle>;
  onDeleteVehicle: (id: string) => Promise<void>;
  onUpdateVehicle: (id: string, name: string, type: "car" | "bike") => Promise<void>;
  className?: string;
}

export default function VehicleSelector({ 
  vehicles, 
  selectedVehicleId, 
  onSelect, 
  onAddVehicle, 
  onDeleteVehicle,
  onUpdateVehicle,
  className = "w-full mb-6"
}: VehicleSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {/* 車両タブグループ */}
        <div className="flex items-center gap-2 p-1.5 bg-gray-950/40 backdrop-blur-xl border border-gray-800/80 rounded-2xl shadow-inner">
          {vehicles.map(v => {
            const isSelected = v.id === selectedVehicleId;
            return (
              <button
                key={v.id}
                onClick={() => onSelect(v.id)}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300 flex-shrink-0 ${
                  isSelected 
                    ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-950 scale-[1.02]" 
                    : "text-gray-400 hover:text-white hover:bg-gray-900/50"
                }`}
              >
                {v.type === "bike" ? <Bike className="w-4 h-4 flex-shrink-0" /> : <Car className="w-4 h-4 flex-shrink-0" />}
                <span className="truncate max-w-[120px] md:max-w-[180px]">{v.name}</span>
              </button>
            );
          })}

          {/* 車両管理ボタン */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center p-2 rounded-xl text-gray-500 hover:text-blue-400 hover:bg-gray-900/50 transition border border-dashed border-gray-800 hover:border-blue-500/50 flex-shrink-0"
            title="車両を管理"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 車両管理モーダル */}
      <ManageVehiclesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        vehicles={vehicles}
        onAdd={async (name, type) => {
          return await onAddVehicle(name, type);
        }}
        onDelete={async (id) => {
          await onDeleteVehicle(id);
        }}
        onUpdate={onUpdateVehicle}
      />
    </div>
  );
}
