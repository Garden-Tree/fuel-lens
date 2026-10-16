import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isIosDevice, nextViewportContent, withMaxScaleOne } from "@/lib/iosViewport";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const BASE = "width=device-width, initial-scale=1, viewport-fit=cover";

describe("isIosDevice", () => {
  it("iPhone / iPad / iPod の UA は iOS", () => {
    expect(isIosDevice(IPHONE, "iPhone", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPad; CPU OS 17_0)", "iPad", 5)).toBe(true);
    expect(isIosDevice("Mozilla/5.0 (iPod touch)", "iPod", 5)).toBe(true);
  });
  it("iPadOS（MacIntel でタッチ対応）は iOS、タッチのない Mac は違う", () => {
    expect(isIosDevice(MAC, "MacIntel", 5)).toBe(true);
    expect(isIosDevice(MAC, "MacIntel", 0)).toBe(false);
  });
  it("Android は iOS ではない", () => {
    expect(isIosDevice(ANDROID, "Linux armv8l", 5)).toBe(false);
  });
});

describe("withMaxScaleOne", () => {
  it("maximum-scale=1 を末尾に足す", () => {
    expect(withMaxScaleOne(BASE)).toBe(`${BASE}, maximum-scale=1`);
  });
  it("冪等で、重複して足さない", () => {
    const once = withMaxScaleOne(BASE);
    expect(withMaxScaleOne(once)).toBe(once);
    expect(once.match(/maximum-scale/g)).toHaveLength(1);
  });
  it("既に別の値の maximum-scale があれば触らない", () => {
    expect(withMaxScaleOne("width=device-width,maximum-scale=5")).toBe("width=device-width,maximum-scale=5");
  });
  it("空や末尾カンマでも壊れない", () => {
    expect(withMaxScaleOne("")).toBe("maximum-scale=1");
    expect(withMaxScaleOne("width=device-width,")).toBe("width=device-width, maximum-scale=1");
  });
});

describe("nextViewportContent", () => {
  it("iOS では更新後の content を返す", () => {
    expect(nextViewportContent(BASE, { userAgent: IPHONE, platform: "iPhone", maxTouchPoints: 5 })).toBe(
      `${BASE}, maximum-scale=1`,
    );
  });
  it("Android では null（ピンチズームを塞がない）", () => {
    expect(nextViewportContent(BASE, { userAgent: ANDROID, platform: "Linux armv8l", maxTouchPoints: 5 })).toBeNull();
  });
});

describe("モバイルの入力欄は 16px 以上（iOS の自動ズーム対策）", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("非表示のファイル入力に text-base が付いている", () => {
    for (const p of [
      "app/(app)/app/_components/ScanPanel.tsx",
      "app/(app)/app/_components/TwoPhotoScanSheet.tsx",
      "components/BackupPanel.tsx",
      "components/ImportPanel.tsx",
    ]) {
      const src = read(p);
      expect(src, p).not.toMatch(/className="hidden"/);
      expect(src, p).toMatch(/className="hidden text-base"/);
    }
  });
  it("globals.css にタッチ端末向けの 16px ルールがある", () => {
    expect(read("app/globals.css")).toMatch(/@media \(pointer: coarse\)[\s\S]*?input,[\s\S]*?font-size: max\(16px, 1em\)/);
  });
  it("共通の入力欄クラスは sm: で 14px に下げない", () => {
    expect(read("components/settingsUi.ts")).not.toMatch(/\bsm:text-sm"/);
  });
});
