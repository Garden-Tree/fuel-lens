/**
 * ホーム画面の燃費メーター（半円ゲージ）の目盛りと座標（純粋関数）。
 *
 * - gaugeScaleOf: 燃費の一覧から、ゲージの下限・上限（きりのよい整数）を決める
 * - gaugeFraction: 値がゲージのどの位置か（0 = 左端、1 = 右端）
 * - gaugePoint / gaugeArcPath: SVG 上の座標と、左端から値までの円弧の path
 */

export type GaugeScale = { min: number; max: number };

/** 燃費が 1 件も無いときの目盛り（km/L） */
export const DEFAULT_GAUGE_SCALE: GaugeScale = { min: 0, max: 20 };

/**
 * 燃費（km/L）の一覧からゲージの下限・上限を決める。
 * - 正の有限値だけを使う（null・0・NaN は無視）
 * - 最小〜最大の幅の 15%（最低 0.5 km/L）を上下に足し、下限は切り捨て・上限は切り上げの整数にする
 * - 1 件だけ（または全件同じ値）のときは値の 20%（最低 2 km/L）を上下に足す
 * - 1 件も無ければ DEFAULT_GAUGE_SCALE。下限は 0 未満にしない
 */
export function gaugeScaleOf(values: ReadonlyArray<number | null | undefined>): GaugeScale {
  const list = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (list.length === 0) return { ...DEFAULT_GAUGE_SCALE };
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  const span = hi - lo;
  const pad = span > 0 ? Math.max(span * 0.15, 0.5) : Math.max(hi * 0.2, 2);
  const min = Math.max(0, Math.floor(lo - pad));
  let max = Math.ceil(hi + pad);
  if (max <= min) max = min + 1;
  return { min, max };
}

/** 値のゲージ上の位置（0〜1 に収める）。値が数値でなければ 0 */
export function gaugeFraction(value: number | null | undefined, scale: GaugeScale): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const width = scale.max - scale.min;
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (value - scale.min) / width));
}

/** 半円ゲージの形（SVG の座標）。中心 (cx, cy)、半径 r。左端が 0、真上が 0.5、右端が 1 */
export type GaugeGeometry = { cx: number; cy: number; r: number };

/** fraction の位置の座標（半径 r を上書きできる。目盛り線・ラベルの位置に使う） */
export function gaugePoint(fraction: number, geometry: GaugeGeometry, r: number = geometry.r): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, fraction));
  const angle = Math.PI * (1 - f);
  return {
    x: round1(geometry.cx + r * Math.cos(angle)),
    y: round1(geometry.cy - r * Math.sin(angle)),
  };
}

/** 左端から fraction の位置までの円弧（時計回り）の path。fraction が 0 なら null */
export function gaugeArcPath(fraction: number, geometry: GaugeGeometry): string | null {
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= 0) return null;
  const start = gaugePoint(0, geometry);
  const end = gaugePoint(f, geometry);
  return `M${start.x},${start.y} A${geometry.r},${geometry.r} 0 0 1 ${end.x},${end.y}`;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
