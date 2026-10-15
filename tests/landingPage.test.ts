import { describe, expect, it } from "vitest";
import {
  LANDING_DESCRIPTION,
  LANDING_DESCRIPTION_WITH_TRIAL,
  LANDING_TITLE,
  aiAvailabilityCopy,
  buildLandingJsonLd,
  landingDescription,
} from "@/lib/landingPage";
import { isTrialEnabled } from "@/lib/server/analyze/trialCookie";

describe("ランディングの検索向けの文言", () => {
  it("タイトルに燃費とアプリを含み、説明は 120 字前後", () => {
    expect(LANDING_TITLE).toContain("燃費");
    expect(LANDING_TITLE).toContain("アプリ");
    expect(LANDING_TITLE.length).toBeLessThanOrEqual(35);
    expect(LANDING_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
    expect(LANDING_DESCRIPTION.length).toBeLessThanOrEqual(125);
  });

  it("お試しが無効なら AI の読み取りはログイン後と書く（未ログインは 401）", () => {
    expect(LANDING_DESCRIPTION).toContain("ログイン後");
    expect(landingDescription(false)).toBe(LANDING_DESCRIPTION);
  });

  it("お試しが有効なら「登録なしで3回まで試せます」と書き、長さも 100〜125 字", () => {
    expect(landingDescription(true)).toBe(LANDING_DESCRIPTION_WITH_TRIAL);
    expect(LANDING_DESCRIPTION_WITH_TRIAL).toContain("登録なしで3回まで試せます");
    expect(LANDING_DESCRIPTION_WITH_TRIAL).not.toContain("ログイン後");
    expect(LANDING_DESCRIPTION_WITH_TRIAL.length).toBeGreaterThanOrEqual(100);
    expect(LANDING_DESCRIPTION_WITH_TRIAL.length).toBeLessThanOrEqual(125);
  });
});

describe("aiAvailabilityCopy", () => {
  it("お試しが有効なら AI の文言をすべて「登録なしで3回まで」にし、「ログイン後」とは書かない", () => {
    const copy = aiAvailabilityCopy(true);
    expect(copy.heroCheck).toBe("AIの読み取りは登録なしで3回まで試せます");
    for (const text of Object.values(copy)) {
      expect(text).toContain("3回まで");
      expect(text).not.toContain("ログイン後");
    }
  });

  it("お試しが無効なら従来どおり「ログイン後」と書き、ヒーローの項目は出さない", () => {
    const copy = aiAvailabilityCopy(false);
    expect(copy.heroCheck).toBeNull();
    for (const [key, text] of Object.entries(copy)) {
      if (key === "heroCheck") continue;
      expect(text).not.toContain("3回まで");
      expect(text).toMatch(/ログイン/);
    }
  });

  it("有効かどうかは TRIAL_COOKIE_SECRET の有無で決まる", () => {
    expect(isTrialEnabled(undefined)).toBe(false);
    expect(isTrialEnabled("")).toBe(false);
    expect(isTrialEnabled("secret")).toBe(true);
  });
});

describe("buildLandingJsonLd", () => {
  it("WebApplication の JSON で、< を含まない", () => {
    const json = buildLandingJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("WebApplication");
    expect(data.url).toBe("https://fuel-lens.gadelog.com/");
    expect(data.description).toBe(LANDING_DESCRIPTION);
    expect(JSON.parse(buildLandingJsonLd(LANDING_DESCRIPTION_WITH_TRIAL)).description).toBe(LANDING_DESCRIPTION_WITH_TRIAL);
    expect(data.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "JPY" });
  });
});
