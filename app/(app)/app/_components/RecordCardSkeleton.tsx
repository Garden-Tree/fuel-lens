/**
 * ホームの読み込み中スケルトン（ヒーロー・今月・最近の記録の形）。
 * - default: 左カラム（ヒーロー＋今月のリスト）
 * - RecentRecordsSkeleton: 右カラム（最近の記録）
 */

function Bar({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded bg-surface-2 ${className}`} />;
}

function ListSkeleton({ rows, titleWidth }: { rows: number; titleWidth: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center px-4">
        <Bar className={`h-3 ${titleWidth}`} />
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex min-h-[46px] items-center justify-between gap-3 px-4 py-2.5">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RecordCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 lg:gap-6" aria-busy="true" aria-label="読み込み中">
      <div className="flex flex-col items-center gap-3 rounded-hero bg-surface px-4 pb-4 pt-3">
        <div className="flex w-full items-center justify-between">
          <Bar className="h-3 w-20" />
          <Bar className="h-3 w-28" />
        </div>
        <svg viewBox="0 0 300 172" className="h-auto w-full max-w-[300px] lg:max-w-[340px]" aria-hidden="true">
          <path d="M40,144 A110,110 0 0 1 260,144" fill="none" strokeWidth={14} strokeLinecap="round" className="animate-pulse stroke-surface-2" />
        </svg>
        <div className="flex gap-2">
          <Bar className="h-7 w-24 rounded-lg" />
          <Bar className="h-7 w-20 rounded-lg" />
        </div>
      </div>
      <ListSkeleton rows={3} titleWidth="w-10" />
    </div>
  );
}

export function RecentRecordsSkeleton() {
  return <ListSkeleton rows={3} titleWidth="w-20" />;
}
