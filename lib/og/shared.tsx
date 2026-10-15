import { DEFAULT_SITE_URL } from "@/lib/siteUrl";

// デザイントークン（app/globals.css）
export const GROUND = "#0B0F14";
export const SURFACE = "#131A22";
export const BORDER = "#253140";
export const LINE = "#1F2934";
export const INK = "#E8EDF3";
export const SUB = "#8C99A8";
export const ACCENT = "#3AA0FF";

/** 画像に載せるドメイン表記（本番の公開 URL から導く） */
export const OG_DOMAIN = DEFAULT_SITE_URL.replace(/^https?:\/\//, "");

export type OgFont = { name: string; data: ArrayBuffer; weight: 700; style: "normal" };

/**
 * Google Fonts の CSS API から、使う文字だけに絞ったフォントファイル（ttf）を取得する。
 * User-Agent を付けないと woff2 ではなく ttf の URL が返る（next/og は ttf / otf / woff のみ対応）。
 * 参考: https://nextjs.org/docs/app/api-reference/functions/image-response （Custom fonts / 500KB の上限）
 */
export async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer | null> {
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

/**
 * 日本語（Noto Sans JP）と数字用（JetBrains Mono）のフォントを取得する。引数は各フォントで使う文字。
 * 取得に失敗したフォントは含めず、font-family にはデフォルトのフォントを返す（画像自体は描画できる）。
 */
export async function loadOgFonts(sansText: string, monoText: string) {
  const [jp, mono] = await Promise.all([loadGoogleFont("Noto+Sans+JP", sansText), loadGoogleFont("JetBrains+Mono", monoText)]);
  const fonts: OgFont[] = [];
  if (jp) fonts.push({ name: "Noto Sans JP", data: jp, weight: 700, style: "normal" });
  if (mono) fonts.push({ name: "JetBrains Mono", data: mono, weight: 700, style: "normal" });
  return { fonts, sans: jp ? "Noto Sans JP" : "sans-serif", mono: mono ? "JetBrains Mono" : "monospace" };
}

/** components/ui/BrandMark.tsx と同じ lucide の「給油機」アイコン */
export function PumpIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5" />
      <path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16" />
      <path d="M2 21h13" />
      <path d="M3 9h11" />
    </svg>
  );
}
