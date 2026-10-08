/** 読み込み中のコンパクトなスケルトン（期間フィルタ・サマリー・グラフ2枚） */
export default function StatsSkeleton() {
  return (
    <>
      <div className="flex justify-end mb-4">
        <div className="w-56 h-9 bg-gray-900 border border-gray-800 rounded-lg animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-20 md:h-24 bg-gray-900/50 border border-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="space-y-8">
        <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
          <div className="w-40 h-5 bg-gray-800 rounded mb-6 animate-pulse" />
          <div className="h-64 md:h-80 w-full bg-gray-950/40 rounded-2xl border border-gray-800/50 animate-pulse" />
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
          <div className="w-40 h-5 bg-gray-800 rounded mb-6 animate-pulse" />
          <div className="h-64 w-full bg-gray-950/40 rounded-2xl border border-gray-800/50 animate-pulse" />
        </div>
      </div>
    </>
  );
}
