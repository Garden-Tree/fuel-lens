// Digital Asset Links（/.well-known/assetlinks.json）の組み立て。純粋関数。
// Google Play の Trusted Web Activity（TWA）が、このドメインの正当な持ち主のアプリだと確認するために使う。
// 署名鍵の SHA-256 フィンガープリントはリポジトリに置かず、環境変数 ANDROID_ASSETLINKS_SHA256 から読む。
// 手順は docs/play-store/README.md。

/** Play に登録するパッケージ名（PWABuilder の Package ID と同じにする） */
export const ANDROID_PACKAGE_NAME = "com.gadelog.fuellens";

/** 区切り付き 32 バイトの SHA-256（例: 14:6D:E9:…）。16 進 2 桁 x 32 個 */
const FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * 1 つの値を `AA:BB:…` の形に整える。大文字化し、コロン無しの 64 桁 16 進にはコロンを足す。
 * SHA-256 のフィンガープリントとして不正なら null。
 */
export function normalizeFingerprint(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (/^[0-9A-F]{64}$/.test(value)) return value.match(/../g)!.join(":");
  return FINGERPRINT_PATTERN.test(value) ? value : null;
}

/** カンマ区切り（改行・空白も区切りとして許す）の環境変数値を、重複なしの有効なフィンガープリントの配列にする */
export function parseFingerprints(value: string | undefined): string[] {
  if (!value) return [];
  const found = value
    .split(/[,\s]+/)
    .map(normalizeFingerprint)
    .filter((f): f is string => f !== null);
  return [...new Set(found)];
}

export interface AssetLinkStatement {
  relation: ["delegate_permission/common.handle_all_urls"];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/**
 * assetlinks.json の本文。有効なフィンガープリントが 1 つも無ければ null（呼び出し側は 404 を返す。空配列は返さない）。
 */
export function buildAssetLinks(env: Record<string, string | undefined>): AssetLinkStatement[] | null {
  const fingerprints = parseFingerprints(env.ANDROID_ASSETLINKS_SHA256);
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}
