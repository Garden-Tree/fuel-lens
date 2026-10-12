import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSupabaseToken, getSupabaseJwtTemplate } from "@/lib/supabaseClient";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fetchSupabaseToken", () => {
  it("環境変数があるとテンプレート名を渡す（開発インスタンス）", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE", "supabase");
    const getToken = vi.fn().mockResolvedValue("tok");
    await expect(fetchSupabaseToken(getToken)).resolves.toBe("tok");
    expect(getToken).toHaveBeenCalledWith({ template: "supabase" });
  });

  it("未設定なら引数なしで getToken() を呼ぶ（ネイティブ連携）", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE", "");
    const getToken = vi.fn().mockResolvedValue("tok");
    await fetchSupabaseToken(getToken);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken.mock.calls[0]).toHaveLength(0);
  });

  it("空白だけの値は未設定として扱う", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE", "  ");
    expect(getSupabaseJwtTemplate()).toBeUndefined();
  });
});
