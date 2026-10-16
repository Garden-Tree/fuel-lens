/** 履歴の読み込み中の一覧（月の見出しと行の形だけ）。履歴の画面と loading.tsx（遷移直後）で使う */
export default function HistoryListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {[3, 2].map((rows, g) => (
        <div key={g} className="flex flex-col gap-1.5">
          <div className="mx-4 mt-1.5 h-4 w-20 animate-pulse rounded bg-surface" />
          <div className="divide-y divide-line rounded-2xl bg-surface">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                <div className="h-9 w-8 animate-pulse rounded bg-surface-2" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-4 w-2/3 max-w-56 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-1/2 max-w-40 animate-pulse rounded bg-surface-2" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="h-5 w-12 animate-pulse rounded bg-surface-2" />
                  <div className="h-3 w-14 animate-pulse rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">読み込み中…</span>
    </div>
  );
}
