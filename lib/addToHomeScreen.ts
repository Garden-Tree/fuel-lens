/**
 * 「ホーム画面に追加」の案内カード（ホーム画面）の判定。純粋関数。
 * ブラウザの値（UA・matchMedia・localStorage・beforeinstallprompt）の読み取りは lib/useAddToHomeScreen.ts。
 */

import { isIosDevice } from "@/lib/iosViewport";

/** 閉じた（「あとで」/「閉じる」/ インストール済み）ことを覚えておく localStorage のキー */
export const A2HS_DISMISSED_STORAGE_KEY = "fuel_lens_a2hs_dismissed";

/**
 * 案内の出し分け。
 * - ios: iPhone / iPad（Safari など。共有ボタンから追加する）
 * - android-chrome: Android の Chrome（メニュー ⋮ から追加する）
 * - android-other: Android のその他のブラウザ（Samsung インターネット・Firefox など）
 * - unsupported: PC、アプリ内ブラウザ（LINE・Instagram など。ホーム画面に追加できない）
 */
export type A2hsPlatform = "ios" | "android-chrome" | "android-other" | "unsupported";

export type A2hsDeviceEnv = {
  userAgent: string;
  /** navigator.platform（iPadOS の判定に使う） */
  platform: string;
  maxTouchPoints: number;
};

// アプリ内ブラウザ（WebView）。ホーム画面に追加できないので案内しない
const IN_APP_BROWSER = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|KAKAOTALK|; wv\)/i;
// Chrome を名乗る Chromium 系の別ブラウザ（メニューの場所が違う）
const NON_CHROME_CHROMIUM = /SamsungBrowser|EdgA|OPR\/|OPT\/|YaBrowser|UCBrowser|MiuiBrowser|HuaweiBrowser|HeyTapBrowser|Vivaldi|DuckDuckGo/i;

export function detectA2hsPlatform(env: A2hsDeviceEnv): A2hsPlatform {
  const ua = env.userAgent;
  if (IN_APP_BROWSER.test(ua)) return "unsupported";
  if (isIosDevice(ua, env.platform, env.maxTouchPoints)) return "ios";
  if (/Android/i.test(ua)) {
    return /Chrome\/\d+/.test(ua) && !NON_CHROME_CHROMIUM.test(ua) ? "android-chrome" : "android-other";
  }
  return "unsupported";
}

/** ホーム画面から開いている（standalone 表示）か。Android 等は display-mode、iOS は navigator.standalone */
export function isStandaloneDisplay(input: { displayModeStandalone: boolean; navigatorStandalone: boolean | undefined }): boolean {
  return input.displayModeStandalone || input.navigatorStandalone === true;
}

export type A2hsVisibilityInput = {
  /** 記録の読み込みが終わっている（記録の有無は問わない） */
  loaded: boolean;
  platform: A2hsPlatform;
  standalone: boolean;
  /** 以前に閉じた・インストールした */
  dismissed: boolean;
  /** 主な入力がタッチ（`pointer: coarse`）。PC で UA を偽っている場合などを除く */
  coarsePointer: boolean;
};

/** 案内カードを出すか。読み込み後、モバイルのブラウザで開いていて、まだ閉じていないときだけ（記録の有無は問わない） */
export function shouldShowAddToHomeScreen(input: A2hsVisibilityInput): boolean {
  if (!input.loaded || input.dismissed || input.standalone) return false;
  if (input.platform === "unsupported") return false;
  return input.coarsePointer;
}

/** カードの中身。prompt はボタンでブラウザのインストール画面を開く、steps は手順の文だけ */
export type A2hsGuide = { mode: "prompt" } | { mode: "steps"; steps: string };

export const A2HS_HEADING = "ホーム画面に追加すると、次回からワンタップで開けます";

/** 記録がまだ無い人向けの見出し（給油所にいない初回訪問者が、次の給油で使えるようにする） */
export const A2HS_HEADING_NO_RECORDS = "次の給油で使えるように、ホーム画面に追加しておきましょう";

/** 見出し。記録が無いときだけ A2HS_HEADING_NO_RECORDS */
export function a2hsHeadingOf(hasRecords: boolean): string {
  return hasRecords ? A2HS_HEADING : A2HS_HEADING_NO_RECORDS;
}

export const A2HS_STEPS: Record<Exclude<A2hsPlatform, "unsupported">, string> = {
  ios: "共有ボタン（四角から上向きの矢印。見当たらないときは「…」の中）→「ホーム画面に追加」の順に選んでください。",
  "android-chrome": "Chrome のメニュー（⋮）→「ホーム画面に追加」の順に選んでください。",
  "android-other": "ブラウザのメニューから「ホーム画面に追加」を選んでください。",
};

/**
 * 出す案内。Android で beforeinstallprompt を捕まえていればボタン（prompt）、無ければ手順の文。
 * iOS は beforeinstallprompt が無いので常に手順の文。unsupported は null（出さない）
 */
export function a2hsGuideOf(platform: A2hsPlatform, canPrompt: boolean): A2hsGuide | null {
  if (platform === "unsupported") return null;
  if (canPrompt && platform !== "ios") return { mode: "prompt" };
  return { mode: "steps", steps: A2HS_STEPS[platform] };
}
