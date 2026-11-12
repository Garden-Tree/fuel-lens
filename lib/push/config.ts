/**
 * 給油のお知らせ（Web Push）の有効・無効。VAPID の鍵が揃っていないときは機能全体を無効にする
 * （設定画面にも出さない。TRIAL_COOKIE_SECRET と同じ考え方）。
 *
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY: 公開鍵（ブラウザの pushManager.subscribe に渡す。秘密ではない）
 * - VAPID_PRIVATE_KEY: 秘密鍵（サーバー専用。NEXT_PUBLIC_ を付けない）
 * - VAPID_SUBJECT: 連絡先（mailto: か https: の URL）
 */

/** ブラウザ側: 公開鍵が設定されていれば設定画面に「給油のお知らせ」を出す。NEXT_PUBLIC_ はビルド時に展開されるのでプロパティ参照のまま書く */
export function clientVapidPublicKey(): string | null {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key ? key : null;
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export type VapidEnv = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

/** サーバー側: 3 つとも揃っていて subject が mailto: / https: のときだけ設定を返す。足りなければ null（送信しない） */
export function serverVapidConfig(env: VapidEnv): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}
