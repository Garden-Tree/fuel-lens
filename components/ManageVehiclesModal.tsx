"use client";

import { useState } from "react";
import { Sliders } from "lucide-react";
import type { Vehicle, VehicleSettings, VehicleType } from "@/lib/types";
import { useVehicleDraft } from "@/lib/useVehicleDraft";
import Modal from "./Modal";
import { useToast } from "./Toast";
import AddVehicleForm from "./vehicles/AddVehicleForm";
import VehicleRow, { deleteConfirmMessage } from "./vehicles/VehicleRow";

interface ManageVehiclesModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicles: Vehicle[];
  onAdd: (name: string, type: VehicleType, settings?: VehicleSettings) => Promise<Vehicle>;
  onDelete: (id: string) => Promise<void>;
  /** settings（距離の入力方式・既定の燃料種別）も同じ 1 回の更新で保存する */
  onUpdate: (id: string, name: string, type: VehicleType, settings?: VehicleSettings) => Promise<void>;
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

  // 新規追加の下書き
  const addDraft = useVehicleDraft();
  const [addLoading, setAddLoading] = useState(false);

  // 編集中の行と下書き
  const [editingId, setEditingId] = useState<string | null>(null);
  const editDraft = useVehicleDraft();
  const [updateLoading, setUpdateLoading] = useState(false);

  // 削除中の車両ID（行ごとの二重クリック防止）
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const busy = addLoading || updateLoading || deletingId !== null;

  const handleCancelEdit = () => {
    setEditingId(null);
    editDraft.reset();
  };

  // 閉じる経路（× ボタン・背景クリック・Escape）はすべてここを通す。
  // 行の編集状態を残すと、次に開いたときに古い編集行が表示されてしまうため破棄してから閉じる。
  const handleClose = () => {
    handleCancelEdit();
    onClose();
  };

  // Escape: 行の編集中ならまず編集だけを取り消し（下書きを失わない）、次の Escape でモーダルを閉じる。
  // 処理中は Modal が無視する
  const handleEscape = () => {
    if (editingId !== null) {
      handleCancelEdit();
      return;
    }
    handleClose();
  };

  const handleAddSubmit = async () => {
    if (!addDraft.isValid || addLoading || readOnly) return;

    setAddLoading(true);
    try {
      await onAdd(addDraft.trimmedName, addDraft.type, addDraft.settings);
      addDraft.reset();
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
    editDraft.load(v);
  };

  const handleSaveUpdate = async (v: Vehicle) => {
    if (!editDraft.isValid || updateLoading || readOnly) return;

    setUpdateLoading(true);
    try {
      await onUpdate(v.id, editDraft.trimmedName, editDraft.type, editDraft.settings);
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
    const isDefault = vehicles[0]?.id === v.id;
    const ok = await confirm(deleteConfirmMessage(v.name, isDefault), {
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
    <Modal
      open={isOpen}
      onClose={handleClose}
      onEscape={handleEscape}
      disableClose={busy}
      title="車両の管理"
      labelledBy="manage-vehicles-title"
      panelClassName="relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]"
    >
      {/* 背景の装飾光 */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-600/5 rounded-full blur-3xl pointer-events-none" />

      <Modal.Header icon={<Sliders className="w-5 h-5 text-blue-500" aria-hidden="true" />} />

      {readOnly && (
        <p role="status" className="text-[11px] text-amber-400 mb-3 flex-shrink-0">
          閲覧専用（クラウド接続待ち）のため、車両の追加・編集・削除はできません。
        </p>
      )}

      {/* スクロール可能な車両リスト */}
      <Modal.Body className="space-y-4 pr-1 min-h-[150px] scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
        <p className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
          登録済みの車両 ({vehicles.length})
        </p>
        {vehicles.map((v) => (
          <VehicleRow
            key={v.id}
            vehicle={v}
            vehicleCount={vehicles.length}
            isEditing={editingId === v.id}
            draft={editDraft}
            readOnly={readOnly}
            saving={updateLoading}
            deleting={deletingId === v.id}
            deleteLocked={deletingId !== null}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onSave={handleSaveUpdate}
            onDelete={handleDeleteClick}
          />
        ))}
      </Modal.Body>

      {/* 境界線 */}
      <div className="h-px bg-gray-800/60 my-5 flex-shrink-0" />

      {/* 新規登録セクション */}
      <AddVehicleForm draft={addDraft} adding={addLoading} readOnly={readOnly} onSubmit={handleAddSubmit} />
    </Modal>
  );
}
