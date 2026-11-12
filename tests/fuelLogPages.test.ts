import { describe, expect, it } from "vitest";
import { BACKUP_MAX_RECORDS, BACKUP_MAX_TEXT_LENGTH } from "@/lib/backup";
import { RECORD_CSV_EXTRA_HEADERS, RECORDS_CSV_BASE_HEADERS } from "@/lib/csv";
import {
  FUEL_LOG_CANONICAL_URL,
  FUEL_LOG_DESCRIPTION,
  FUEL_LOG_ITEMS,
  FUEL_LOG_PATH,
  FUEL_LOG_TITLE,
  buildFuelLogJsonLd,
  fuelLogExample,
  fuelLogFaqs,
  partialExampleEfficiency,
} from "@/lib/fuelLogPage";
import {
  EXCEL_MAX_FILE_MB,
  EXCEL_MAX_RECORDS,
  FUEL_LOG_EXCEL_CANONICAL_URL,
  FUEL_LOG_EXCEL_DESCRIPTION,
  FUEL_LOG_EXCEL_PATH,
  FUEL_LOG_EXCEL_TITLE,
  OPTIONAL_COLUMNS,
  buildFuelLogExcelJsonLd,
  fuelLogExcelFaqs,
  sheetColumns,
} from "@/lib/fuelLogExcelPage";
import { detectFuelLensCsv, fuelLensCsvToBackup, parseFuelLensCsv } from "@/lib/importers/fuellensCsv";
import { applyFillChain } from "@/lib/fillChain";
import { aiAvailabilityCopy } from "@/lib/landingPage";
import { CTA_PAGES } from "@/lib/analytics/events";
import { FUEL_LOG_GUIDE_LINKS, PUBLIC_TOOL_LINKS, otherGuideLinks } from "@/lib/publicNav";
import sitemap from "@/app/sitemap";
import type { FuelRecord } from "@/lib/types";

const len = (s: string) => [...s].length;

describe("燃費記録のつけ方（/fuel-log）", () => {
  it("パス・表示名・canonical", () => {
    expect(FUEL_LOG_PATH).toBe("/fuel-log");
    expect(FUEL_LOG_TITLE).toBe("燃費記録のつけ方");
    expect(FUEL_LOG_CANONICAL_URL).toBe("https://fuel-lens.gadelog.com/fuel-log");
  });

  it("説明文は 110〜120 字", () => {
    expect(len(FUEL_LOG_DESCRIPTION)).toBeGreaterThanOrEqual(110);
    expect(len(FUEL_LOG_DESCRIPTION)).toBeLessThanOrEqual(120);
  });

  it("例の燃費と単価は calculateFuelMetrics の値（420 km・30 L・5,100 円 → 14 km/L・170 円/L）", () => {
    expect(fuelLogExample()).toEqual({ efficiency: 14, pricePerUnit: 170 });
  });

  it("部分給油の例は連鎖計算（applyFillChain）と同じ値", () => {
    const base = { vehicle_id: "v", gas_station: null, price_per_unit: null, total_cost: null, fuel_efficiency: null, created_at: "" };
    const records = [
      { ...base, id: "a", date: "2026-11-01", total_distance: 300, fuel_amount: 25, is_full: true },
      { ...base, id: "b", date: "2026-11-05", total_distance: 200, fuel_amount: 15, is_full: false },
      { ...base, id: "c", date: "2026-11-10", total_distance: 250, fuel_amount: 20, is_full: true },
    ] as FuelRecord[];
    const chained = applyFillChain(records, { distance_mode: "trip" });
    expect(chained.find((r) => r.id === "c")?.fuel_efficiency).toBe(partialExampleEfficiency());
    expect(partialExampleEfficiency()).toBe(12.86);
  });

  it("記録する項目は必須 4 つ", () => {
    expect(FUEL_LOG_ITEMS.filter((i) => i.required).map((i) => i.name)).toEqual([
      "給油日",
      "区間距離（km）",
      "給油量（L）",
      "支払総額（円）",
    ]);
  });

  it("FAQ は 3 問で、無料の答えはお試しの有無で landingPage と同じ注記を使う", () => {
    for (const trial of [true, false]) {
      const faqs = fuelLogFaqs(trial);
      expect(faqs).toHaveLength(3);
      expect(faqs.find((f) => f.q.includes("無料"))?.a).toContain(aiAvailabilityCopy(trial).faqFreeNote);
    }
  });

  it("構造化データは WebPage + FAQPage で、< をエスケープする", () => {
    const faqs = fuelLogFaqs(false);
    const data = JSON.parse(buildFuelLogJsonLd(faqs));
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "FAQPage"]);
    expect(data["@graph"][0].url).toBe(FUEL_LOG_CANONICAL_URL);
    expect(data["@graph"][1].mainEntity).toHaveLength(faqs.length);
    expect(buildFuelLogJsonLd([{ q: "</script>", a: "a<b" }])).not.toContain("<");
  });
});

