"use client";

import { useCallback, useState } from "react";
import type { FuelRecord, RecordInput } from "./types";
import { todayLocalISO } from "./dates";
import { findDuplicateRecord } from "./recordDraft";
import type { UseRecordFormReturn } from "./useRecordForm";
import type { VehicleScope } from "./useVehicleScope";

type ToastFn = (message: string, options?: { type?: "info" | "success" | "warning" | "error" }) => void;
type ConfirmFn = (message: string, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;

/** 同じ日付・給油量・支払総額の記録を保存しようとしたときの確認文 */
export const DUPLICATE_CONFIRM_MESSAGE = "同じ日付・給油量・金額の記録が既にあります。重複して保存しますか？";

/** useRecordEditing が使う useVehicleScope の値（`useVehicleScope()` の戻り値をそのまま渡せる） */
export type RecordEditingScope = Pick<VehicleScope, "selectedVehicle" | "records" | "scopeKey" | "readOnly"> & {
  recordActions: Pick<VehicleScope["recordActions"], "addRecord" | "updateRecord">;
};

export type UseRecordEditingOptions = {
  scope: RecordEditingScope;
  /** useRecordForm() の戻り値（編集・手動入力のフォーム） */
  form: Pick<UseRecordFormReturn, "reset" | "isValid" | "hasCoreValue" | "toRecord">;
  /** useToast().toast / confirm。lib から components へ依存しないよう、呼び出し側から渡す */
  toast: ToastFn;
  confirm: ConfirmFn;
  /** 更新に成功したときの toast（既定「給油記録を更新しました」） */
  updatedMessage?: string;
  /** 手動入力で記録を追加したとき（保存後の表示に使う） */
  onAdded?: (record: FuelRecord) => void;
};

export type RecordEditing = {
  /** 編集中の記録の ID（手動入力中・閉じているときは null） */
  editingRecordId: string | null;
  /** 編集または手動入力のフォームを開いているか */
  isEditing: boolean;
  /** 手動入力（新規）のフォームを開いているか */
  isManualEntry: boolean;
  /** 保存中か */
  saving: boolean;
  /** 既存の記録の編集を始める（閲覧専用中は何もしない） */
  startEditing: (record: FuelRecord) => void;
  /** 手動入力（今日の日付の新規記録）を始める */
  startManualEntry: () => void;
  /** フォームを閉じる */
  cancel: () => void;
  /** 保存する。手動入力は重複確認付きで追加、編集は更新。成功したらフォームを閉じて toast */
  save: () => Promise<void>;
  /**
   * 重複チェック付きで記録を追加する（確認シートの保存でも使う）。
   * 同じ日付・給油量・金額の記録があれば確認し、キャンセルなら null を返す。失敗は投げる
   */
  addWithDuplicateCheck: (record: RecordInput) => Promise<FuelRecord | null>;
};

type Mode = { kind: "closed" } | { kind: "edit"; id: string } | { kind: "manual" };

const CLOSED: Mode = { kind: "closed" };

/**
 * 記録の編集・手動入力のフォームの開閉と保存（/app の最新記録カード・/history のカードで共用）。
 * - 車両または距離の入力方式（scopeKey）が変わったらフォームを閉じる（切り替え前の車両の記録を更新しない・入力欄が合わなくなるため）。
 *   エフェクトではなく「前回の値を state に保持してレンダー中に調整する」React 推奨パターン
 * - 手動入力の保存は重複確認付き（findDuplicateRecord）。キャンセルならフォームは開いたまま
 * - 失敗は日本語メッセージの toast（フォームは開いたまま）
 */
export function useRecordEditing({
  scope,
  form,
  toast,
  confirm,
  updatedMessage = "給油記録を更新しました",
  onAdded,
}: UseRecordEditingOptions): RecordEditing {
  const { selectedVehicle, records, scopeKey, readOnly } = scope;
  const { addRecord, updateRecord } = scope.recordActions;
  const [mode, setMode] = useState<Mode>(CLOSED);
  const [saving, setSaving] = useState(false);

  const [formScopeKey, setFormScopeKey] = useState(scopeKey);
  if (formScopeKey !== scopeKey) {
    setFormScopeKey(scopeKey);
    setMode(CLOSED);
  }

  const addWithDuplicateCheck = useCallback(
    async (record: RecordInput): Promise<FuelRecord | null> => {
      if (findDuplicateRecord(records, record)) {
        const ok = await confirm(DUPLICATE_CONFIRM_MESSAGE, { danger: true, confirmLabel: "保存する" });
        if (!ok) return null;
      }
      return await addRecord(record);
    },
    [records, confirm, addRecord]
  );

  const startEditing = (record: FuelRecord) => {
    if (readOnly) return;
    form.reset(record, { vehicle: selectedVehicle, records });
    setMode({ kind: "edit", id: record.id });
  };

  const startManualEntry = () => {
    form.reset({ date: todayLocalISO() }, { vehicle: selectedVehicle, records });
    setMode({ kind: "manual" });
  };

  const cancel = () => setMode(CLOSED);

  const save = async () => {
    if (saving || !form.isValid || mode.kind === "closed") return;
    if (mode.kind === "manual" && !form.hasCoreValue) return;

    const record = form.toRecord();
    setSaving(true);
    try {
      if (mode.kind === "manual") {
        const added = await addWithDuplicateCheck(record);
        if (!added) return; // 重複確認でキャンセル。フォームは開いたまま
        onAdded?.(added);
        toast("給油記録を保存しました", { type: "success" });
      } else {
        await updateRecord(mode.id, record);
        toast(updatedMessage, { type: "success" });
      }
      setMode(CLOSED);
    } catch (err) {
      console.error(err);
      toast(err instanceof Error ? err.message : "保存に失敗しました", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return {
    editingRecordId: mode.kind === "edit" ? mode.id : null,
    isEditing: mode.kind !== "closed",
    isManualEntry: mode.kind === "manual",
    saving,
    startEditing,
    startManualEntry,
    cancel,
    save,
    addWithDuplicateCheck,
  };
}
