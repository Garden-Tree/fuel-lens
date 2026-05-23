import { useState } from "react";
import { X, Plus, Car, Bike, Edit2, Trash2, Check, Sliders } from "lucide-react";
import { Vehicle } from "@/lib/useVehicles";

interface ManageVehiclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onAdd: (name: string, type: "car" | "bike") => Promise<any>;
  onDelete: (id: string) => Promise<void>;
  onUpdate: (id: string, name: string, type: "car" | "bike") => Promise<void>;
}

export default function ManageVehiclesModal({
  isOpen,
  onClose,
  vehicles,
  onAdd,
  onDelete,
  onUpdate,
}: ManageVehiclesModalProps) {
  // 新規追加ステート
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"car" | "bike">("car");
  const [addLoading, setAddLoading] = useState(false);

  // 編集ステート
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"car" | "bike">("car");
  const [updateLoading, setUpdateLoading] = useState(false);

  if (!isOpen) return null;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setAddLoading(true);
    try {
      await onAdd(newName.trim(), newType);
      setNewName("");
      setNewType("car");
    } catch (err) {
      console.error(err);
      alert("車両の登録に失敗しました。");
    } finally {
      setAddLoading(false);
    }
  };

  const handleStartEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setEditName(v.name);
    setEditType(v.type);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleSaveUpdate = async (id: string) => {
    if (!editName.trim()) return;

    setUpdateLoading(true);
    try {
      await onUpdate(id, editName.trim(), editType);
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert("車両の更新に失敗しました。");
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDeleteClick = async (v: Vehicle) => {
    if (vehicles.length <= 1) {
      alert("最低1台の車両は残す必要があります。");
      return;
    }

    if (confirm(`「${v.name}」を削除しますか？\n（関連する給油記録も削除されます）`)) {
      try {
        await onDelete(v.id);
      } catch (err) {
        console.error(err);
        alert("車両の削除に失敗しました。");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]">
        {/* 背景の装飾光 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />
        
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-500" /> 車両の管理
          </h3>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能な車両リスト */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[150px] scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            登録済みの車両 ({vehicles.length})
          </label>
          {vehicles.map((v) => {
            const isEditing = editingId === v.id;
            return (
              <div 
                key={v.id} 
                className={`p-3 rounded-2xl border transition-all duration-300 ${
                  isEditing 
                    ? "bg-gray-950 border-blue-500/50 shadow-md shadow-blue-950/20" 
                    : "bg-gray-950/50 border-gray-800/80 hover:border-gray-700/60"
                }`}
              >
                {isEditing ? (
                  /* 編集表示 */
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)} 
                        maxLength={20}
                        required
                        className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                        placeholder="車両の名前"
                      />
                      <div className="flex bg-gray-900 p-0.5 rounded-xl border border-gray-800">
                        <button
                          type="button"
                          onClick={() => setEditType("car")}
                          className={`p-2 rounded-lg transition ${
                            editType === "car" 
                              ? "bg-blue-600 text-white shadow" 
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                          title="自動車"
                        >
                          <Car className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditType("bike")}
                          className={`p-2 rounded-lg transition ${
                            editType === "bike" 
                              ? "bg-blue-600 text-white shadow" 
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                          title="バイク"
                        >
                          <Bike className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 text-xs font-bold pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={updateLoading}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveUpdate(v.id)}
                        disabled={updateLoading || !editName.trim()}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> 保存
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 通常表示 */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl bg-gray-900 border border-gray-800/80 ${v.type === "bike" ? "text-amber-500" : "text-blue-500"}`}>
                        {v.type === "bike" ? <Bike className="w-4 h-4" /> : <Car className="w-4 h-4" />}
                      </div>
                      <span className="text-sm font-semibold text-white">{v.name}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStartEdit(v)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-900 transition"
                        title="車両名・タイプを編集"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(v)}
                        disabled={vehicles.length <= 1}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-gray-900 transition disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent"
                        title="この車両を削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 境界線 */}
        <div className="h-px bg-gray-800/60 my-5 flex-shrink-0" />

        {/* 新規登録セクション */}
        <form onSubmit={handleAddSubmit} className="space-y-4 flex-shrink-0">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
            新しい車両・バイクの追加
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex gap-2">
              <input 
                type="text" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                placeholder="例: サブカー、カブ など"
                maxLength={20}
                required
                className="flex-1 bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              />
              <div className="flex bg-gray-950 p-0.5 rounded-xl border border-gray-800 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setNewType("car")}
                  className={`px-3 rounded-lg font-semibold text-xs transition ${
                    newType === "car" 
                      ? "bg-blue-600/20 border border-blue-500/30 text-blue-400" 
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="自動車"
                >
                  <Car className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setNewType("bike")}
                  className={`px-3 rounded-lg font-semibold text-xs transition ${
                    newType === "bike" 
                      ? "bg-blue-600/20 border border-blue-500/30 text-blue-400" 
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="バイク"
                >
                  <Bike className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={addLoading || !newName.trim()}
              className="py-3 px-5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 font-bold text-sm text-white rounded-xl shadow-lg shadow-blue-950 transition disabled:opacity-50 flex-shrink-0 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> 追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
