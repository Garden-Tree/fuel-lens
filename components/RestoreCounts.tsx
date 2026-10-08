import type { RestorePlan } from "@/lib/backup";

export interface RestoreCountsProps {
  /** planRestore の件数。null / 省略なら件数の表は出さない */
  counts?: RestorePlan["counts"] | null;
  /** 件数の下に出す補足（箇条書き）。空なら出さない */
  notes?: readonly string[];
}

/** 復元・取り込みのプレビュー（新規車両 / 既存に一致 / 追加される記録 / 重複でスキップ）と補足 */
export default function RestoreCounts({ counts, notes = [] }: RestoreCountsProps) {
  return (
    <>
      {counts && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-gray-900 rounded-lg p-2">
            <dt className="text-[11px] text-gray-500">新規車両</dt>
            <dd className="text-lg font-bold font-mono">{counts.vehiclesNew}</dd>
          </div>
          <div className="bg-gray-900 rounded-lg p-2">
            <dt className="text-[11px] text-gray-500">既存に一致</dt>
            <dd className="text-lg font-bold font-mono">{counts.vehiclesMatched}</dd>
          </div>
          <div className="bg-gray-900 rounded-lg p-2">
            <dt className="text-[11px] text-gray-500">追加される記録</dt>
            <dd className="text-lg font-bold font-mono text-green-400">{counts.recordsNew}</dd>
          </div>
          <div className="bg-gray-900 rounded-lg p-2">
            <dt className="text-[11px] text-gray-500">重複でスキップ</dt>
            <dd className="text-lg font-bold font-mono text-gray-400">{counts.recordsSkipped}</dd>
          </div>
        </dl>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 text-[11px] text-gray-400 list-disc pl-4 space-y-0.5">
          {notes.map(n => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}
