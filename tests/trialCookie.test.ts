import { describe, expect, it } from "vitest";
import {
  TRIAL_COOKIE_MAX_AGE_SEC,
  decodeTrialCookie,
  encodeTrialCookie,
  readCookie,
  trialSetCookie,
  trialStateFromCookie,
} from "@/lib/server/analyze/trialCookie";

const SECRET = "test-trial-secret";

describe("trial cookie signing", () => {
  it("round-trips counts 0-3", () => {
    for (let n = 0; n <= 3; n++) {
      const value = encodeTrialCookie(n, SECRET);
      expect(value).toMatch(new RegExp(`^${n}\\.[A-Za-z0-9_-]{43}$`));
      expect(decodeTrialCookie(value, SECRET)).toBe(n);
    }
  });

  it("treats missing, malformed, tampered or foreign-key values as 0 (new device)", () => {
    const good = encodeTrialCookie(3, SECRET);
    const [, mac] = good.split(".");
    expect(decodeTrialCookie(null, SECRET)).toBe(0);
    expect(decodeTrialCookie("", SECRET)).toBe(0);
    expect(decodeTrialCookie("3", SECRET)).toBe(0);
    expect(decodeTrialCookie(`2.${mac}`, SECRET)).toBe(0); // 回数だけ書き換え
    expect(decodeTrialCookie(`3.${"A".repeat(43)}`, SECRET)).toBe(0);
    expect(decodeTrialCookie(encodeTrialCookie(3, "other-secret"), SECRET)).toBe(0);
    expect(decodeTrialCookie(`${good}x`, SECRET)).toBe(0);
    expect(decodeTrialCookie(good, "")).toBe(0);
  });

  it("clamps a validly signed count above the maximum", () => {
    expect(decodeTrialCookie(encodeTrialCookie(7, SECRET), SECRET)).toBe(3);
  });
});

describe("readCookie", () => {
  it("finds the named cookie among others", () => {
    expect(readCookie("a=1; fuel_lens_trial=1.abc; b=2", "fuel_lens_trial")).toBe("1.abc");
    expect(readCookie("xfuel_lens_trial=1; a=2", "fuel_lens_trial")).toBeNull();
    expect(readCookie(null, "fuel_lens_trial")).toBeNull();
    expect(readCookie("broken; fuel_lens_trial=0.x", "fuel_lens_trial")).toBe("0.x");
  });
});

describe("trialSetCookie", () => {
  it("is HttpOnly, SameSite=Lax, Path=/ and lasts 180 days; Secure only when asked", () => {
    expect(trialSetCookie(1, SECRET, { secure: false })).toBe(
      `fuel_lens_trial=${encodeTrialCookie(1, SECRET)}; Path=/; Max-Age=${TRIAL_COOKIE_MAX_AGE_SEC}; HttpOnly; SameSite=Lax`
    );
    expect(TRIAL_COOKIE_MAX_AGE_SEC).toBe(180 * 24 * 60 * 60);
    expect(trialSetCookie(1, SECRET, { secure: true })).toMatch(/; Secure$/);
  });
});

describe("trialStateFromCookie", () => {
  it("is disabled without a secret and counts down with one", () => {
    expect(trialStateFromCookie(encodeTrialCookie(1, SECRET), undefined)).toEqual({ enabled: false, remaining: 0 });
    expect(trialStateFromCookie(undefined, SECRET)).toEqual({ enabled: true, remaining: 3 });
    expect(trialStateFromCookie(encodeTrialCookie(2, SECRET), SECRET)).toEqual({ enabled: true, remaining: 1 });
    expect(trialStateFromCookie(encodeTrialCookie(3, SECRET), SECRET)).toEqual({ enabled: true, remaining: 0 });
  });
});
