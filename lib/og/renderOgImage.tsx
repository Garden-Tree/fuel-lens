import { ImageResponse } from "next/og";
import { gaugeArcPath } from "@/lib/home/gauge";

const WIDTH = 1200;
const HEIGHT = 630;

// デザイントークン（app/globals.css）
const GROUND = "#0B0F14";
const SURFACE = "#131A22";
const BORDER = "#253140";
const LINE = "#1F2934";
const INK = "#E8EDF3";
const SUB = "#8C99A8";
const ACCENT = "#3AA0FF";

const HEADLINE = "写真1枚で燃費を自動記録";
const SUBLINE = "レシートとメーターを撮るだけ。満タン法で計算";
const WORDMARK = "FuelLens";
const GAUGE_NUMBER = "62.54";
const GAUGE_UNIT = "km/L";

type OgFont = { name: string; data: ArrayBuffer; weight: 700; style: "normal" };

/**
 * Google Fonts の CSS API から、使う文字だけに絞ったフォントファイル（ttf）を取得する。
 * User-Agent を付けないと woff2 ではなく ttf の URL が返る（next/og は ttf / otf / woff のみ対応）。
 * 参考: https://nextjs.org/docs/app/api-reference/functions/image-response （Custom fonts / 500KB の上限）
 */
async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl, { signal: AbortSignal.timeout(5000) })).text();
    const match = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css);
    if (!match) return null;
    const res = await fetch(match[1], { signal: AbortSignal.timeout(5000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch (error) {
    console.error("OG 画像のフォント取得に失敗しました:", error);
    return null;
  }
}

async function loadFonts(): Promise<OgFont[]> {
  const [jp, mono] = await Promise.all([
    loadGoogleFont("Noto+Sans+JP", `${HEADLINE}${SUBLINE}${WORDMARK}`),
    loadGoogleFont("JetBrains+Mono", `${GAUGE_NUMBER}${GAUGE_UNIT}`),
  ]);
  const fonts: OgFont[] = [];
  if (jp) fonts.push({ name: "Noto Sans JP", data: jp, weight: 700, style: "normal" });
  if (mono) fonts.push({ name: "JetBrains Mono", data: mono, weight: 700, style: "normal" });
  return fonts;
}

/** components/ui/BrandMark.tsx と同じ lucide の「給油機」アイコン */
function PumpIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5" />
      <path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16" />
      <path d="M2 21h13" />
      <path d="M3 9h11" />
    </svg>
  );
}

// ホームのヒーロー（EfficiencyGauge）と同じ幾何: viewBox 300x172 の半円
const GEOMETRY = { cx: 150, cy: 144, r: 110 };
const TRACK = gaugeArcPath(1, GEOMETRY) ?? "";
const VALUE_ARC = gaugeArcPath(0.68, GEOMETRY) ?? "";

/** /opengraph-image と /twitter-image 共通の 1200x630 画像を返す。フォント取得に失敗してもデフォルトフォントで描画する */
export async function renderOgImage(): Promise<ImageResponse> {
  const fonts = await loadFonts();
  const sans = fonts.some((f) => f.name === "Noto Sans JP") ? "Noto Sans JP" : "sans-serif";
  const mono = fonts.some((f) => f.name === "JetBrains Mono") ? "JetBrains Mono" : "monospace";

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
