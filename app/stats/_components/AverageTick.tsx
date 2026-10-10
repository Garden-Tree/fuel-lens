import type { ReactElement } from "react";

import { CHART_COLORS, CHART_TICK } from "./chartTheme";

interface TickProps {
  x: number;
  y: number;
  payload: { value: number };
}

interface AverageTickProps extends TickProps {
  /** 平均線の目盛り値（丸め済み）。null なら平均の強調なし */
  averageTick: number | null;
  /** 平均値ラベルの小数桁数 */
  digits: number;
}

/** Y 軸の目盛り。平均線の目盛りだけ平均の破線と同じ色の太字にする */
export function AverageTick({ x, y, payload, averageTick, digits }: AverageTickProps) {
  // 目盛り値・averageTick とも丸め済みなので、誤差の範囲で一致を判定する
  const isAvg = averageTick != null && Math.abs(payload.value - averageTick) < 1e-6;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      {...CHART_TICK}
      fill={isAvg ? CHART_COLORS.average : CHART_TICK.fill}
      fontWeight={isAvg ? 700 : 400}
    >
      {isAvg ? averageTick.toFixed(digits) : payload.value.toFixed(1)}
    </text>
  );
}

/** recharts の YAxis `tick` に渡す関数を作る */
export function averageTickRenderer(averageTick: number | null, digits: number) {
  const renderTick = (props: unknown): ReactElement => (
    <AverageTick {...(props as TickProps)} averageTick={averageTick} digits={digits} />
  );
  return renderTick;
}

/** 平均の破線の凡例（グラフの下に置く小さな注記） */
export function AverageLegend({ label = "平均" }: { label?: string }) {
  return (
    <p className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-sub">
      <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-cost-up" />
      {label}
    </p>
  );
}
