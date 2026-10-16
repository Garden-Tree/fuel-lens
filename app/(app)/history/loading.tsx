import { AppPage, PageHeader, VehicleChipSkeleton } from "@/components/AppShell";
import { HistoryToolbarSkeleton } from "./_components/HistoryToolbar";
import HistoryListSkeleton from "./_components/HistoryListSkeleton";

/** 履歴への遷移直後に出す形（見出しとスケルトン）。リンクの先読みはこの境界まで行われる（app/(app)/layout.tsx） */
export default function HistoryLoading() {
  return (
    <AppPage>
      <PageHeader title="給油履歴" rightSlot={<VehicleChipSkeleton />} />
      <HistoryToolbarSkeleton />
      <HistoryListSkeleton />
    </AppPage>
  );
}
