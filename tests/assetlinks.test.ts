import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANDROID_PACKAGE_NAME,
  buildAssetLinks,
  normalizeFingerprint,
  parseFingerprints,
} from "@/lib/assetlinks";

const FP_A = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const FP_B = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

describe("normalizeFingerprint", () => {
  it("正しい形式はそのまま返す", () => {
    expect(normalizeFingerprint(FP_A)).toBe(FP_A);
  });

  it("小文字と前後の空白を整える", () => {
    expect(normalizeFingerprint(`  ${FP_A.toLowerCase()}  `)).toBe(FP_A);
  });

  it("コロン無しの 64 桁 16 進にはコロンを足す", () => {
    expect(normalizeFingerprint(FP_A.replaceAll(":", ""))).toBe(FP_A);
  });

  it("SHA-1（20 バイト）や桁の足りない値、16 進以外は null", () => {
    expect(normalizeFingerprint(FP_A.split(":").slice(0, 20).join(":"))).toBeNull();
    expect(normalizeFingerprint(FP_A.slice(0, -2))).toBeNull();
    expect(normalizeFingerprint(FP_A.replace("14", "ZZ"))).toBeNull();
    expect(normalizeFingerprint("")).toBeNull();
  });
});

describe("parseFingerprints", () => {
  it("未設定・空は空配列", () => {
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints("")).toEqual([]);
    expect(parseFingerprints("  ,  ")).toEqual([]);
  });

  it("カンマ区切りで複数、重複は 1 つにまとめ、不正な値は捨てる", () => {
    expect(parseFingerprints(`${FP_A}, ${FP_B},${FP_A.toLowerCase()}, not-a-fingerprint`)).toEqual([FP_A, FP_B]);
  });
});

describe("buildAssetLinks", () => {
  it("環境変数が無ければ null（空のリストは返さない）", () => {
    expect(buildAssetLinks({})).toBeNull();
    expect(buildAssetLinks({ ANDROID_ASSETLINKS_SHA256: "" })).toBeNull();
    expect(buildAssetLinks({ ANDROID_ASSETLINKS_SHA256: "garbage" })).toBeNull();
  });

  it("標準の assetlinks 形式で返す", () => {
    expect(buildAssetLinks({ ANDROID_ASSETLINKS_SHA256: `${FP_A},${FP_B}` })).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.gadelog.fuellens",
          sha256_cert_fingerprints: [FP_A, FP_B],
        },
      },
    ]);
    expect(ANDROID_PACKAGE_NAME).toBe("com.gadelog.fuellens");
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未設定なら 404", async () => {
    vi.stubEnv("ANDROID_ASSETLINKS_SHA256", "");
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    const res = GET();
    expect(res.status).toBe(404);
  });

  it("設定されていれば 200 の JSON", async () => {
    vi.stubEnv("ANDROID_ASSETLINKS_SHA256", FP_A);
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].target.sha256_cert_fingerprints).toEqual([FP_A]);
  });
});

describe("周辺の設定", () => {
  it("sitemap に /.well-known は含まれない", async () => {
    const sitemap = (await import("@/app/sitemap")).default;
    expect(sitemap().some((entry) => entry.url.includes(".well-known"))).toBe(false);
  });

  it("proxy.ts（Clerk）の matcher は /.well-known を除外する", async () => {
    vi.doMock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));
    const { config } = await import("@/proxy");
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test("/.well-known/assetlinks.json")).toBe(false);
    // 通常のページと API は従来どおり Clerk を通る
    expect(pattern.test("/app")).toBe(true);
    expect(pattern.test("/privacy")).toBe(true);
  });
});
