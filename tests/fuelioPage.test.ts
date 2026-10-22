import { describe, expect, it } from "vitest";
import { BACKUP_MAX_RECORDS, BACKUP_MAX_TEXT_LENGTH } from "@/lib/backup";
import {
  FUELIO_CANONICAL_URL,
  FUELIO_COLUMN_MAPPINGS,
  FUELIO_DESCRIPTION,
  FUELIO_MAX_FILE_MB,
  FUELIO_MAX_RECORDS,
  FUELIO_MAX_RECORDS_TEXT,
  FUELIO_PATH,
  FUELIO_TITLE,
  buildFuelioJsonLd,
  fuelioFaqs,
} from "@/lib/fuelioPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { PUBLIC_TOOL_LINKS, otherToolLinks } from "@/lib/publicNav";
import sitemap from "@/app/sitemap";

describe("fuelioPage の定数", () => {
  it("パスとナビの表示名", () => {
    expect(FUELIO_PATH).toBe("/fuelio");
    expect(FUELIO_TITLE).toBe("Fuelio からの乗り換え");
    expect(FUELIO_CANONICAL_URL).toBe("https://fuel-lens.gadelog.com/fuelio");
  });

  it("説明文は 110〜120 字", () => {
    const len = [...FUELIO_DESCRIPTION].length;
    expect(len).toBeGreaterThanOrEqual(110);
    expect(len).toBeLessThanOrEqual(120);
  });

  it("上限は取り込みの実装（lib/backup.ts）と同じ", () => {
    expect(FUELIO_MAX_FILE_MB).toBe(BACKUP_MAX_TEXT_LENGTH / 1024 / 1024);
    expect(FUELIO_MAX_RECORDS).toBe(BACKUP_MAX_RECORDS);
    expect(FUELIO_MAX_RECORDS_TEXT).toBe(BACKUP_MAX_RECORDS.toLocaleString("ja-JP"));
  });

  it("列の対応に Odo・Full・Missed・Notes を含む", () => {
    const names = FUELIO_COLUMN_MAPPINGS.map((m) => m.fuelio);
    for (const n of ["Odo", "Full", "Missed", "Notes"]) expect(names).toContain(n);
  });

  it("公開ナビとサイトマップに載る", () => {
    expect(PUBLIC_TOOL_LINKS.some((l) => l.href === FUELIO_PATH)).toBe(true);
    expect(otherToolLinks(FUELIO_PATH).some((l) => l.href === FUELIO_PATH)).toBe(false);
    expect(sitemap().some((e) => e.url.endsWith(FUELIO_PATH))).toBe(true);
  });
});

describe("fuelioFaqs", () => {
  it("6 問で、無料の答えはお試しの有無で landingPage と同じ注記を使う", () => {
    expect(fuelioFaqs(true)).toHaveLength(6);
    expect(fuelioFaqs(true).find((f) => f.q.includes("無料"))?.a).toContain(aiAvailabilityCopy(true).faqFreeNote);
    expect(fuelioFaqs(false).find((f) => f.q.includes("無料"))?.a).toContain(aiAvailabilityCopy(false).faqFreeNote);
  });
});

describe("buildFuelioJsonLd", () => {
  it("WebPage と FAQPage を含む", () => {
    const faqs = fuelioFaqs(false);
    const data = JSON.parse(buildFuelioJsonLd(faqs));
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "FAQPage"]);
    expect(data["@graph"][0].url).toBe(FUELIO_CANONICAL_URL);
    expect(data["@graph"][1].mainEntity).toHaveLength(6);
  });

  it("< をエスケープして </script> で閉じられないようにする", () => {
    const json = buildFuelioJsonLd([{ q: "</script><script>alert(1)</script>", a: "a<b" }]);
    expect(json).not.toContain("<");
    expect(JSON.parse(json)["@graph"][1].mainEntity[0].name).toBe("</script><script>alert(1)</script>");
  });
});
