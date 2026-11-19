import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pushErrorReason } from "@/lib/server/push/reminderHandler";
import { checkVapidConfig } from "@/lib/server/push/vapidCheck";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function keyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64url(ecdh.getPublicKey()), privateKey: b64url(ecdh.getPrivateKey()) };
}

describe("checkVapidConfig", () => {
  it("対応する鍵と正しい subject なら問題なし", () => {
    expect(checkVapidConfig({ ...keyPair(), subject: "https://fuel-lens.gadelog.com" })).toEqual([]);
    expect(checkVapidConfig({ ...keyPair(), subject: "mailto:owner@example.com" })).toEqual([]);
  });

  it("公開鍵と秘密鍵が別の組なら key-pair-mismatch", () => {
    const a = keyPair();
    const b = keyPair();
    expect(checkVapidConfig({ publicKey: a.publicKey, privateKey: b.privateKey, subject: "https://example.com" })).toEqual([
      "key-pair-mismatch",
    ]);
  });

  it("秘密鍵が読めなければ invalid-private-key", () => {
    expect(checkVapidConfig({ publicKey: keyPair().publicKey, privateKey: "abc", subject: "https://example.com" })).toEqual([
      "invalid-private-key",
    ]);
  });

  it("subject の localhost と空白を見つける", () => {
    const keys = keyPair();
    expect(checkVapidConfig({ ...keys, subject: "https://localhost" })).toEqual(["subject-localhost"]);
    expect(checkVapidConfig({ ...keys, subject: "mailto:a@localhost" })).toEqual(["subject-localhost"]);
    expect(checkVapidConfig({ ...keys, subject: "mailto: a@example.com" })).toEqual(["subject-whitespace"]);
    expect(checkVapidConfig({ ...keys, subject: "https://localhost.example.com" })).toEqual([]);
  });
});

describe("pushErrorReason", () => {
  it("Apple の JSON から reason だけを取り出す", () => {
    expect(pushErrorReason({ statusCode: 403, body: '{"reason":"BadJwtToken"}' })).toBe("BadJwtToken");
    expect(pushErrorReason({ statusCode: 403, body: '{"reason":"VapidPkHashMismatch"}' })).toBe("VapidPkHashMismatch");
  });

  it("JSON でない本文は記号を落として 100 文字まで", () => {
    expect(pushErrorReason({ body: "<html>Forbidden</html>" })).toBe("htmlForbiddenhtml");
    expect(pushErrorReason({ body: "x".repeat(300) })).toHaveLength(100);
  });

  it("本文が無ければ undefined", () => {
    expect(pushErrorReason(new Error("x"))).toBeUndefined();
    expect(pushErrorReason({ body: "  " })).toBeUndefined();
    expect(pushErrorReason(null)).toBeUndefined();
  });
});
