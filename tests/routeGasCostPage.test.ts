import { describe, expect, it } from "vitest";
import { CAR_TYPE_EFFICIENCIES, EXAMPLE_PRICE, computeGasCost, parseDistancePrefill } from "@/lib/gasCostPage";
import { parseWarikanQuery } from "@/lib/warikanPage";
import {
  HIGH_OCTANE_RATIO_PERCENT,
  ROUTES,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_FAQS,
  ROUTE_GAS_COST_PAGE_TITLE,
  buildRouteGasCostJsonLd,
  displayKm,
  routeCostTable,
  routeGasCostLink,
  routeGasCostOg,
  routeWarikanLink,
} from "@/lib/routeGasCostPage";

describe("区間別の表", () => {
  it("距離は出典の値を 5 km 単位に丸める", () => {
    expect(displayKm(468.5)).toBe(470);
    expect(displayKm(616.2)).toBe(615);
    expect(displayKm(301.9)).toBe(300);
    expect(displayKm(327.6)).toBe(330);
    const tokyoOsaka = routeCostTable().find((r) => r.route.id === "tokyo-osaka")!;
    expect(tokyoOsaka.km).toBe(470);
  });

  it("区間は重複せず、全セルが computeGasCost（片道・往復）と一致する", () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
    for (const { km, costs } of routeCostTable()) {
      expect(costs).toHaveLength(CAR_TYPE_EFFICIENCIES.length);
      costs.forEach(({ oneWay, roundTrip }, i) => {
        const input = { distance: String(km), efficiency: String(CAR_TYPE_EFFICIENCIES[i].efficiency), price: String(EXAMPLE_PRICE), people: "" };
        expect(oneWay).toBe(computeGasCost({ ...input, roundTrip: false }).cost);
        expect(roundTrip).toBe(computeGasCost({ ...input, roundTrip: true }).cost);
      });
    }
  });

  it("東京〜大阪（約 470 km）・普通車 13 km/L は片道 6,146 円・往復 12,292 円", () => {
    const row = routeCostTable()[0];
    const standard = CAR_TYPE_EFFICIENCIES.findIndex((c) => c.id === "standard");
    expect(row.costs[standard]).toEqual({ oneWay: "6,146", roundTrip: "12,292" });
    expect(routeGasCostOg().content.formula.at(-2)).toEqual({ text: "6,146", kind: "result" });
  });

  it("各行のリンクは計算機と割り勘の計算機が受け取れる形", () => {
    for (const { km } of routeCostTable()) {
      const gas = routeGasCostLink(km);
      expect(gas).toBe(`/gas-cost?km=${km}#gas-cost-calculator`);
      expect(parseDistancePrefill(gas.slice(gas.indexOf("?"), gas.indexOf("#")))).toBe(String(km));
      const warikan = routeWarikanLink(km);
      expect(warikan).toBe(`/warikan?km=${km}&trip=round#warikan-calculator`);
      expect(parseWarikanQuery(warikan.slice(warikan.indexOf("?"), warikan.indexOf("#")))).toMatchObject({
        distance: String(km),
        trip: "round",
      });
    }
  });
});

describe("ページの文言と構造化データ", () => {
  it("タイトル・説明文", () => {
    expect(ROUTE_GAS_COST_PAGE_TITLE).toContain("東京〜大阪のガソリン代");
    expect(ROUTE_GAS_COST_PAGE_TITLE.endsWith("| FuelLens")).toBe(true);
    expect(ROUTE_GAS_COST_DESCRIPTION).toContain(`${ROUTES.length}区間`);
    expect(ROUTE_GAS_COST_DESCRIPTION.length).toBeLessThanOrEqual(130);
  });

  it("ハイオクの FAQ の割合は単価の例から計算する", () => {
    expect(HIGH_OCTANE_RATIO_PERCENT).toBe(6);
    expect(ROUTE_GAS_COST_FAQS.some((f) => f.a.includes(`約 ${HIGH_OCTANE_RATIO_PERCENT}%`))).toBe(true);
  });

  it("FAQ は 2〜4 問で、JSON-LD は < をエスケープする", () => {
    expect(ROUTE_GAS_COST_FAQS.length).toBeGreaterThanOrEqual(2);
    expect(ROUTE_GAS_COST_FAQS.length).toBeLessThanOrEqual(4);
    const json = buildRouteGasCostJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "FAQPage"]);
    expect(data["@graph"][0].url).toBe("https://fuel-lens.gadelog.com/route-gas-cost");
  });
});
