import type { RestorePlan } from "@/lib/backup";

export interface RestoreCountsProps {
  /** planRestore の件数。null / 省略なら件数の表は出さない */
  counts?: RestorePlan["counts"] | null;
  /** 件数の下に出す補足（箇条書き）。空なら出さない */
  notes?: readonly string[];
}

const CELL = "rounded-xl bg-surface-2 px-2 py-2.5";
const LABEL = "text-[11px] text-sub";
const VALUE = "num mt-0.5 text-lg font-bold";

/** 復元・取り込みのプレビュー（新規車両 / 既存に一致 / 追加される記録 / 重複でスキップ）と補足 */
export default function RestoreCounts({ counts, notes = [] }: RestoreCountsProps) {
  return (
    <>
      {counts && (
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <div className={CELL}>
            <dt className={LABEL}>新規車両</dt>
            <dd className={`${VALUE} text-ink`}>{counts.vehiclesNew}</dd>
          </div>
          <div className={CELL}>
            <dt className={LABEL}>既存に一致</dt>
            <dd className={`${VALUE} text-ink`}>{counts.vehiclesMatched}</dd>
          </div>
          <div className={CELL}>
            <dt className={LABEL}>追加される記録</dt>
            <dd className={`${VALUE} text-money`}>{counts.recordsNew}</dd>
          </div>
          <div className={CELL}>
            <dt className={LABEL}>重複でスキップ</dt>
            <dd className={`${VALUE} text-sub`}>{counts.recordsSkipped}</dd>
          </div>
        </dl>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-sub">
          {notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}
