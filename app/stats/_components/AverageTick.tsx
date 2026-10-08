import type { ReactElement } from "react";

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

/** Y 軸の目盛り。平均線の目盛りだけ赤の太字で「平均 n」と表示する */
export function AverageTick({ x, y, payload, averageTick, digits }: AverageTickProps) {
  // 目盛り値・averageTick とも丸め済みなので、誤差の範囲で一致を判定する
  const isAvg = averageTick != null && Math.abs(payload.value - averageTick) < 1e-6;
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill={isAvg ? "#f87171" : "#4a5568"}
      fontSize={isAvg ? 10 : 11}
      fontWeight={isAvg ? "bold" : "normal"}
    >
      {isAvg ? `平均 ${averageTick.toFixed(digits)}` : payload.value.toFixed(1)}
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
