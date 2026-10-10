import type { ReactElement } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Period, StatsModel } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";
import { AverageLegend, averageTickRenderer } from "./AverageTick";
import { CHART_COLORS, CHART_TICK, CHART_TOOLTIP_CLASS } from "./chartTheme";

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
    const parts = data.name.split("-");
    if (parts.length === 3) {
      formattedDate = `${parts[0]}/${parseInt(parts[1])}/${parseInt(parts[2])}`;
    }
    return (
      <div className={CHART_TOOLTIP_CLASS}>
        <p className="num text-xs text-sub">{formattedDate}</p>
        <p className="mt-0.5">
          <span className="num text-xl font-bold text-ink">{payload[0].value.toFixed(2)}</span>
          <span className="text-[13px] text-sub"> km/L</span>
        </p>
        <p className="mt-1 max-w-[150px] truncate text-xs text-sub">{data.gasStation}</p>
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

/** 燃費の推移グラフ（ヒーローカードの中に置く。面は親が持つ）。面グラデーション＋折れ線＋平均の破線＋最終点の強調 */
export default function EfficiencyChart({ period, efficiency, averageEfficiency }: EfficiencyChartProps) {
  const { series: chartData, axis: efficiencyAxis, timeDomain } = efficiency;
  const lastIndex = chartData.length - 1;
  const averageTick = efficiencyAxis.averageTick;
  const showAverage = averageTick != null && averageEfficiency != null;

  // 最終点だけ丸を描く（他の点は線だけで表す）
  const renderDot = (props: unknown): ReactElement => {
    const { cx, cy, index } = props as { cx?: number; cy?: number; index: number };
    if (index !== lastIndex || cx == null || cy == null) return <g key={`dot-${index}`} />;
    return (
      <circle key={`dot-${index}`} cx={cx} cy={cy} r={5} fill={CHART_COLORS.accent} stroke={CHART_COLORS.surface} strokeWidth={2} />
    );
  };

  return (
    <div>
      <div className="relative h-44 w-full lg:h-64">
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
            <AreaChart key={period} data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="statsEfficiencyArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={CHART_COLORS.accent} stopOpacity={0.28} />
                  <stop offset="1" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                type="number"
                scale="time"
                dataKey="timestamp"
                tick={CHART_TICK}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                domain={timeDomain ?? ["auto", "auto"]}
                tickFormatter={val => {
                  const date = new Date(val);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis
                width={38}
                axisLine={false}
                tickLine={false}
                tickMargin={4}
                domain={efficiencyAxis.domain ?? ["auto", "auto"]}
                ticks={efficiencyAxis.ticks}
                tick={averageTickRenderer(averageTick, 2)}
              />
              <Tooltip content={<CustomEfficiencyTooltip />} cursor={{ stroke: CHART_COLORS.cursor, strokeWidth: 1 }} />
              {showAverage && (
                <ReferenceLine y={averageTick} stroke={CHART_COLORS.average} strokeDasharray="4 4" strokeWidth={1.5} />
              )}
              <Area
                type="monotone"
                dataKey="efficiency"
                stroke={CHART_COLORS.accent}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="url(#statsEfficiencyArea)"
                dot={renderDot}
                activeDot={{ r: 5, fill: CHART_COLORS.accent, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {chartData.length >= 2 && showAverage && <AverageLegend />}
    </div>
  );
}
