import { describe, expect, it } from "vitest";
import {
  DENIED_REASON,
  IOS_NOT_STANDALONE_REASON,
  IOS_TOO_OLD_REASON,
  UNSUPPORTED_REASON,
  detectPushSupport,
  urlBase64ToUint8Array,
  type PushEnv,
} from "@/lib/push/support";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

const base: PushEnv = {
  userAgent: ANDROID_UA,
  platform: "Linux armv8l",
  maxTouchPoints: 5,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  standalone: false,
  permission: "default",
};

describe("detectPushSupport", () => {
  it("Android の Chrome はブラウザのままでも使える", () => {
    expect(detectPushSupport(base)).toEqual({ ok: true });
  });

  it("iPhone の Safari（ホーム画面に追加していない）はホーム画面への追加を案内する", () => {
    const env = { ...base, userAgent: IPHONE_UA, platform: "iPhone", hasPushManager: false, hasNotification: false };
    expect(detectPushSupport(env)).toEqual({ ok: false, reason: IOS_NOT_STANDALONE_REASON });
  });

  it("iPhone のホーム画面の PWA で API が無ければ iOS の更新を案内する", () => {
    const env = { ...base, userAgent: IPHONE_UA, platform: "iPhone", standalone: true, hasPushManager: false };
    expect(detectPushSupport(env)).toEqual({ ok: false, reason: IOS_TOO_OLD_REASON });
  });

  it("iPhone のホーム画面の PWA（16.4 以上）は使える", () => {
    const env = { ...base, userAgent: IPHONE_UA, platform: "iPhone", standalone: true };
    expect(detectPushSupport(env)).toEqual({ ok: true });
  });

  it("API が無いブラウザは使えない", () => {
    expect(detectPushSupport({ ...base, hasPushManager: false })).toEqual({ ok: false, reason: UNSUPPORTED_REASON });
  });

  it("通知がブロックされていれば理由を出す", () => {
    expect(detectPushSupport({ ...base, permission: "denied" })).toEqual({ ok: false, reason: DENIED_REASON });
  });
});

describe("urlBase64ToUint8Array", () => {
  it("base64url（パディングなし）をバイト列にする", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });
});
