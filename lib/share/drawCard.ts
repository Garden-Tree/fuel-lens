/**
 * シェアカード（1200×630 の PNG）をブラウザの <canvas> で描く。サーバーには何も送らない。
 *
 * - drawShareCard: 2D コンテキストに描くだけ（テストではモックのコンテキストで呼ぶ）
 * - renderShareCardBlob: canvas を作り、数字のフォント（JetBrains Mono）の読み込みを待ってから描いて PNG にする
 *
 * 色はデザイントークン（app/globals.css）と同じ値。canvas にはクラスが効かないため複製している（OG 画像 lib/og/renderOgImage.tsx と同じ）。
 * 日本語は端末のフォント（--font-sans）、数字は --font-jetbrains-mono（next/font が <html> に定義）を使う。
 */

import { SHARE_CARD_DOMAIN, type ShareCardModel } from "./card";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;

const GROUND = "#0B0F14";
const SURFACE = "#131A22";
const BORDER = "#253140";
const LINE = "#1F2934";
const INK = "#E8EDF3";
const SUB = "#8C99A8";
const ACCENT = "#3AA0FF";
const MONEY = "#34D399";

/** --font-sans が読めないときの日本語フォント（app/globals.css と同じ並び） */
export const FALLBACK_SANS =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", "Yu Gothic UI", Meiryo, system-ui, sans-serif';
/** --font-jetbrains-mono が読めないときの数字のフォント */
export const FALLBACK_MONO = '"JetBrains Mono", ui-monospace, monospace';

export type ShareCardFonts = { sans: string; mono: string };

/** components/ui/BrandMark.tsx と同じ lucide の「給油機」アイコン（24×24） */
const PUMP_ICON_PATHS = [
  "M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5",
  "M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16",
  "M2 21h13",
  "M3 9h11",
];

const PAD = 80;
const LEFT_WIDTH = 560;
// 右のパネルと半円ゲージ（ホームのヒーロー EfficiencyGauge と同じく左端 0・真上 0.5・右端 1）
const PANEL = { x: 700, y: 72, w: 420, h: 400, r: 32 };
const GAUGE = { cx: 910, cy: 372, r: 160, width: 22 };
const NUMBER_MAX_WIDTH = 252;

type Ctx = CanvasRenderingContext2D;

