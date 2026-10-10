import { gaugeArcPath, gaugeFraction, gaugePoint, type GaugeGeometry, type GaugeScale } from "@/lib/home/gauge";

/** viewBox 0 0 300 172 の半円。左端 (40,144)・右端 (260,144)・頂点 (150,34) */
const GEOMETRY: GaugeGeometry = { cx: 150, cy: 144, r: 110 };
const TRACK = gaugeArcPath(1, GEOMETRY) as string;

export type EfficiencyGaugeProps = {
  /** 燃費（km/L）。null なら針（円弧）を出さず、中央に reason を出す */
  value: number | null;
  /** 燃費が無い理由（例: 「部分給油（次の満タンで計算）」） */
  reason?: string | null;
  /** 平均燃費。null なら平均の目盛りを出さない */
  average: number | null;
  scale: GaugeScale;
};

/** 「部分給油（次の満タンで計算）」→ ["部分給油", "次の満タンで計算"] */
function splitReason(reason: string): [string, string | null] {
  const m = /^(.+?)（(.+)）$/.exec(reason);
  return m ? [m[1], m[2]] : [reason, null];
}

/**
 * 燃費の半円メーター（D デザインのヒーロー）。目盛りは lib/home/gauge.ts。
 * 円弧はアクセント色、平均は白い目盛り線と「平均」のラベル、両端に下限・上限。中央に値（num）と km/L。
 */
export default function EfficiencyGauge({ value, reason, average, scale }: EfficiencyGaugeProps) {
  const valuePath = value !== null ? gaugeArcPath(gaugeFraction(value, scale), GEOMETRY) : null;
  const avgFraction = average !== null ? gaugeFraction(average, scale) : null;
  const tickInner = avgFraction !== null ? gaugePoint(avgFraction, GEOMETRY, 96) : null;
  const tickOuter = avgFraction !== null ? gaugePoint(avgFraction, GEOMETRY, 124) : null;
  const tickLabel = avgFraction !== null ? gaugePoint(avgFraction, GEOMETRY, 136) : null;
  const [reasonMain, reasonSub] = reason ? splitReason(reason) : ["", null];

  const label =
    value !== null
      ? `燃費メーター。${value.toFixed(2)} km/L${average !== null ? `、平均 ${average.toFixed(2)} km/L` : ""}`
      : `燃費メーター。${reason ?? "燃費なし"}`;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 300 172"
      className="h-auto w-full max-w-[300px] lg:max-w-[340px]"
    >
      <path d={TRACK} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-line" />
      {valuePath && <path d={valuePath} fill="none" strokeWidth={14} strokeLinecap="round" className="stroke-accent" />}
      {tickInner && tickOuter && tickLabel && (
        <>
          <line
            x1={tickInner.x}
            y1={tickInner.y}
            x2={tickOuter.x}
            y2={tickOuter.y}
            strokeWidth={2.5}
            strokeLinecap="round"
            className="stroke-ink"
          />
          <text x={tickLabel.x} y={tickLabel.y} textAnchor="middle" dominantBaseline="middle" fontSize={11} className="fill-sub">
            平均
          </text>
        </>
      )}
      <text x={40} y={166} textAnchor="middle" fontSize={11} className="num fill-sub">
        {scale.min}
      </text>
      <text x={260} y={166} textAnchor="middle" fontSize={11} className="num fill-sub">
        {scale.max}
      </text>

      {value !== null ? (
        <>
          <text x={150} y={124} textAnchor="middle" fontSize={52} fontWeight={700} className="num fill-ink">
            {value.toFixed(2)}
          </text>
          <text x={150} y={148} textAnchor="middle" fontSize={13} className="fill-sub">
            km/L
          </text>
        </>
      ) : (
        <>
          <text x={150} y={reasonSub ? 116 : 126} textAnchor="middle" fontSize={24} fontWeight={700} className={reasonSub ? "fill-warn" : "fill-sub"}>
            {reasonMain || "--.--"}
          </text>
          {reasonSub && (
            <text x={150} y={142} textAnchor="middle" fontSize={13} className="fill-sub">
              {reasonSub}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
