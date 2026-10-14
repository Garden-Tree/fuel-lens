/** 読み込み中のスケルトン（期間切替・ヒーローカード・費用・グラフ2枚。実際のレイアウトと同じ並び） */
export default function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-hidden="true">
      <div className="h-12 animate-pulse rounded-xl bg-surface lg:max-w-md" />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-6">
        <div className="h-72 animate-pulse rounded-hero bg-surface lg:h-96" />
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-12 animate-pulse rounded bg-surface" />
          <div className="h-[185px] animate-pulse rounded-2xl bg-surface" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-28 animate-pulse rounded bg-surface" />
          <div className="h-52 animate-pulse rounded-2xl bg-surface lg:h-72" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="h-6 w-24 animate-pulse rounded bg-surface" />
          <div className="h-60 animate-pulse rounded-2xl bg-surface lg:h-72" />
        </div>
      </div>
    </div>
  );
}
