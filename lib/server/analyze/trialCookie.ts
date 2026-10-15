import { createHmac, timingSafeEqual } from "node:crypto";
import { TRIAL_COOKIE_NAME, TRIAL_MAX_SCANS } from "@/lib/trial";

/**
 * 未ログインのお試し読み取りの使用回数を入れる署名付き Cookie（`fuel_lens_trial`）。サーバー専用（node:crypto）。
 *
 * 値は `<回数>.<HMAC-SHA256(base64url)>`。HMAC の鍵は `TRIAL_COOKIE_SECRET`、対象は `fuel_lens_trial:v1:<回数>`。
 * 署名が合わない・形式が違う・Cookie が無いときは 0 回（新しい端末）として扱う。
 * Cookie を消せば数え直せるので、これは「普通の利用者に 3 回を見せる」ための仕組みで、
 * 乱用の歯止めは IP ごとの 1 日の上限（lib/server/analyze/rateLimit.ts）が受け持つ。
 */

/**
 * 未ログインのお試し読み取りが有効か（`TRIAL_COOKIE_SECRET` が設定済み）。
 * 公開ページの文言の切り替えにも使う（静的描画のページではビルド時の値）。
 */
export function isTrialEnabled(secret: string | undefined = process.env.TRIAL_COOKIE_SECRET): boolean {
  return !!secret;
}

/** Cookie の有効期間（180 日） */
export const TRIAL_COOKIE_MAX_AGE_SEC = 180 * 24 * 60 * 60;

const VALUE_PATTERN = /^(\d{1,2})\.([A-Za-z0-9_-]{43})$/;

function sign(count: number, secret: string): string {
  return createHmac("sha256", secret).update(`${TRIAL_COOKIE_NAME}:v1:${count}`).digest("base64url");
}

/** 回数を署名して Cookie の値にする */
export function encodeTrialCookie(count: number, secret: string): string {
  return `${count}.${sign(count, secret)}`;
}

/**
 * Cookie の値から使用回数を読む。署名を定数時間で比較し、不正・欠落なら 0。
 * 正しく署名された値は 0〜TRIAL_MAX_SCANS に収める。
 */
export function decodeTrialCookie(value: string | null | undefined, secret: string): number {
  if (!value || !secret) return 0;
  const match = VALUE_PATTERN.exec(value);
  if (!match) return 0;
  const count = Number(match[1]);
  const expected = Buffer.from(sign(count, secret));
  const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 0;
  return Math.min(Math.max(count, 0), TRIAL_MAX_SCANS);
}

/** `Cookie` ヘッダーから名前の値を取り出す（無ければ null） */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return part.slice(eq + 1).trim();
  }
  return null;
}

/** 使用回数の Cookie を設定する `Set-Cookie` の値（HttpOnly・SameSite=Lax・180 日。本番は Secure） */
export function trialSetCookie(count: number, secret: string, { secure }: { secure: boolean }): string {
  return [
    `${TRIAL_COOKIE_NAME}=${encodeTrialCookie(count, secret)}`,
    "Path=/",
    `Max-Age=${TRIAL_COOKIE_MAX_AGE_SEC}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * お試しの残り回数（サーバーの表示用。アプリ画面のレイアウトが Cookie から初期値を作る）。
 * 秘密鍵が未設定ならお試しは無効。
 */
export function trialStateFromCookie(
  cookieValue: string | null | undefined,
  secret: string | undefined
): { enabled: boolean; remaining: number } {
  if (!secret) return { enabled: false, remaining: 0 };
  return { enabled: true, remaining: TRIAL_MAX_SCANS - decodeTrialCookie(cookieValue, secret) };
}
