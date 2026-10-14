import { describe, expect, it } from "vitest";
import { jaJP } from "@clerk/localizations/ja-JP";
import { CLERK_LOCALIZATION_OVERRIDES, clerkLocalization, deepMerge } from "@/lib/clerkLocalization";

describe("clerkLocalization", () => {
  it("jaJP の値を保つ（上書きしていないキー）", () => {
    expect(clerkLocalization.locale).toBe("ja-JP");
    expect(clerkLocalization.signIn?.emailCode?.title).toBe(jaJP.signIn?.emailCode?.title);
    expect(clerkLocalization.signIn?.emailCode?.resendButton).toBe(jaJP.signIn?.emailCode?.resendButton);
    expect(clerkLocalization.signUp?.emailCode?.title).toBe(jaJP.signUp?.emailCode?.title);
    expect(clerkLocalization.formButtonPrimary).toBe(jaJP.formButtonPrimary);
  });

  it("メールコードの案内に迷惑メールの確認を足す", () => {
    for (const text of [
      clerkLocalization.signIn?.emailCode?.subtitle,
      clerkLocalization.signIn?.emailCodeMfa?.subtitle,
      clerkLocalization.signUp?.emailCode?.subtitle,
      clerkLocalization.signUp?.emailCode?.formSubtitle,
      clerkLocalization.userProfile?.emailAddressPage?.emailCode?.formSubtitle,
    ]) {
      expect(text).toContain("迷惑メールフォルダ");
    }
  });

  it("プレースホルダーを残す", () => {
    const text = clerkLocalization.userProfile?.emailAddressPage?.emailCode?.formSubtitle;
    expect(text).toContain("{{identifier}}");
    expect(text).toBe(CLERK_LOCALIZATION_OVERRIDES.userProfile.emailAddressPage.emailCode.formSubtitle);
  });

  it("deepMerge は元のオブジェクトを変更しない", () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const merged = deepMerge(base, { a: { b: 9 } });
    expect(merged).toEqual({ a: { b: 9, c: 2 }, d: 3 });
    expect(base).toEqual({ a: { b: 1, c: 2 }, d: 3 });
  });
});
