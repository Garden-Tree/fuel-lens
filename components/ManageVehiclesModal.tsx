"use client";

import { useEffect, useRef, useState } from "react";
import { X, Plus, Car, Bike, Edit2, Trash2, Check, Sliders, Loader2 } from "lucide-react";
import type { Vehicle, VehicleSettings } from "@/lib/useVehicles";
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  distanceModeOf,
  isFuelType,
  type DistanceMode,
  type FuelType,
} from "@/lib/fillChain";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useToast } from "./Toast";

const DISTANCE_MODE_OPTIONS: readonly { value: DistanceMode; label: string; detail: string }[] = [
  { value: "trip", label: "トリップメーター", detail: "区間距離" },
  { value: "odometer", label: "オドメーター", detail: "積算距離" },
];

const DISTANCE_MODE_SHORT_LABELS: Readonly<Record<DistanceMode, string>> = {
  trip: "トリップメーター",
  odometer: "オドメーター",
};

/** オドメーターへ切り替えるときの注意（docs/design-fill-chain.md 4 章） */
const ODOMETER_SWITCH_NOTE =
  "オドメーターが入っていない既存の記録は、区間距離と燃費が「不明」になります（記録は消えません）。";

/** 距離の入力方式・既定の燃料種別の入力欄（編集行と追加フォームで共通） */
function VehicleSettingsFields({
  idPrefix,
  mode,
  fuelType,
  onModeChange,
  onFuelTypeChange,
  disabled,
  showOdometerNote,
}: {
  idPrefix: string;
  mode: DistanceMode;
  fuelType: FuelType | null;
  onModeChange: (mode: DistanceMode) => void;
  onFuelTypeChange: (fuelType: FuelType | null) => void;
  disabled?: boolean;
  showOdometerNote?: boolean;
}) {
  const modeLabelId = `${idPrefix}-mode-label`;
  const fuelId = `${idPrefix}-fuel-type`;
  return (
    <div className="space-y-2">
      <div>
        <p id={modeLabelId} className="text-[11px] text-gray-400 mb-1">
          距離の入力方式
        </p>
        <div
          className="grid grid-cols-2 gap-1 bg-gray-900 p-0.5 rounded-xl border border-gray-800"
          role="radiogroup"
          aria-labelledby={modeLabelId}
        >
          {DISTANCE_MODE_OPTIONS.map((opt) => {
            const selected = mode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onModeChange(opt.value)}
                disabled={disabled}
                className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-60 ${
                  selected ? "bg-blue-600 text-white shadow" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {opt.label}
                <span className="block text-[10px] font-normal opacity-80">（{opt.detail}）</span>
              </button>
            );
          })}
        </div>
        {showOdometerNote && (
          <p role="status" className="mt-1 text-[11px] text-amber-400">
            {ODOMETER_SWITCH_NOTE}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={fuelId} className="text-[11px] text-gray-400 flex-shrink-0">
          既定の燃料種別
        </label>
        <select
          id={fuelId}
          value={fuelType ?? ""}
          onChange={(e) => onFuelTypeChange(isFuelType(e.target.value) ? e.target.value : null)}
          disabled={disabled}
          className="flex-1 min-w-0 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition disabled:opacity-60"
        >
          <option value="">未指定</option>
          {FUEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {FUEL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

interface ManageVehiclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onAdd: (name: string, type: "car" | "bike", settings?: VehicleSettings) => Promise<Vehicle>;
  onDelete: (id: string) => Promise<void>;
  /** settings（距離の入力方式・既定の燃料種別）も同じ 1 回の更新で保存する */
  onUpdate: (id: string, name: string, type: "car" | "bike", settings?: VehicleSettings) => Promise<void>;
  /** 閲覧専用（クラウド障害中）。追加・編集・削除を無効化する */
  readOnly?: boolean;
}

export default function ManageVehiclesModal({
  isOpen,
  onClose,
  vehicles,
  onAdd,
  onDelete,
  onUpdate,
  readOnly = false,
}: ManageVehiclesModalProps) {
  const { toast, confirm } = useToast();

  // 新規追加ステート
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"car" | "bike">("car");
  const [newMode, setNewMode] = useState<DistanceMode>("trip");
  const [newFuelType, setNewFuelType] = useState<FuelType | null>(null);
  const [addLoading, setAddLoading] = useState(false);

  // 編集ステート
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<"car" | "bike">("car");
  const [editMode, setEditMode] = useState<DistanceMode>("trip");
  const [editFuelType, setEditFuelType] = useState<FuelType | null>(null);
  const [updateLoading, setUpdateLoading] = useState(false);

  // 削除中の車両ID（行ごとの二重クリック防止）
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = "manage-vehicles-title";

  const busy = addLoading || updateLoading || deletingId !== null;

  // 閉じる経路（× ボタン・背景クリック・Escape）はすべてここを通す。
  // 行の編集状態を残すと、次に開いたときに古い編集行が表示されてしまうため破棄してから閉じる。
  const handleClose = () => {
    setEditingId(null);
    setEditName("");
    onClose();
  };

  // Escape: 行の編集中ならまず編集だけを取り消し（下書きを失わない）、次の Escape でモーダルを閉じる。
  // 処理中は無視する
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (editingId !== null) {
        setEditingId(null);
        setEditName("");
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, busy, editingId, onClose]);

  // 開いたら閉じるボタンにフォーカスを移し、モーダル内でフォーカスを循環させる。閉じたら開いた要素へ戻す
  useFocusTrap(panelRef, { active: isOpen, initialFocusRef: closeButtonRef });

  // 背景クリックで閉じる（パネル内から背景へドラッグして離した場合は閉じない）
  const backdropHandlers = useBackdropClose(handleClose, !busy);

  if (!isOpen) return null;

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || addLoading || readOnly) return;

    setAddLoading(true);
    try {
      await onAdd(newName.trim(), newType, { distance_mode: newMode, default_fuel_type: newFuelType });
      setNewName("");
      setNewType("car");
      setNewMode("trip");
      setNewFuelType(null);
      toast("車両を追加しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "車両の登録に失敗しました。", { type: "error" });
    } finally {
      setAddLoading(false);
    }
  };

  const handleStartEdit = (v: Vehicle) => {
    if (readOnly) return;
    setEditingId(v.id);
    setEditName(v.name);
    setEditType(v.type);
    setEditMode(distanceModeOf(v));
    setEditFuelType(isFuelType(v.default_fuel_type) ? v.default_fuel_type : null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleSaveUpdate = async (id: string) => {
    if (!editName.trim() || updateLoading || readOnly) return;

    setUpdateLoading(true);
    try {
      await onUpdate(id, editName.trim(), editType, { distance_mode: editMode, default_fuel_type: editFuelType });
      setEditingId(null);
      toast("車両を更新しました", { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "車両の更新に失敗しました。", { type: "error" });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleDeleteClick = async (v: Vehicle) => {
    if (deletingId || readOnly) return;
    // useVehicles.deleteVehicle 側にも同じガードがある（Error を throw する）ため、
    // ここで先に弾いてトーストで案内する
    if (vehicles.length <= 1) {
      toast("最低1台の車両は残す必要があります。", { type: "warning" });
      return;
    }

    // 確認ダイアログ表示中も busy 扱いにして、Escape でモーダルごと閉じないようにする
    setDeletingId(v.id);
    // 既定車両（先頭）には未分類の記録も表示されており、useVehicles.deleteVehicle はそれらも削除する
    const isDefault = vehicles[0]?.id === v.id;
    const detail = isDefault
      ? "（関連する給油記録と、この車両に表示されている未分類の記録も削除されます）"
      : "（関連する給油記録も削除されます）";
    const ok = await confirm(`「${v.name}」を削除しますか？\n${detail}`, {
      title: "車両の削除",
      danger: true,
      confirmLabel: "削除する",
    });
    if (!ok) {
      setDeletingId(null);
      return;
    }

    try {
      await onDelete(v.id);
      toast(`「${v.name}」を削除しました`, { type: "success" });
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "車両の削除に失敗しました。", { type: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      {...backdropHandlers}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* 背景の装飾光 */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />

        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <h3 id={titleId} className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-blue-500" aria-hidden="true" /> 車両の管理
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="閉じる"
            className="p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {readOnly && (
          <p role="status" className="text-[11px] text-amber-400 mb-3 flex-shrink-0">
            閲覧専用（クラウド接続待ち）のため、車両の追加・編集・削除はできません。
          </p>
        )}

        {/* スクロール可能な車両リスト */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[150px] scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
          <p className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
            登録済みの車両 ({vehicles.length})
          </p>
          {vehicles.map((v) => {
            const isEditing = editingId === v.id;
            const isDeleting = deletingId === v.id;
            return (
              <div
                key={v.id}
                className={`p-3 rounded-2xl border transition-all duration-300 ${
                  isEditing
                    ? "bg-gray-950 border-blue-500/50 shadow-md shadow-blue-950/20"
                    : "bg-gray-950/50 border-gray-800/80 hover:border-gray-700/60"
                } ${isDeleting ? "opacity-50" : ""}`}
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
                        aria-label="車両の名前"
                        disabled={updateLoading}
                        className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition"
                        placeholder="車両の名前"
                      />
                      <div className="flex bg-gray-900 p-0.5 rounded-xl border border-gray-800" role="radiogroup" aria-label="車両タイプ">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={editType === "car"}
                          onClick={() => setEditType("car")}
                          className={`p-2 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                            editType === "car"
                              ? "bg-blue-600 text-white shadow"
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                          title="自動車"
                          aria-label="自動車"
                        >
                          <Car className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={editType === "bike"}
                          onClick={() => setEditType("bike")}
                          className={`p-2 rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                            editType === "bike"
                              ? "bg-blue-600 text-white shadow"
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                          title="バイク"
                          aria-label="バイク"
                        >
                          <Bike className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <VehicleSettingsFields
                      idPrefix={`manage-vehicles-edit-${v.id}`}
                      mode={editMode}
                      fuelType={editFuelType}
                      onModeChange={setEditMode}
                      onFuelTypeChange={setEditFuelType}
                      disabled={updateLoading}
                      showOdometerNote={editMode === "odometer" && distanceModeOf(v) !== "odometer"}
                    />
                    <div className="flex justify-end gap-2 text-xs font-bold pt-1">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={updateLoading}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveUpdate(v.id)}
                        disabled={updateLoading || !editName.trim() || readOnly}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition flex items-center gap-1 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                      >
                        {updateLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Check className="w-3.5 h-3.5" aria-hidden="true" />} 保存
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 通常表示 */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl bg-gray-900 border border-gray-800/80 ${v.type === "bike" ? "text-amber-500" : "text-blue-500"}`}>
                        {v.type === "bike" ? <Bike className="w-4 h-4" aria-hidden="true" /> : <Car className="w-4 h-4" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <span className="block text-sm font-semibold text-white truncate">{v.name}</span>
                        <span className="block text-[10px] text-gray-500">
                          {DISTANCE_MODE_SHORT_LABELS[distanceModeOf(v)]}
                          {isFuelType(v.default_fuel_type) ? `・${FUEL_TYPE_LABELS[v.default_fuel_type]}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(v)}
                        disabled={readOnly || isDeleting}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-gray-900 transition disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        title="車両名・タイプ・設定を編集"
                        aria-label={`「${v.name}」を編集`}
                      >
                        <Edit2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(v)}
                        disabled={vehicles.length <= 1 || readOnly || deletingId !== null}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-500 hover:bg-gray-900 transition disabled:opacity-30 disabled:hover:text-gray-500 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        title={vehicles.length <= 1 ? "最低1台の車両は残す必要があります" : "この車両を削除"}
                        aria-label={`「${v.name}」を削除`}
                      >
                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash2 className="w-4 h-4" aria-hidden="true" />}
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
          <label htmlFor="manage-vehicles-new-name" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
            新しい車両・バイクの追加
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex gap-2">
              <input
                id="manage-vehicles-new-name"
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="例: サブカー、カブ など"
                maxLength={20}
                required
                disabled={addLoading || readOnly}
                className="flex-1 min-w-0 bg-gray-950 border border-gray-800 rounded-xl p-3 text-sm text-white placeholder-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 transition disabled:opacity-60"
              />
              <div className="flex bg-gray-950 p-0.5 rounded-xl border border-gray-800 flex-shrink-0" role="radiogroup" aria-label="車両タイプ">
                <button
                  type="button"
                  role="radio"
                  aria-checked={newType === "car"}
                  onClick={() => setNewType("car")}
                  disabled={readOnly}
                  className={`px-3 rounded-lg font-semibold text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    newType === "car"
                      ? "bg-blue-600/20 border border-blue-500/30 text-blue-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="自動車"
                  aria-label="自動車"
                >
                  <Car className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={newType === "bike"}
                  onClick={() => setNewType("bike")}
                  disabled={readOnly}
                  className={`px-3 rounded-lg font-semibold text-xs transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    newType === "bike"
                      ? "bg-blue-600/20 border border-blue-500/30 text-blue-400"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                  title="バイク"
                  aria-label="バイク"
                >
                  <Bike className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={addLoading || !newName.trim() || readOnly}
              className="py-3 px-5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 font-bold text-sm text-white rounded-xl shadow-lg shadow-blue-950 transition disabled:opacity-50 flex-shrink-0 flex items-center justify-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              {addLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />} 追加
            </button>
          </div>
          <VehicleSettingsFields
            idPrefix="manage-vehicles-new"
            mode={newMode}
            fuelType={newFuelType}
            onModeChange={setNewMode}
            onFuelTypeChange={setNewFuelType}
            disabled={addLoading || readOnly}
          />
        </form>
      </div>
    </div>
  );
}
