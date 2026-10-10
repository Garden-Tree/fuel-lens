"use client";

import { useId, useMemo } from "react";
import { Pencil } from "lucide-react";
import EditFuelRecordForm from "@/components/EditFuelRecordForm";
import { heroModelOf, type EfficiencyDelta } from "@/lib/home/hero";
import { formatShortDate } from "@/lib/home/recent";
import type { UseRecordFormReturn } from "@/lib/useRecordForm";
import type { FuelRecord } from "@/lib/types";
import EfficiencyGauge from "./EfficiencyGauge";

export type RecordFormCardProps = {
  title: string;
  form: UseRecordFormReturn;
  saving: boolean;
  readOnly: boolean;
  canSave: boolean;
  onCancel: () => void;
  onSave: () => void;
};

/** 入力フォームのカード（手動入力・最新記録の編集）。ヒーローと同じ角丸 20px の面に、アクセント色の枠 */
export function RecordFormCard({ title, form, saving, readOnly, canSave, onCancel, onSave }: RecordFormCardProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="w-full rounded-hero border border-accent/40 bg-surface p-4 sm:p-5">
      <h2 id={headingId} className="mb-4 text-[15px] font-bold text-ink">
        {title}
      </h2>
      <EditFuelRecordForm
        form={form}
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        disabled={readOnly}
        canSave={canSave}
        saveHint="保存するには給油量または支払総額を入力してください"
      />
    </section>
  );
}

/** 前回比のチップ（向上は ▲ と緑、悪化は ▼ と橙。色だけに頼らず記号と読み上げ文で示す） */
function DeltaChip({ delta }: { delta: EfficiencyDelta }) {
  const style =
    delta.direction === "up"
      ? { cls: "bg-up-bg text-up", mark: "▲", sr: "前回より向上" }
      : delta.direction === "down"
        ? { cls: "bg-surface-2 text-cost-up", mark: "▼", sr: "前回より悪化" }
        : { cls: "bg-surface-2 text-sub", mark: "±", sr: "前回と同じ" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold ${style.cls}`}>
      <span aria-hidden="true">{style.mark}</span>
      <span className="num">{delta.text}</span>
      <span>前回比</span>
      <span className="sr-only">（{style.sr}）</span>
    </span>
  );
}

export type LatestRecordCardProps = {
  /** 表示する記録（スキャン・手動入力の直後はその記録、それ以外は最新の記録） */
  record: FuelRecord;
  /** 選択中の車両の記録（連鎖計算済み・日付の降順）。前回比・平均・目盛りに使う */
  records: ReadonlyArray<FuelRecord>;
  /** record がスキャンで保存した直後の記録か（見出しを「スキャンした記録」にする） */
  scanned: boolean;
  readOnly: boolean;
  /** 編集フォームを開いているか */
  isEditing: boolean;
  form: UseRecordFormReturn;
  saving: boolean;
  onEdit: (record: FuelRecord) => void;
  onCancel: () => void;
  onSave: () => void;
};

/**
 * ホームのヒーローカード: 前回の燃費の半円メーター（平均の目盛り・下限 / 上限）と、前回比・平均のチップ。
 * 編集中はその場で編集フォームのカードに切り替わる。部分給油など燃費が無い記録は数値の代わりに理由を出す。
 */
export default function LatestRecordCard({
  record,
  records,
  scanned,
  readOnly,
  isEditing,
  form,
  saving,
  onEdit,
  onCancel,
  onSave,
}: LatestRecordCardProps) {
  const headingId = useId();
  const model = useMemo(() => heroModelOf(records, record), [records, record]);

  if (isEditing) {
    return (
      <RecordFormCard
        title="給油記録の編集"
        form={form}
        saving={saving}
        readOnly={readOnly}
        canSave
        onCancel={onCancel}
        onSave={onSave}
      />
    );
  }

  const date = formatShortDate(record.date) ?? "日付不明";
  const station = record.gas_station?.trim();

  return (
    <section
      aria-labelledby={headingId}
      className="flex w-full flex-col items-center gap-1 rounded-hero bg-surface px-4 pb-4 pt-3 lg:px-5 lg:pb-5"
    >
      <div className="flex w-full min-w-0 items-center gap-2 text-[13px] text-sub">
        <h2 id={headingId} className="shrink-0 font-medium">
          {scanned ? "スキャンした記録" : "前回の燃費"}
        </h2>
        <p className="min-w-0 flex-1 truncate text-right">
          <span className="num">{date}</span>
          {station && <span> {station}</span>}
        </p>
        <button
          type="button"
          onClick={() => onEdit(record)}
          disabled={readOnly}
          className="-my-2 -mr-2 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-2 font-medium text-accent transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          編集
        </button>
      </div>

      <EfficiencyGauge value={model.efficiency} reason={model.nullReason} average={model.average} scale={model.scale} />

      {(model.delta || model.average !== null) && (
        <div className="flex flex-wrap justify-center gap-2 text-[13px]">
          {model.delta && <DeltaChip delta={model.delta} />}
          {model.average !== null && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-ink/80">
              平均 <span className="num">{model.average.toFixed(2)}</span>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
