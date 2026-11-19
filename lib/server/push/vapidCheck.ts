import { createECDH } from "node:crypto";

/**
 * VAPID の設定の自己点検（GET /api/push/reminders が送信前に呼ぶ）。サーバー専用（node:crypto）。
 * 値そのものはログに出さず、問題の種類だけを返す。
 *
 * - key-pair-mismatch: 秘密鍵から求めた公開鍵が NEXT_PUBLIC_VAPID_PUBLIC_KEY と違う。
 *   Apple は 403 VapidPkHashMismatch、FCM も 403 で拒否する（鍵を作り直したら、購読もやり直しが必要）。
 * - invalid-private-key: 秘密鍵が P-256 の 32 バイトとして読めない。
 * - subject-localhost: subject が localhost を指している（Apple は 403 BadJwtToken で拒否する）。
 * - subject-whitespace: subject に空白や改行が混じっている。
 */
export type VapidProblem = "key-pair-mismatch" | "invalid-private-key" | "subject-localhost" | "subject-whitespace";

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function checkVapidConfig(config: { publicKey: string; privateKey: string; subject: string }): VapidProblem[] {
  const problems: VapidProblem[] = [];
  try {
    const priv = fromBase64Url(config.privateKey);
    if (priv.length !== 32) throw new Error("length");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(priv);
    const derived = ecdh.getPublicKey();
    if (!derived.equals(fromBase64Url(config.publicKey))) problems.push("key-pair-mismatch");
  } catch {
    problems.push("invalid-private-key");
  }
  if (/\s/.test(config.subject)) problems.push("subject-whitespace");
  if (/^(mailto:[^@]*@|https:\/\/)(localhost|127\.0\.0\.1)(?=[/:>]|$)/i.test(config.subject)) {
    problems.push("subject-localhost");
  }
  return problems;
}
