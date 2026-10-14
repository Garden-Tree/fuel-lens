import { describe, expect, it } from "vitest";
import { clerkFrontendApiOrigin } from "@/lib/clerkFrontendApi";

const encode = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("clerkFrontendApiOrigin", () => {
  it("本番キーから Frontend API のオリジンを取り出す", () => {
    expect(clerkFrontendApiOrigin(`pk_live_${encode("clerk.fuel-lens.gadelog.com$")}`)).toBe(
      "https://clerk.fuel-lens.gadelog.com",
    );
  });

  it("開発キーも扱う", () => {
    expect(clerkFrontendApiOrigin(`pk_test_${encode("sure-ox-70.clerk.accounts.dev$")}`)).toBe(
      "https://sure-ox-70.clerk.accounts.dev",
    );
  });

  it("形式が違うキーは null", () => {
    expect(clerkFrontendApiOrigin(undefined)).toBeNull();
    expect(clerkFrontendApiOrigin("")).toBeNull();
    expect(clerkFrontendApiOrigin("sk_live_abc")).toBeNull();
    expect(clerkFrontendApiOrigin(`pk_live_${encode("clerk.example.com")}`)).toBeNull();
    expect(clerkFrontendApiOrigin(`pk_live_${encode("evil.com/path$")}`)).toBeNull();
    expect(clerkFrontendApiOrigin("pk_live_!!!")).toBeNull();
  });
});
