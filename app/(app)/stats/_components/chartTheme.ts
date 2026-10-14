/**
 * recharts 用の色とフォント。SVG の属性には Tailwind のクラスが効かないため、
 * app/globals.css の `@theme` と同じ値をここに写している（トークンを変えるときはここも合わせる）。
 */
export const CHART_COLORS = {
  /** 罫線（`line`） */
  grid: "#1F2934",
  /** 目盛りの文字（`sub`） */
  tick: "#8C99A8",
  /** カーソル線（`border`） */
  cursor: "#253140",
  /** 折れ線・メーター（`accent`） */
  accent: "#3AA0FF",
  /** 金額の棒（`money-dim`）と強調（`money`） */
  moneyDim: "#2B9C74",
  money: "#34D399",
  /** 平均の破線（`cost-up`） */
  average: "#FF9F7A",
  /** 最終点の縁取り（`surface`） */
  surface: "#131A22",
} as const;

/** 目盛り・軸ラベルの SVG テキストのスタイル（数字は JetBrains Mono） */
export const CHART_TICK = {
  fill: CHART_COLORS.tick,
  fontSize: 10,
  fontFamily: "var(--font-jetbrains-mono), var(--font-noto-sans-jp), monospace",
} as const;

/** ツールチップの外枠（HTML なので Tailwind のクラスで書く） */
export const CHART_TOOLTIP_CLASS = "rounded-xl border border-border bg-surface-2 px-3 py-2 shadow-lg";
