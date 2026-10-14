import { formatPricePerUnit } from "@/lib/calculations";
import { formatDateLabel } from "@/lib/format";
import type { Period, StatsModel } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";

/** スタンド別の単価（平均単価の棒グラフ風リスト） */
export default function StationComparison({ period, stations }: { period: Period; stations: StatsModel["stations"] }) {
  const { rows, hiddenCount } = stations;
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
      <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-violet-500 shadow-[0_0_10px_#8b5cf6]"></span>
        スタンド別の単価
      </h2>
      {rows.length === 0 ? (
        <div className="py-10">
          <ChartEmpty
            message={
              period === "all"
                ? "スタンド名が記録された給油がありません。"
                : "この期間にスタンド名が記録された給油がありません。"
            }
          />
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {rows.map(({ group: g, isCheapest, barWidth }) => (
              <li
                key={g.key}
                className={`rounded-2xl border p-3 md:p-4 ${
                  isCheapest ? "border-emerald-500/40 bg-emerald-500/5" : "border-gray-800 bg-gray-950/40"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* 店舗名にブランド名がそのまま含まれるとき（"ENEOS 調布店" など）はバッジを省く */}
                    {g.brand && !g.label.toUpperCase().includes(g.brand.toUpperCase()) && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-800 text-gray-300 border border-gray-700">
                        {g.brand}
                      </span>
                    )}
                    <span className="truncate text-sm text-gray-200" title={g.label}>{g.label}</span>
                    {isCheapest && (
                      <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        最安
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">{g.visits}回</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${isCheapest ? "bg-emerald-500" : "bg-amber-500/80"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-gray-200 text-right">
                    {g.avgPrice != null ? `¥${formatPricePerUnit(g.avgPrice)}` : "--"}
                    <span className="text-[10px] text-gray-500 font-normal ml-0.5">/L</span>
                  </span>
                </div>
                {g.lastDate && (
                  <p className="mt-1.5 text-[11px] text-gray-500 font-mono">
                    {g.lastPrice != null
                      ? `最新 ¥${formatPricePerUnit(g.lastPrice)}（${formatDateLabel(g.lastDate)}）`
                      : `最終給油 ${formatDateLabel(g.lastDate)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="mt-3 text-xs text-gray-500 text-center">他 {hiddenCount} 件</p>
          )}
          <p className="mt-4 text-[10px] text-gray-600 leading-relaxed">
            平均単価は 支払総額 ÷ 給油量。表記ゆれ（全角・半角、会社名、末尾の「店」など）は同じスタンドとしてまとめています。
            「最安」は単価の分かる給油が2回以上あるスタンドどうしで比べています。棒の長さは表示中の最安〜最高の差を強調しています。
          </p>
        </>
      )}
    </div>
  );
}
