import { ImageResponse } from "next/og";
import { ACCENT, BORDER, GROUND, INK, OG_DOMAIN, PumpIcon, SUB, SURFACE, loadOgFonts } from "@/lib/og/shared";

const WIDTH = 1200;
const HEIGHT = 630;
const WORDMARK = "FuelLens";
const BADGE = "登録不要・無料";
const MONEY = "#34D399";

/** 数式の 1 要素。num は数字（等幅）、unit は単位や記号（日本語フォント）、result は結果の数字 */
export type OgFormulaPart = { text: string; kind: "num" | "unit" | "result" };

export type ToolOgImageContent = {
  title: string;
  subtitle: string;
  formula: OgFormulaPart[];
  /** 結果の色（燃費は accent、金額は money） */
  resultColor: "accent" | "money";
};

/** 公開ツールページ（/calc /gas-cost）用の 1200x630 画像。ルートの画像と同じトークン・フォント取得を使う */
export async function renderToolOgImage({ title, subtitle, formula, resultColor }: ToolOgImageContent): Promise<ImageResponse> {
  const formulaText = formula.map((p) => p.text).join("");
  const { fonts, sans, mono } = await loadOgFonts(
    `${title}${subtitle}${WORDMARK}${BADGE}${OG_DOMAIN}${formulaText}`,
    formulaText
  );
  const resultFill = resultColor === "money" ? MONEY : ACCENT;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 80px",
          background: GROUND,
          color: INK,
          fontFamily: sans,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <PumpIcon size={48} color={ACCENT} />
            <div style={{ display: "flex", marginLeft: 14, fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{WORDMARK}</div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 24px",
              fontSize: 26,
              fontWeight: 700,
              color: ACCENT,
              border: `2px solid ${ACCENT}`,
              borderRadius: 999,
            }}
          >
            {BADGE}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.2, whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 30, fontWeight: 700, color: SUB, lineHeight: 1.5, whiteSpace: "nowrap" }}>{subtitle}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              padding: "18px 32px",
              background: SURFACE,
              border: `2px solid ${BORDER}`,
              borderRadius: 24,
              whiteSpace: "nowrap",
            }}
          >
            {formula.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  fontSize: p.kind === "unit" ? 28 : 40,
                  fontFamily: p.kind === "unit" ? sans : mono,
                  fontWeight: 700,
                  color: p.kind === "result" ? resultFill : p.kind === "unit" ? SUB : INK,
                  margin: p.kind === "unit" ? "0 8px" : 0,
                }}
              >
                {p.text}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 26, fontWeight: 700, color: SUB, fontFamily: sans }}>{OG_DOMAIN}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT, fonts }
  );
}