describe("燃費管理をエクセルで（/fuel-log-excel）", () => {
  it("パス・表示名・canonical", () => {
    expect(FUEL_LOG_EXCEL_PATH).toBe("/fuel-log-excel");
    expect(FUEL_LOG_EXCEL_TITLE).toBe("燃費管理をエクセルで");
    expect(FUEL_LOG_EXCEL_CANONICAL_URL).toBe("https://fuel-lens.gadelog.com/fuel-log-excel");
  });

  it("説明文は 110〜120 字", () => {
    expect(len(FUEL_LOG_EXCEL_DESCRIPTION)).toBeGreaterThanOrEqual(110);
    expect(len(FUEL_LOG_EXCEL_DESCRIPTION)).toBeLessThanOrEqual(120);
  });

  it("列の例は FuelLens の全車両 CSV の列名・並びと同じで、燃費と単価の式は正しい列を指す", () => {
    const cols = sheetColumns();
    expect(cols.map((c) => c.header)).toEqual([...RECORDS_CSV_BASE_HEADERS]);
    expect(cols.map((c) => c.letter).join("")).toBe("ABCDEFGH");
    const fuel = cols.find((c) => c.header === "給油量(L)")!.letter;
    const cost = cols.find((c) => c.header === "支払総額(円)")!.letter;
    const distance = cols.find((c) => c.header === "走行距離(km)")!.letter;
    expect(cols.find((c) => c.header === "燃費(km/L)")!.input).toContain(`${distance}2/${fuel}2`);
    expect(cols.find((c) => c.header === "単価(円/L)")!.input).toContain(`${cost}2/${fuel}2`);
  });

  it("任意の列は取り込みの追加列と同じ名前", () => {
    expect(OPTIONAL_COLUMNS.map((c) => c.header)).toEqual(Object.values(RECORD_CSV_EXTRA_HEADERS));
  });

  it("上限は取り込みの実装（lib/backup.ts）と同じ", () => {
    expect(EXCEL_MAX_FILE_MB).toBe(BACKUP_MAX_TEXT_LENGTH / 1024 / 1024);
    expect(EXCEL_MAX_RECORDS).toBe(BACKUP_MAX_RECORDS);
  });

  it("ページのとおりに作ったシート（順番を入れ替え・単価と燃費は空・桁区切りあり）を取り込める", () => {
    const csv = [
      "日付,車両,走行距離(km),給油量(L),支払総額(円),単価(円/L),燃費(km/L),店舗名,満タン",
      "2026/11/01,メインカー,,30,\"5,100\",,,,はい",
      "2026/11/12,メインカー,420,30,\"5,100\",,,駅前店,はい",
      "2026/11/20,メインカー,200,15,2550,,,,いいえ",
      "日付なし,メインカー,100,10,1700,,,,",
    ].join("\n");
    expect(detectFuelLensCsv(csv)).toBe("all");
    const parsed = parseFuelLensCsv(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.vehicleNames).toEqual(["メインカー"]);
    expect(parsed.records).toHaveLength(3);
    expect(parsed.stats.skippedInvalid).toBe(1);
    expect(parsed.records[1]).toMatchObject({ date: "2026-11-12", total_distance: 420, fuel_amount: 30, total_cost: 5100, price_per_unit: 170 });
    expect(parsed.records[2].is_full).toBe(false);
    const backup = fuelLensCsvToBackup(parsed);
    expect(backup.vehicles).toHaveLength(1);
    expect(backup.vehicles[0].distance_mode).toBe("trip");
  });

  it("FAQ は 3 問で、無料の答えはお試しの有無で landingPage と同じ注記を使う", () => {
    for (const trial of [true, false]) {
      const faqs = fuelLogExcelFaqs(trial);
      expect(faqs).toHaveLength(3);
      expect(faqs.find((f) => f.q.includes("無料"))?.a).toContain(aiAvailabilityCopy(trial).faqFreeNote);
    }
  });

  it("構造化データは WebPage + FAQPage で、< をエスケープする", () => {
    const faqs = fuelLogExcelFaqs(false);
    const data = JSON.parse(buildFuelLogExcelJsonLd(faqs));
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "FAQPage"]);
    expect(data["@graph"][0].url).toBe(FUEL_LOG_EXCEL_CANONICAL_URL);
    expect(buildFuelLogExcelJsonLd([{ q: "</script>", a: "a<b" }])).not.toContain("<");
  });
});

describe("記録ガイドのナビ・サイトマップ・計測", () => {
  it("ガイドの表示名は各ページの定数と同じ", () => {
    expect(FUEL_LOG_GUIDE_LINKS).toEqual([
      { href: FUEL_LOG_PATH, label: FUEL_LOG_TITLE },
      { href: FUEL_LOG_EXCEL_PATH, label: FUEL_LOG_EXCEL_TITLE },
    ]);
    expect(otherGuideLinks(FUEL_LOG_PATH).map((l) => l.href)).toEqual([FUEL_LOG_EXCEL_PATH]);
  });

  it("/calc と区間ページのナビ（PUBLIC_TOOL_LINKS）には載せない", () => {
    for (const path of [FUEL_LOG_PATH, FUEL_LOG_EXCEL_PATH]) {
      expect(PUBLIC_TOOL_LINKS.some((l) => l.href === path)).toBe(false);
    }
  });

  it("サイトマップと CTA の計測対象に載る", () => {
    for (const path of [FUEL_LOG_PATH, FUEL_LOG_EXCEL_PATH]) {
      expect(sitemap().some((e) => e.url.endsWith(path))).toBe(true);
      expect((CTA_PAGES as readonly string[]).includes(path)).toBe(true);
    }
  });
});
