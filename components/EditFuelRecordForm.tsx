import { FuelRecord } from "@/lib/useFuelRecords";
import { X, Save, Lock } from "lucide-react";

interface Props {
  editForm: Partial<FuelRecord>;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>, field: keyof FuelRecord) => void;
  cancelEditing: () => void;
  saveEditing: () => void;
}

export default function EditFuelRecordForm({ editForm, handleInputChange, cancelEditing, saveEditing }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">給油量 (L)</label>
          <input 
            type="number" 
            value={editForm.fuel_amount || ""} 
            onChange={(e) => handleInputChange(e, "fuel_amount")}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">支払総額 (円)</label>
          <input 
            type="number" 
            value={editForm.total_cost || ""} 
            onChange={(e) => handleInputChange(e, "total_cost")}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none transition"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">走行距離 (km)</label>
          <input 
            type="number" 
            value={editForm.total_distance || ""} 
            onChange={(e) => handleInputChange(e, "total_distance")}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white font-mono focus:border-blue-500 outline-none transition"
          />
        </div>
        <div className="relative">
          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
             単価 (円/L) <Lock className="w-3 h-3 opacity-50"/>
          </label>
          <input 
            type="number" 
            value={editForm.price_per_unit || ""} 
            readOnly 
            className="w-full bg-gray-950/50 border border-gray-800 rounded-lg p-2 text-gray-500 font-mono focus:outline-none cursor-not-allowed"
          />
        </div>
      </div>
      <div>
         <label className="text-xs text-gray-500 block mb-1">ガソリンスタンド名</label>
         <input 
            type="text" 
            value={editForm.gas_station || ""} 
            onChange={(e) => handleInputChange(e, "gas_station")}
            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white text-sm focus:border-blue-500 outline-none transition"
          />
      </div>
      <div className="flex gap-3 pt-2">
        <button 
          onClick={cancelEditing} 
          className="flex-1 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold flex items-center justify-center gap-2 text-sm transition"
        >
          <X className="w-4 h-4" /> キャンセル
        </button>
        <button 
          onClick={saveEditing} 
          className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-900/50 transition"
        >
          <Save className="w-4 h-4" /> 保存
        </button>
      </div>
    </div>
  );
}
