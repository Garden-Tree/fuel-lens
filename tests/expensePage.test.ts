import { describe, expect, it } from "vitest";
import { RECORDS_CSV_HEADERS, buildRecordsCsv } from "@/lib/csv";
import {
  APPORTION_EXAMPLE_MONTHLY_COST,
  APPORTION_EXAMPLE_TOTAL_KM,
  APPORTION_EXAMPLE_WORK_KM,
  EXPENSE_CANONICAL_URL,
  EXPENSE_CSV_COLUMNS_TEXT,
  EXPENSE_DESCRIPTION,
  EXPENSE_PATH,
  EXPENSE_TITLE,
  apportionByDistance,
  buildExpenseJsonLd,
  costPerKm,
  costPerKmTable,
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
  it("6 問で、CSV の答えに列名が入る", () => {
    for (const trial of [true, false]) {
      const faqs = expenseFaqs(trial);
      expect(faqs).toHaveLength(6);
      const csvFaq = faqs.find((f) => f.q.includes("CSV"));
      for (const col of RECORDS_CSV_HEADERS) expect(csvFaq?.a).toContain(col);
    }
  });

  it("無料の答えはお試しの有無で landingPage と同じ注記を使う", () => {
    expect(expenseFaqs(true)[5].a).toContain(aiAvailabilityCopy(true).faqFreeNote);
    expect(expenseFaqs(false)[5].a).toContain(aiAvailabilityCopy(false).faqFreeNote);
  });
});

describe("按分と距離単価の計算", () => {
  it("例: 12,000 円・1,000km のうち 600km → 60%・7,200 円", () => {
    expect(
      apportionByDistance(APPORTION_EXAMPLE_MONTHLY_COST, APPORTION_EXAMPLE_TOTAL_KM, APPORTION_EXAMPLE_WORK_KM)
    ).toEqual({ ratioPercent: 60, workCost: 7200, privateCost: 4800 });
  });

  it("割り切れない割合は小数第 1 位、金額は四捨五入で、仕事分とプライベート分の合計が合う", () => {
    expect(apportionByDistance(10000, 300, 100)).toEqual({ ratioPercent: 33.3, workCost: 3333, privateCost: 6667 });
  });

  it("不正な入力は null", () => {
    expect(apportionByDistance(12000, 0, 0)).toBeNull();
    expect(apportionByDistance(12000, 1000, 1200)).toBeNull();
    expect(apportionByDistance(12000, 1000, -1)).toBeNull();
    expect(apportionByDistance(-1, 1000, 500)).toBeNull();
    expect(apportionByDistance(Number.NaN, 1000, 500)).toBeNull();
  });

  it("1km あたりのガソリン代は 単価 ÷ 燃費", () => {
    expect(costPerKm(170, 20)).toBe(8.5);
    expect(costPerKm(170, 0)).toBeNull();
    expect(costPerKm(0, 20)).toBeNull();
  });

  it("早見表は 燃費 × 単価 の並びで小数第 1 位", () => {
    const table = costPerKmTable();
    expect(table.map((r) => r.efficiency)).toEqual([10, 15, 20, 25]);
    expect(table[0].costs).toEqual(["15.0", "17.0", "19.0"]);
    expect(table[1].costs).toEqual(["10.0", "11.3", "12.7"]);
    expect(table[2].costs).toEqual(["7.5", "8.5", "9.5"]);
    expect(table[3].costs).toEqual(["6.0", "6.8", "7.6"]);
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
    expect(faqPage.mainEntity).toHaveLength(6);
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
