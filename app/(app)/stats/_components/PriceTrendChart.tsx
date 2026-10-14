import type { ReactElement } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Section } from "@/components/ui";
import { formatPricePerUnit } from "@/lib/calculations";
import { formatDateLabel, formatPriceDiff } from "@/lib/format";
import type { Period, PricePoint, StatsModel } from "@/lib/stats";
import ChartEmpty from "./ChartEmpty";
import { AverageLegend, averageTickRenderer, visibleAxisTicks } from "./AverageTick";
import { CHART_COLORS, CHART_TICK, CHART_TOOLTIP_CLASS } from "./chartTheme";

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
      <div className={CHART_TOOLTIP_CLASS}>
        <p className="num text-xs text-sub">{`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`}</p>
        <p className="mt-0.5">
          <span className="num text-xl font-bold text-ink">¥{formatPricePerUnit(data.price)}</span>
          <span className="text-[13px] text-sub"> /L</span>
        </p>
        <p className="mt-1 max-w-[180px] truncate text-xs text-sub">{data.station ?? "スタンド不明"}</p>
      </div>
    );
  }
  return null;
}

/** 単価の差の色。値上がりは `cost-up`、値下がりは `up`、変わらなければ `sub`（0.1 円未満は変わらない扱い） */
function diffToneClass(diff: number): string {
  const rounded = Math.round(diff * 10) / 10;
  if (rounded > 0) return "text-cost-up";
  if (rounded < 0) return "text-up";
  return "text-sub";
}

/** 「前回比 +1.0」のような小さなチップ */
function DiffChip({ label, diff, title }: { label: string; diff: number; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs text-sub">
      {label}
      <span className={`num font-bold ${diffToneClass(diff)}`}>{formatPriceDiff(diff)}</span>
    </span>
  );
}

/** 単価の推移グラフと、最新の給油の前回比・30日/90日平均比 */
export default function PriceTrendChart({ period, price }: { period: Period; price: StatsModel["price"] }) {
  const { series: priceData, axis: priceAxis, timeDomain: priceTimeDomain, delta: latestPriceDelta } = price;
  const lastIndex = priceData.length - 1;

  // 最終点だけ丸を描く（他の点は線だけで表す）
  const renderDot = (props: unknown): ReactElement => {
    const { cx, cy, index } = props as { cx?: number; cy?: number; index: number };
    if (index !== lastIndex || cx == null || cy == null) return <g key={`dot-${index}`} />;
    return (
      <circle key={`dot-${index}`} cx={cx} cy={cy} r={5} fill={CHART_COLORS.accent} stroke={CHART_COLORS.surface} strokeWidth={2} />
    );
  };

  return (
    <Section title="単価の推移">
      <div className="rounded-2xl bg-surface px-4 py-3 lg:px-5">
        {latestPriceDelta.latest && (
          <div className="mb-3 flex flex-col gap-2">
            <p>
              <span className="text-xs text-sub">最新 </span>
              <span className="num text-xl font-bold">¥{formatPricePerUnit(latestPriceDelta.latest.price)}</span>
              <span className="text-[13px] text-sub"> /L</span>
              <span className="num text-xs text-sub">（{formatDateLabel(latestPriceDelta.latest.date)}）</span>
            </p>
            <p className="flex flex-wrap gap-1.5">
              {latestPriceDelta.diffFromPrevious != null && (
                <DiffChip label="前回比" diff={latestPriceDelta.diffFromPrevious} />
              )}
              {latestPriceDelta.diffFromAvg30 != null && (
                <DiffChip
                  label="30日平均比"
                  diff={latestPriceDelta.diffFromAvg30}
                  title="最新の給油日から遡って30日以内の、ほかの給油の単価の平均との差"
                />
              )}
              {latestPriceDelta.diffFromAvg90 != null && (
                <DiffChip
                  label="90日平均比"
                  diff={latestPriceDelta.diffFromAvg90}
                  title="最新の給油日から遡って90日以内の、ほかの給油の単価の平均との差"
                />
              )}
            </p>
          </div>
        )}
        <div className="relative h-40 w-full lg:h-56">
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
              <LineChart key={period} data={priceData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis
                  type="number"
                  scale="time"
                  dataKey="timestamp"
                  tick={CHART_TICK}
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  minTickGap={20}
                  domain={priceTimeDomain ?? ["auto", "auto"]}
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
                  domain={priceAxis.domain ?? ["auto", "auto"]}
                  ticks={visibleAxisTicks(priceAxis)}
                  interval={0}
                  tick={averageTickRenderer(priceAxis.averageTick, 1)}
                />
                <Tooltip content={<CustomPriceTooltip />} cursor={{ stroke: CHART_COLORS.cursor, strokeWidth: 1 }} />
                {priceAxis.averageTick != null && (
                  <ReferenceLine y={priceAxis.averageTick} stroke={CHART_COLORS.average} strokeDasharray="4 4" strokeWidth={1.5} />
                )}
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={CHART_COLORS.accent}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={renderDot}
                  activeDot={{ r: 5, fill: CHART_COLORS.accent, stroke: CHART_COLORS.surface, strokeWidth: 2 }}
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        {priceData.length >= 2 && priceAxis.averageTick != null && <AverageLegend />}
      </div>
    </Section>
  );
}
