"use client";

import type { UseRecordFormReturn } from "@/lib/useRecordForm";
import { RecordCardBody, RecordCardFrame, RecordFormPanel } from "./LatestRecordCard";

/** メイン画面右カラムの手動入力カード（見出し「New Record」）。給油量か支払総額が入るまで保存できない */
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
    <RecordCardFrame label="New Record">
      <RecordCardBody editing>
        <RecordFormPanel
          title="手動で記録を追加"
          form={form}
          saving={saving}
          readOnly={readOnly}
          canSave={form.hasCoreValue}
          onCancel={onCancel}
          onSave={onSave}
        />
      </RecordCardBody>
    </RecordCardFrame>
  );
}
