import { ImageResponse } from "next/og";
import { gaugeArcPath } from "@/lib/home/gauge";
import { ACCENT, BORDER, GROUND, INK, LINE, SUB, SURFACE, PumpIcon, loadOgFonts } from "@/lib/og/shared";

const WIDTH = 1200;
const HEIGHT = 630;

const HEADLINE = "写真1枚で燃費を自動記録";
const SUBLINE = "レシートとメーターを撮るだけ。満タン法で計算";
const WORDMARK = "FuelLens";
const GAUGE_NUMBER = "62.54";
const GAUGE_UNIT = "km/L";

// ホームのヒーロー（EfficiencyGauge）と同じ幾何: viewBox 300x172 の半円
const GEOMETRY = { cx: 150, cy: 144, r: 110 };
const TRACK = gaugeArcPath(1, GEOMETRY) ?? "";
const VALUE_ARC = gaugeArcPath(0.68, GEOMETRY) ?? "";

/** /opengraph-image と /twitter-image 共通の 1200x630 画像を返す。フォント取得に失敗してもデフォルトフォントで描画する */
export async function renderOgImage(): Promise<ImageResponse> {
  const { fonts, sans, mono } = await loadOgFonts(`${HEADLINE}${SUBLINE}${WORDMARK}`, `${GAUGE_NUMBER}${GAUGE_UNIT}`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 80px",
          background: GROUND,
          color: INK,
          fontFamily: sans,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 44 }}>
            <PumpIcon size={56} color={ACCENT} />
            <div style={{ display: "flex", marginLeft: 16, fontSize: 48, fontWeight: 700, letterSpacing: -1 }}>{WORDMARK}</div>
          </div>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700, lineHeight: 1.25, whiteSpace: "nowrap" }}>{HEADLINE}</div>
          <div style={{ display: "flex", marginTop: 28, fontSize: 27, whiteSpace: "nowrap", fontWeight: 700, color: SUB, lineHeight: 1.5 }}>{SUBLINE}</div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 380,
            height: 360,
            background: SURFACE,
            border: `2px solid ${BORDER}`,
            borderRadius: 32,
          }}
        >
          <svg width={340} height={195} viewBox="0 0 300 172">
            <path d={TRACK} fill="none" stroke={LINE} strokeWidth={14} strokeLinecap="round" />
            <path d={VALUE_ARC} fill="none" stroke={ACCENT} strokeWidth={14} strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", marginTop: -88, fontSize: 64, fontWeight: 700, fontFamily: mono, color: INK }}>{GAUGE_NUMBER}</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 28, fontWeight: 700, fontFamily: mono, color: SUB }}>{GAUGE_UNIT}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts }
  );
}
