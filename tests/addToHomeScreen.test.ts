import { describe, expect, it } from "vitest";
import {
  A2HS_STEPS,
  a2hsGuideOf,
  detectA2hsPlatform,
  isStandaloneDisplay,
  shouldShowAddToHomeScreen,
  type A2hsVisibilityInput,
} from "@/lib/addToHomeScreen";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  iphoneLine:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.10.0",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/139.0.0.0 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36 Instagram 390.0.0.0",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

const env = (userAgent: string, platform = "", maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });

describe("detectA2hsPlatform", () => {
  it("iPhone の Safari / Chrome は ios", () => {
    expect(detectA2hsPlatform(env(UA.iphoneSafari, "iPhone", 5))).toBe("ios");
    expect(detectA2hsPlatform(env(UA.iphoneChrome, "iPhone", 5))).toBe("ios");
  });

  it("Mac を名乗るタッチ対応の iPad は ios、タッチの無い Mac は unsupported", () => {
    expect(detectA2hsPlatform(env(UA.ipadDesktop, "MacIntel", 5))).toBe("ios");
    expect(detectA2hsPlatform(env(UA.ipadDesktop, "MacIntel", 0))).toBe("unsupported");
  });

  it("Android の Chrome は android-chrome、ほかのブラウザは android-other", () => {
    expect(detectA2hsPlatform(env(UA.androidChrome, "Linux armv81"))).toBe("android-chrome");
    expect(detectA2hsPlatform(env(UA.androidSamsung, "Linux armv81"))).toBe("android-other");
    expect(detectA2hsPlatform(env(UA.androidFirefox, "Linux armv81"))).toBe("android-other");
  });

  it("アプリ内ブラウザ（LINE・Instagram・WebView）は unsupported", () => {
    expect(detectA2hsPlatform(env(UA.iphoneLine, "iPhone", 5))).toBe("unsupported");
    expect(detectA2hsPlatform(env(UA.androidInstagram, "Linux armv81"))).toBe("unsupported");
    expect(detectA2hsPlatform(env(UA.androidWebView, "Linux armv81"))).toBe("unsupported");
  });

  it("PC は unsupported", () => {
    expect(detectA2hsPlatform(env(UA.windowsChrome, "Win32"))).toBe("unsupported");
  });
});

describe("isStandaloneDisplay", () => {
  it("display-mode: standalone か iOS の navigator.standalone のどちらかで true", () => {
    expect(isStandaloneDisplay({ displayModeStandalone: true, navigatorStandalone: undefined })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: true })).toBe(true);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: false })).toBe(false);
    expect(isStandaloneDisplay({ displayModeStandalone: false, navigatorStandalone: undefined })).toBe(false);
  });
});

describe("shouldShowAddToHomeScreen", () => {
  const base: A2hsVisibilityInput = {
    hasRecords: true,
    platform: "android-chrome",
    standalone: false,
    dismissed: false,
    coarsePointer: true,
  };

  it("条件がそろえば出す（ios / android とも）", () => {
    expect(shouldShowAddToHomeScreen(base)).toBe(true);
    expect(shouldShowAddToHomeScreen({ ...base, platform: "ios" })).toBe(true);
    expect(shouldShowAddToHomeScreen({ ...base, platform: "android-other" })).toBe(true);
  });

  it("記録が無い・閉じた・standalone 表示・PC やアプリ内ブラウザ・タッチでない端末では出さない", () => {
    expect(shouldShowAddToHomeScreen({ ...base, hasRecords: false })).toBe(false);
    expect(shouldShowAddToHomeScreen({ ...base, dismissed: true })).toBe(false);
    expect(shouldShowAddToHomeScreen({ ...base, standalone: true })).toBe(false);
    expect(shouldShowAddToHomeScreen({ ...base, platform: "unsupported" })).toBe(false);
    expect(shouldShowAddToHomeScreen({ ...base, coarsePointer: false })).toBe(false);
  });
});

describe("a2hsGuideOf", () => {
  it("Android で beforeinstallprompt を捕まえていればボタン", () => {
    expect(a2hsGuideOf("android-chrome", true)).toEqual({ mode: "prompt" });
    expect(a2hsGuideOf("android-other", true)).toEqual({ mode: "prompt" });
  });

  it("捕まえていなければ手順の文（Chrome はメニュー ⋮）", () => {
    expect(a2hsGuideOf("android-chrome", false)).toEqual({ mode: "steps", steps: A2HS_STEPS["android-chrome"] });
    expect(A2HS_STEPS["android-chrome"]).toContain("⋮");
    expect(a2hsGuideOf("android-other", false)).toEqual({ mode: "steps", steps: A2HS_STEPS["android-other"] });
  });

  it("iOS は常に共有ボタンからの手順（ボタンは出さない）", () => {
    expect(a2hsGuideOf("ios", false)).toEqual({ mode: "steps", steps: A2HS_STEPS.ios });
    expect(a2hsGuideOf("ios", true)).toEqual({ mode: "steps", steps: A2HS_STEPS.ios });
    expect(A2HS_STEPS.ios).toContain("共有ボタン");
  });

  it("unsupported は null", () => {
    expect(a2hsGuideOf("unsupported", true)).toBeNull();
  });
});
