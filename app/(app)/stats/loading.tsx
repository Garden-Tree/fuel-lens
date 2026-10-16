import { AppPage, PageHeader, VehicleChipSkeleton } from "@/components/AppShell";
import StatsSkeleton from "./_components/StatsSkeleton";

/** 統計への遷移直後に出す形（見出しとスケルトン）。リンクの先読みはこの境界まで行われる（app/(app)/layout.tsx） */
export default function StatsLoading() {
  return (
    <AppPage>
      <div className="w-full">
        <PageHeader title="統計" rightSlot={<VehicleChipSkeleton />} />
        <StatsSkeleton />
      </div>
    </AppPage>
  );
}
