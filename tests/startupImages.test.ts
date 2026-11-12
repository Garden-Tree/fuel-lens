import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { metadata } from "@/app/layout";
import { STARTUP_DEVICES, startupImageFileName } from "@/lib/startupImages";

// app/layout.tsx の metadata だけを見る。next/font は Next のビルド時変換が前提なので、テストでは差し替える
vi.mock("next/font/google", () => ({ JetBrains_Mono: () => ({ variable: "" }) }));

const MEDIA =
  /^screen and \(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: portrait\)$/;

function startupImageList(): { url: string; media?: string }[] {
  const apple = metadata.appleWebApp;
  if (!apple || typeof apple !== "object") throw new Error("appleWebApp がない");
  const list = apple.startupImage;
  if (!Array.isArray(list)) throw new Error("startupImage が配列でない");
  return list.map((s) => (typeof s === "string" ? { url: s } : s));
}

describe("iOS の起動画像（apple-touch-startup-image）", () => {
  it("一覧の各端末が metadata の startupImage に 1 つずつ対応し、media の形式が正しい", () => {
    const list = startupImageList();
    expect(list).toHaveLength(STARTUP_DEVICES.length);
    for (const d of STARTUP_DEVICES) {
      const matches = list.filter((s) => s.url === `/splash/${startupImageFileName(d)}`);
      expect(matches, d.name).toHaveLength(1);
      const m = MEDIA.exec(matches[0].media ?? "");
      expect(m, d.name).not.toBeNull();
      expect([Number(m![1]), Number(m![2]), Number(m![3])]).toEqual([d.width, d.height, d.dpr]);
    }
  });

  it("media クエリが重複しない（端末を一意に指す）", () => {
    const medias = startupImageList().map((s) => s.media);
    expect(new Set(medias).size).toBe(medias.length);
  });

  it("public/splash/ に対応する PNG がある", () => {
    for (const d of STARTUP_DEVICES) {
      const file = path.join(process.cwd(), "public", "splash", startupImageFileName(d));
      expect(existsSync(file), file).toBe(true);
    }
  });
});
