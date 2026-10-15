import { describe, expect, it } from "vitest";
import { LANDING_DESCRIPTION, LANDING_TITLE, buildLandingJsonLd } from "@/lib/landingPage";

describe("ランディングの検索向けの文言", () => {
  it("タイトルに燃費とアプリを含み、説明は 120 字前後", () => {
    expect(LANDING_TITLE).toContain("燃費");
    expect(LANDING_TITLE).toContain("アプリ");
    expect(LANDING_TITLE.length).toBeLessThanOrEqual(35);
    expect(LANDING_DESCRIPTION.length).toBeGreaterThanOrEqual(100);
    expect(LANDING_DESCRIPTION.length).toBeLessThanOrEqual(125);
  });

  it("AI の読み取りはログイン後であることを書く（未ログインは 401）", () => {
    expect(LANDING_DESCRIPTION).toContain("ログイン後");
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
    expect(data.offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "JPY" });
  });
});
