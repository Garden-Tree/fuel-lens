import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

import type { Period, StatsModel } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";
import { averageTickRenderer } from "./AverageTick";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      name: string;
      timestamp: number;
      efficiency: number;
      cost: number;
      gasStation: string;
    };
  }>;
  label?: string;
}

function CustomEfficiencyTooltip({ active, payload }: TooltipProps) {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    let formattedDate = data.name;
    const parts = data.name.split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
    }
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{formattedDate}</p>
        <p className="font-mono text-xl text-blue-400 font-bold">{payload[0].value.toFixed(2)} km/L</p>
        <p className="text-xs text-gray-500 mt-1 truncate max-w-[150px]">{data.gasStation}</p>
      </div>
    );
  }
  return null;
}

interface EfficiencyChartProps {
  period: Period;
  efficiency: StatsModel["efficiency"];
  /** サマリーと同じ Σkm/ΣL（参照線を引くかの判定に使う） */
  averageEfficiency: number | null;
}

/** 燃費の推移グラフ */
export default function EfficiencyChart({ period, efficiency, averageEfficiency }: EfficiencyChartProps) {
  const { series: chartData, axis: efficiencyAxis, timeDomain } = efficiency;
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
      <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></span>
        燃費の推移 (km/L)
      </h2>
      <div className="h-64 md:h-80 w-full relative">
        {chartData.length < 2 ? (
          <ChartEmpty
            message={
              period === "all"
                ? "燃費の推移を表示するには、燃費が算出された記録が2件以上必要です。"
                : "この期間の燃費記録が2件未満です。期間を広げてみてください。"
            }
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* key={period}: 期間切替時にデータ点数が大きく変わると線が不自然に変形するため、再マウントして新規描画させる */}
            <LineChart key={period} data={chartData} margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEfficiency" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis
                type="number"
                scale="time"
                dataKey="timestamp"
                stroke="#4a5568"
                fontSize={11}
                tickMargin={10}
                domain={timeDomain ?? ['auto', 'auto']}
                tickFormatter={(val) => {
                  const date = new Date(val);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                stroke="#4a5568"
                fontSize={10}
                tickMargin={6}
                domain={efficiencyAxis.domain ?? ['auto', 'auto']}
                ticks={efficiencyAxis.ticks}
                tick={averageTickRenderer(efficiencyAxis.averageTick, 2)}
              />
              <Tooltip content={<CustomEfficiencyTooltip />} cursor={{ stroke: '#4a5568', strokeWidth: 1, strokeDasharray: '3 3' }} />
              {efficiencyAxis.averageTick != null && averageEfficiency != null && (
                <ReferenceLine
                  y={efficiencyAxis.averageTick}
                  stroke="#f87171"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                />
              )}
              <Line
                type="monotone"
                dataKey="efficiency"
                stroke="#3b82f6"
                strokeWidth={4}
                dot={{ r: 5, fill: '#1e3a8a', stroke: '#3b82f6', strokeWidth: 2 }}
                activeDot={{ r: 7, fill: '#60a5fa', stroke: '#fff', strokeWidth: 2 }}
                animationDuration={500}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
