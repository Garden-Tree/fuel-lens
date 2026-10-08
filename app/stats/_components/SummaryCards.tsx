import { formatPricePerUnit } from "@/lib/calculations";
import type { StatsSummary } from "@/lib/stats";

/** サマリーカード（平均燃費・累計給油額・平均単価・走行コスト）。記録が1件以上あるときだけ表示する */
export default function SummaryCards({ summary }: { summary: StatsSummary }) {
  if (summary.count === 0) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-8">
      <div
        className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5"
        title={
          summary.meanEfficiency != null
            ? `総走行距離 ÷ 総給油量（満タン法）。各給油の単純平均: ${summary.meanEfficiency.toFixed(2)} km/L`
            : "総走行距離 ÷ 総給油量（満タン法）"
        }
      >
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">平均燃費</p>
        <p className="text-xl md:text-2xl font-bold font-mono text-blue-400">
          {summary.avgEfficiency != null ? summary.avgEfficiency.toFixed(2) : "--"}
          <span className="text-xs text-gray-500 ml-1">km/L</span>
        </p>
        {summary.meanEfficiency != null && summary.avgEfficiency != null && (
          <p className="text-[10px] text-gray-600 mt-1 font-mono">
            単純平均 {summary.meanEfficiency.toFixed(2)}
          </p>
        )}
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">累計給油額</p>
        <p className="text-xl md:text-2xl font-bold font-mono text-green-400">
          ¥{summary.totalCost.toLocaleString()}
        </p>
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">平均単価</p>
        <p className="text-xl md:text-2xl font-bold font-mono text-gray-200">
          {summary.avgPricePerUnit != null ? `¥${formatPricePerUnit(summary.avgPricePerUnit)}` : "--"}
          <span className="text-xs text-gray-500 ml-1">/L</span>
        </p>
      </div>
      <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 md:p-5">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">走行コスト</p>
        <p className="text-xl md:text-2xl font-bold font-mono text-gray-200">
          {summary.costPerKm != null ? `¥${summary.costPerKm.toFixed(1)}` : "--"}
          <span className="text-xs text-gray-500 ml-1">/km</span>
        </p>
      </div>
    </div>
  );
}
