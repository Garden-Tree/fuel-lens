import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import type { MonthlyCostPoint, Period } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";

interface MonthlyCostTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomCostTooltip({ active, payload, label }: MonthlyCostTooltipProps) {
  if (active && payload && payload.length > 0) {
    return (
      <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-xl opacity-95">
        <p className="text-gray-400 text-xs mb-1">{label}</p>
        <p className="font-mono text-xl text-green-400 font-bold">¥{payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
}

/** 支払総額（月別）グラフ */
export default function MonthlyCostChart({ period, data }: { period: Period; data: MonthlyCostPoint[] }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-5 md:p-8">
      <h2 className="text-lg font-bold text-gray-300 mb-6 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></span>
        支払総額の推移 (円)
      </h2>
      <div className="h-64 w-full relative">
        {data.length === 0 ? (
          <ChartEmpty message="支払総額が記録された給油がありません。" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {/* key={period}: 期間切替時は再マウントして新規描画 (燃費グラフと同じ理由) */}
            <BarChart key={period} data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#4a5568"
                fontSize={11}
                tickMargin={10}
              />
              <YAxis
                stroke="#4a5568"
                fontSize={11}
                tickMargin={10}
                tickFormatter={(val) => `¥${val.toLocaleString()}`}
              />
              <Tooltip content={<CustomCostTooltip />} cursor={{ fill: '#1f2937' }} />
              <Bar
                dataKey="cost"
                fill="#22c55e"
                radius={[4, 4, 0, 0]}
                barSize={40}
                animationDuration={500}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
