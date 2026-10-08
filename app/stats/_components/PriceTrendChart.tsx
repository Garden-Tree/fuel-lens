import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

import { formatPricePerUnit } from "@/lib/calculations";
import { formatDateLabel, formatPriceDiff, priceDiffClass } from "@/lib/format";
import type { Period, PricePoint, StatsModel } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";
import { averageTickRenderer } from "./AverageTick";

interface PriceTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: PricePoint;
  }>;
}

function CustomPriceTooltip({ active, payload }: PriceTooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    const d = new Date(data.timestamp);
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`}</p>
        <p className="font-mono text-xl text-amber-400 font-bold">
          ¥{formatPricePerUnit(data.price)}<span className="text-xs text-gray-400 ml-1">/L</span>
        </p>
        <p className="text-xs text-gray-500 mt-1 truncate max-w-[180px]">{data.station ?? "スタンド不明"}</p>
      </div>
    );
  }
  return null;
}

/** 単価の推移グラフと、最新の給油の前回比・30日/90日平均比 */
export default function PriceTrendChart({ period, price }: { period: Period; price: StatsModel["price"] }) {
  const { series: priceData, axis: priceAxis, timeDomain: priceTimeDomain, delta: latestPriceDelta } = price;
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 mb-6">
        <h2 className="text-lg font-bold text-gray-300 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b]"></span>
          単価の推移 (円/L)
        </h2>
        {latestPriceDelta.latest && (
          <p className="text-[11px] text-gray-500 font-mono flex flex-wrap gap-x-3 gap-y-1">
            <span>
              最新 <span className="text-gray-300">¥{formatPricePerUnit(latestPriceDelta.latest.price)}</span>
              （{formatDateLabel(latestPriceDelta.latest.date)}）
            </span>
            {latestPriceDelta.diffFromPrevious != null && (
              <span>
                前回比{" "}
                <span className={priceDiffClass(latestPriceDelta.diffFromPrevious)}>
                  {formatPriceDiff(latestPriceDelta.diffFromPrevious)}
                </span>
              </span>
            )}
            {latestPriceDelta.diffFromAvg30 != null && (
              <span title="最新の給油日から遡って30日以内の、ほかの給油の単価の平均との差">
                30日平均比{" "}
                <span className={priceDiffClass(latestPriceDelta.diffFromAvg30)}>
                  {formatPriceDiff(latestPriceDelta.diffFromAvg30)}
                </span>
              </span>
            )}
            {latestPriceDelta.diffFromAvg90 != null && (
              <span title="最新の給油日から遡って90日以内の、ほかの給油の単価の平均との差">
                90日平均比{" "}
                <span className={priceDiffClass(latestPriceDelta.diffFromAvg90)}>
                  {formatPriceDiff(latestPriceDelta.diffFromAvg90)}
                </span>
              </span>
            )}
          </p>
        )}
      </div>
      <div className="h-64 md:h-72 w-full relative">
        {priceData.length < 2 ? (
          <ChartEmpty
            message={
              period === "all"
                ? "単価の推移を表示するには、単価が分かる記録が2件以上必要です。"
                : "この期間の単価の記録が2件未満です。期間を広げてみてください。"
            }
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* key={period}: 期間切替時は再マウントして新規描画 (燃費グラフと同じ理由) */}
            <LineChart key={period} data={priceData} margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis
                type="number"
                scale="time"
                dataKey="timestamp"
                stroke="#4a5568"
                fontSize={11}
                tickMargin={10}
                domain={priceTimeDomain ?? ['auto', 'auto']}
                tickFormatter={(val) => {
                  const date = new Date(val);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                stroke="#4a5568"
                fontSize={10}
                tickMargin={6}
                domain={priceAxis.domain ?? ['auto', 'auto']}
                ticks={priceAxis.ticks}
                tick={averageTickRenderer(priceAxis.averageTick, 1)}
              />
              <Tooltip content={<CustomPriceTooltip />} cursor={{ stroke: '#4a5568', strokeWidth: 1, strokeDasharray: '3 3' }} />
              {priceAxis.averageTick != null && (
                <ReferenceLine
                  y={priceAxis.averageTick}
                  stroke="#f87171"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="price"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ r: 4, fill: '#78350f', stroke: '#f59e0b', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={500}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