function font(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

/** maxWidth に収まるよう末尾を「…」で切る */
export function fitText(ctx: Pick<Ctx, "measureText">, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPumpIcon(ctx: Ctx, x: number, y: number, size: number) {
  if (typeof Path2D === "undefined") return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of PUMP_ICON_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function drawGauge(ctx: Ctx, model: ShareCardModel, fonts: ShareCardFonts) {
  const { cx, cy, r, width } = GAUGE;
  ctx.lineCap = "round";
  ctx.lineWidth = width;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
  ctx.stroke();
  if (model.fraction > 0) {
    ctx.strokeStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * (1 + model.fraction));
    ctx.stroke();
  }

  // 両端の目盛り（下限・上限）
  ctx.fillStyle = SUB;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(500, 22, fonts.mono);
  ctx.fillText(String(model.scale.min), cx - r, cy + 46);
  ctx.fillText(String(model.scale.max), cx + r, cy + 46);

  // 燃費（大きな数字。収まらなければ小さくする）
  let size = 84;
  ctx.font = font(700, size, fonts.mono);
  while (size > 40 && ctx.measureText(model.efficiencyText).width > NUMBER_MAX_WIDTH) {
    size -= 4;
    ctx.font = font(700, size, fonts.mono);
  }
  ctx.fillStyle = INK;
  ctx.fillText(model.efficiencyText, cx, cy - 14);
  ctx.fillStyle = SUB;
  ctx.font = font(500, 26, fonts.mono);
  ctx.fillText("km/L", cx, cy + 24);
}

/** 2D コンテキストにシェアカードを描く（1200×630） */
export function drawShareCard(ctx: Ctx, model: ShareCardModel, fonts: ShareCardFonts): void {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  // ロゴとワードマーク
  drawPumpIcon(ctx, PAD, 72, 56);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = font(700, 44, fonts.sans);
  ctx.fillText("FuelLens", PAD + 72, 116);

  // 期間と車両
  ctx.font = font(700, 46, fonts.sans);
  ctx.fillText(fitText(ctx, `${model.periodLabel}の燃費`, LEFT_WIDTH), PAD, 250);
  if (model.vehicleName) {
    ctx.fillStyle = SUB;
    ctx.font = font(500, 30, fonts.sans);
    ctx.fillText(fitText(ctx, model.vehicleName, LEFT_WIDTH), PAD, 304);
  }

  // 補足の数値（見出し + 数字 + 単位を左から並べる）
  let x = PAD;
  for (const stat of model.stats) {
    ctx.fillStyle = SUB;
    ctx.font = font(500, 24, fonts.sans);
    ctx.fillText(stat.label, x, 404);
    const labelEnd = x + ctx.measureText(stat.label).width;
    ctx.font = font(700, 40, fonts.mono);
    ctx.fillStyle = stat.label === "給油代" ? MONEY : INK;
    ctx.fillText(stat.value, x, 456);
    let end = x + ctx.measureText(stat.value).width;
    if (stat.unit) {
      ctx.fillStyle = SUB;
      ctx.font = font(500, 24, fonts.sans);
      const unitX = end + 6;
      ctx.fillText(stat.unit, unitX, 456);
      end = unitX + ctx.measureText(stat.unit).width;
    }
    x = Math.max(end, labelEnd) + 44;
  }

  // 右のパネルとゲージ
  ctx.fillStyle = SURFACE;
  roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, PANEL.r);
  ctx.fill();
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = SUB;
  ctx.textAlign = "center";
  ctx.font = font(500, 24, fonts.sans);
  ctx.fillText("満タン法の平均燃費", PANEL.x + PANEL.w / 2, PANEL.y + 58);
  drawGauge(ctx, model, fonts);

  // 下段: キャッチコピー（左）と URL（右）
  ctx.textAlign = "left";
  ctx.fillStyle = SUB;
  ctx.font = font(500, 24, fonts.sans);
  ctx.fillText("写真1枚で燃費を自動記録", PAD, 566);
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = font(700, 26, fonts.mono);
  ctx.fillText(SHARE_CARD_DOMAIN, PANEL.x + PANEL.w, 566);
}

/** ページの CSS 変数から、canvas で使うフォントの並びを読む（読めなければ既定の並び） */
export function readShareCardFonts(): ShareCardFonts {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") {
    return { sans: FALLBACK_SANS, mono: FALLBACK_MONO };
  }
  const style = getComputedStyle(document.documentElement);
  const sans = style.getPropertyValue("--font-sans").trim();
  const mono = style.getPropertyValue("--font-jetbrains-mono").trim();
  return {
    sans: sans || FALLBACK_SANS,
    mono: mono ? `${mono}, ui-monospace, monospace` : FALLBACK_MONO,
  };
}

/** 数字のフォント（Web フォント）の読み込みを待つ。失敗・時間切れ（3 秒）でもそのまま描く */
async function waitForFonts(fonts: ShareCardFonts, text: string): Promise<void> {
  const set = typeof document !== "undefined" ? document.fonts : undefined;
  if (!set || typeof set.load !== "function") return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, 3000);
  });
  try {
    await Promise.race([
      Promise.all([set.load(font(700, 84, fonts.mono), text), set.load(font(500, 26, fonts.mono), "km/L")]),
      timeout,
    ]);
  } catch (error) {
    console.error("シェア画像のフォントの読み込みに失敗しました:", error);
  } finally {
    clearTimeout(timer);
  }
}

/** シェアカードを描いて PNG の Blob にする（ブラウザ専用）。描けなければ例外 */
export async function renderShareCardBlob(model: ShareCardModel): Promise<Blob> {
  const fonts = readShareCardFonts();
  await waitForFonts(fonts, `${model.efficiencyText}${model.stats.map(s => s.value).join("")}${SHARE_CARD_DOMAIN}`);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context is not available");
  drawShareCard(ctx, model, fonts);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("canvas.toBlob returned null"))), "image/png");
  });
}
