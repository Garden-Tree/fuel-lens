import { useState } from "react";
import { X, Plus, Car, Bike } from "lucide-react";

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string, type: "car" | "bike") => Promise<void>;
}

export default function AddVehicleModal({ isOpen, onClose, onAdd }: AddVehicleModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"car" | "bike">("car");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      await onAdd(name.trim(), type);
      setName("");
      setType("car");
      onClose();
    } catch (err) {
      console.error(err);
      alert("車両の登録に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-6 overflow-hidden">
        {/* 背景の装飾光 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-500" /> 車両・バイクを追加
          </h3>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              車両の名前
            </label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="例: メインカー、PCX160 など"
              maxLength={20}
              required
              className="w-full bg-gray-950 border border-gray-800 rounded-xl p-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              車両タイプ
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType("car")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-semibold text-sm transition ${
                  type === "car" 
                    ? "bg-blue-600/20 border-blue-500 text-blue-400" 
                    : "bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700"
                }`}
              >
                <Car className="w-4 h-4" /> 自動車
              </button>
              <button
                type="button"
                onClick={() => setType("bike")}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-semibold text-sm transition ${
                  type === "bike" 
                    ? "bg-blue-600/20 border-blue-500 text-blue-400" 
                    : "bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-700"
                }`}
              >
                <Bike className="w-4 h-4" /> バイク
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 font-bold text-sm text-gray-300 rounded-xl transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 font-bold text-sm text-white rounded-xl shadow-lg shadow-blue-950 transition disabled:opacity-50"
            >
              {loading ? "登録中..." : "登録する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
