import { AppPage, PageHeader, VehicleChipSkeleton } from "@/components/AppShell";
import RecordCardSkeleton, { RecentRecordsSkeleton } from "./_components/RecordCardSkeleton";

/**
 * ホームへの遷移直後に出す形（見出しとスケルトン）。画面は動的なので、リンクの先読みはこの境界まで行われる
 * （app/(app)/layout.tsx）。タブのタップですぐに表示し、ページ本体の応答で差し替える。
 */
export default function HomeLoading() {
  return (
    <AppPage>
      <PageHeader title="ホーム" brand rightSlot={<VehicleChipSkeleton />} />
      <div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-2 lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
          <RecordCardSkeleton />
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:gap-6">
          <RecentRecordsSkeleton />
        </div>
      </div>
    </AppPage>
  );
}
