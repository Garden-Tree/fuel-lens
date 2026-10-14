"use client";

import type { UseRecordFormReturn } from "@/lib/useRecordForm";
import { RecordFormCard } from "./LatestRecordCard";

/** ホームの手動入力カード（見出し「手動で記録を追加」）。給油量か支払総額が入るまで保存できない */
export default function ManualEntryCard({
  form,
  saving,
  readOnly,
  onCancel,
  onSave,
}: {
  form: UseRecordFormReturn;
  saving: boolean;
  readOnly: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <RecordFormCard
      title="手動で記録を追加"
      form={form}
      saving={saving}
      readOnly={readOnly}
      canSave={form.hasCoreValue}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
