import { describe, expect, it } from "vitest";
import { scrubAnalyticsUrl } from "@/lib/analytics/scrubUrl";

describe("scrubAnalyticsUrl", () => {
  it("utm_* だけ残し、他のクエリとハッシュは落とす", () => {
    expect(
      scrubAnalyticsUrl("https://fuel-lens.gadelog.com/app?action=shared&t=secret&utm_source=x&utm_medium=social#record-1")
    ).toBe("https://fuel-lens.gadelog.com/app?utm_source=x&utm_medium=social");
  });

  it("utm が無ければパスだけ", () => {
    expect(scrubAnalyticsUrl("https://fuel-lens.gadelog.com/history#record-abc")).toBe("https://fuel-lens.gadelog.com/history");
  });

  it("utm の値は 100 文字で切る", () => {
    const long = "a".repeat(150);
    expect(scrubAnalyticsUrl(`https://fuel-lens.gadelog.com/?utm_campaign=${long}`)).toBe(
      `https://fuel-lens.gadelog.com/?utm_campaign=${"a".repeat(100)}`
    );
  });

  it("URL でなければ null（送らない）", () => {
    expect(scrubAnalyticsUrl("not a url")).toBeNull();
  });
});
