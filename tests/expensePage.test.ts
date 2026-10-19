import { describe, expect, it } from "vitest";
import { RECORDS_CSV_HEADERS, buildRecordsCsv } from "@/lib/csv";
import {
  EXPENSE_CANONICAL_URL,
  EXPENSE_CSV_COLUMNS_TEXT,
  EXPENSE_DESCRIPTION,
  EXPENSE_PATH,
  EXPENSE_TITLE,
  buildExpenseJsonLd,
  expenseFaqs,
} from "@/lib/expensePage";
import { aiAvailabilityCopy } from "@/lib/landingPage";

describe("expensePage の定数", () => {
  it("パスとナビの表示名", () => {
    expect(EXPENSE_PATH).toBe("/expense");
    expect(EXPENSE_TITLE).toBe("経費のガソリン代記録");
    expect(EXPENSE_CANONICAL_URL).toBe("https://fuel-lens.gadelog.com/expense");
  });

  it("説明文は 110〜120 字", () => {
    const len = [...EXPENSE_DESCRIPTION].length;
    expect(len).toBeGreaterThanOrEqual(110);
    expect(len).toBeLessThanOrEqual(120);
  });

  it("CSV の列の説明は、実際に書き出す CSV のヘッダーと同じ", () => {
    const csv = buildRecordsCsv([], {});
    const headerLine = csv.replace(/^﻿/, "").split("\n")[0];
    expect(headerLine.split(",")).toEqual([...RECORDS_CSV_HEADERS]);
    expect(EXPENSE_CSV_COLUMNS_TEXT).toBe(RECORDS_CSV_HEADERS.join("・"));
    for (const col of ["日付", "店舗名", "支払総額(円)"]) expect(RECORDS_CSV_HEADERS).toContain(col);
  });
});

describe("expenseFaqs", () => {
  it("4 問で、CSV の答えに列名が入る", () => {
    for (const trial of [true, false]) {
      const faqs = expenseFaqs(trial);
      expect(faqs).toHaveLength(4);
      const csvFaq = faqs.find((f) => f.q.includes("CSV"));
      for (const col of RECORDS_CSV_HEADERS) expect(csvFaq?.a).toContain(col);
    }
  });

  it("無料の答えはお試しの有無で landingPage と同じ注記を使う", () => {
    expect(expenseFaqs(true)[3].a).toContain(aiAvailabilityCopy(true).faqFreeNote);
    expect(expenseFaqs(false)[3].a).toContain(aiAvailabilityCopy(false).faqFreeNote);
  });
});

describe("buildExpenseJsonLd", () => {
  it("WebPage・WebApplication・FAQPage を含む", () => {
    const faqs = expenseFaqs(false);
    const data = JSON.parse(buildExpenseJsonLd(faqs));
    const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toEqual(["WebPage", "WebApplication", "FAQPage"]);
    expect(data["@graph"][0].url).toBe(EXPENSE_CANONICAL_URL);
    const faqPage = data["@graph"][2];
    expect(faqPage.mainEntity).toHaveLength(4);
    expect(faqPage.mainEntity[0]).toEqual({
      "@type": "Question",
      name: faqs[0].q,
      acceptedAnswer: { "@type": "Answer", text: faqs[0].a },
    });
  });

  it("< をエスケープして </script> で閉じられないようにする", () => {
    const json = buildExpenseJsonLd([{ q: "</script><script>alert(1)</script>", a: "a<b" }]);
    expect(json).not.toContain("<");
    expect(JSON.parse(json)["@graph"][2].mainEntity[0].name).toBe("</script><script>alert(1)</script>");
  });
});
