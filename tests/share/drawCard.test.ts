import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShareCardModel } from "@/lib/share/card";
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, drawShareCard, fitText } from "@/lib/share/drawCard";

const MODEL: ShareCardModel = {
  kind: "month",
  periodLabel: "2026年10月",
  periodPhrase: "今月",
  vehicleName: "プリウス",
  efficiency: 62.54,
  efficiencyText: "62.54",
  stats: [
    { label: "給油", value: "3", unit: "回" },
    { label: "走行", value: "1,234", unit: "km" },
    { label: "給油代", value: "¥12,345", unit: "" },
  ],
  statsLine: "給油 3回・走行 1,234 km・給油代 ¥12,345",
  scale: { min: 50, max: 70 },
  fraction: 0.627,
  filename: "fuellens-2026-10.png",
};

const FONTS = { sans: "TestSans", mono: "TestMono" };

/** 呼び出しを記録するだけの 2D コンテキスト（文字幅は 1 文字 = フォントサイズの 0.6 倍） */
function mockContext() {
  const texts: { text: string; font: string; fill: string }[] = [];
  const arcs: number[][] = [];
  const state = { font: "10px sans-serif", fillStyle: "#000" as unknown };
  const ctx = {
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: unknown) {
      state.fillStyle = v;
    },
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: vi.fn(),
    fillText: vi.fn((text: string) => texts.push({ text, font: state.font, fill: String(state.fillStyle) })),
    measureText: vi.fn((text: string) => {
      const size = Number(/(\d+)px/.exec(state.font)?.[1] ?? 10);
      return { width: Array.from(text).length * size * 0.6 };
    }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    arc: vi.fn((...args: number[]) => arcs.push(args)),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, arcs, raw: ctx };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("drawShareCard", () => {
  it("期間・車両・燃費・補足の数値・URL を描き、背景を全面に塗る", () => {
    vi.stubGlobal(
      "Path2D",
      class {
        constructor(public d: string) {}
      }
    );
    const { ctx, texts, arcs, raw } = mockContext();
    drawShareCard(ctx, MODEL, FONTS);

    expect(raw.fillRect).toHaveBeenCalledWith(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
    const all = texts.map(t => t.text);
    expect(all).toEqual(
      expect.arrayContaining([
        "FuelLens",
        "2026年10月の燃費",
        "プリウス",
        "給油",
        "3",
        "回",
        "走行",
        "1,234",
        "km",
        "給油代",
        "¥12,345",
        "62.54",
        "km/L",
        "50",
        "70",
        "fuel-lens.gadelog.com",
      ])
    );
    // 燃費は数字のフォント（mono）、見出しは日本語のフォント（sans）
    expect(texts.find(t => t.text === "62.54")?.font).toMatch(/^700 \d+px TestMono$/);
    expect(texts.find(t => t.text === "2026年10月の燃費")?.font).toContain("TestSans");
    // ロゴのアイコン（Path2D）を 4 本描く
    expect(raw.stroke.mock.calls.filter(c => c.length === 1)).toHaveLength(4);
    // ゲージ: 下地の半円と、値までの円弧（左端 π から π × (1 + fraction)）
    expect(arcs[0].slice(3, 5)).toEqual([Math.PI, Math.PI * 2]);
    expect(arcs[1][4]).toBeCloseTo(Math.PI * 1.627);
  });

  it("車両名が無ければ描かず、長い燃費の数字は縮めて収める", () => {
    const { ctx, texts } = mockContext();
    drawShareCard(ctx, { ...MODEL, vehicleName: null, efficiencyText: "123.45", fraction: 0 }, FONTS);
    expect(texts.map(t => t.text)).not.toContain("プリウス");
    const size = Number(/(\d+)px/.exec(texts.find(t => t.text === "123.45")!.font)![1]);
    expect(size * 0.6 * 6).toBeLessThanOrEqual(252);
  });
});

describe("fitText", () => {
  it("幅に収まらなければ末尾を「…」で切る", () => {
    const ctx = { measureText: (t: string) => ({ width: Array.from(t).length * 10 }) } as unknown as CanvasRenderingContext2D;
    expect(fitText(ctx, "ABCDE", 50)).toBe("ABCDE");
    expect(fitText(ctx, "ABCDEFGH", 50)).toBe("ABCD…");
  });
});
