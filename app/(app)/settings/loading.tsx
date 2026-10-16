import { AppPage, PageHeader } from "@/components/AppShell";

/** 設定への遷移直後に出す形（見出しとセクションの形）。リンクの先読みはこの境界まで行われる（app/(app)/layout.tsx） */
export default function SettingsLoading() {
  return (
    <AppPage width="narrow">
      <div className="flex w-full flex-col gap-5">
        <PageHeader title="設定" />
        <div className="flex flex-col gap-5" aria-hidden="true">
          {[2, 3, 2].map((rows, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="mx-4 h-4 w-20 animate-pulse rounded bg-surface" />
              <div className="divide-y divide-line rounded-2xl bg-surface">
                {Array.from({ length: rows }, (_, j) => (
                  <div key={j} className="flex min-h-[46px] items-center justify-between gap-3 px-4 py-2.5">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
                    <div className="h-4 w-12 animate-pulse rounded bg-surface-2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">読み込み中…</span>
      </div>
    </AppPage>
  );
}
