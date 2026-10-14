import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Section } from "@/components/ui";
import type { MonthlyCostPoint, Period } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";
import { CHART_COLORS, CHART_TICK, CHART_TOOLTIP_CLASS } from "./chartTheme";

interface MonthlyCostTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomCostTooltip({ active, payload, label }: MonthlyCostTooltipProps) {
  if (active && payload && payload.length > 0) {
    return (
      <div className={CHART_TOOLTIP_CLASS}>
        <p className="num text-xs text-sub">{label}</p>
        <p className="num mt-0.5 text-xl font-bold text-money">¥{payload[0].value.toLocaleString()}</p>
      </div>
    );
  }
  return null;
}

/** Y 軸の金額を短く表す（8000 → 8千、12000 → 1.2万） */
function formatYen(val: number): string {
  if (val >= 10000) return `${Number((val / 10000).toFixed(1))}万`;
  if (val >= 1000) return `${Number((val / 1000).toFixed(1))}千`;
  return `${val}`;
}

/** X 軸の月ラベル。"2026/9月" → "9月"。先頭と 1月 だけ年を添える（"26/1月"） */
function formatMonthTick(label: string, index: number): string {
  const [year, month] = label.split("/");
  if (!month) return label;
  return index === 0 || month === "1月" ? `${year.slice(-2)}/${month}` : month;
}

/** 月ごとの給油代（棒グラフ）。最新の月だけ明るい緑で強調する */
export default function MonthlyCostChart({ period, data }: { period: Period; data: MonthlyCostPoint[] }) {
  const lastIndex = data.length - 1;
  return (
    <Section title="月ごとの給油代">
      <div className="rounded-2xl bg-surface px-4 py-3 lg:px-5">
        <div className="relative h-40 w-full lg:h-56">
          {data.length === 0 ? (
            <ChartEmpty message="支払総額が記録された給油がありません。" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {/* key={period}: 期間切替時は再マウントして新規描画 (燃費グラフと同じ理由) */}
              <BarChart key={period} data={data} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  tickFormatter={formatMonthTick}
                />
                <YAxis
                  width={36}
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={4}
                  tickCount={4}
                  tickFormatter={formatYen}
                />
                <Tooltip content={<CustomCostTooltip />} cursor={{ fill: CHART_COLORS.grid, opacity: 0.6 }} />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500}>
                  {data.map((point, i) => (
                    <Cell key={point.key} fill={i === lastIndex ? CHART_COLORS.money : CHART_COLORS.moneyDim} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Section>
  );
}
