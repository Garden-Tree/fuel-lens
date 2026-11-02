import { describe, expect, it } from "vitest";
import { CAR_TYPE_EFFICIENCIES, computeGasCost, parseDistancePrefill } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import {
  HIGH_OCTANE_RATIO_PERCENT,
  ROUTES,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_FAQS,
  ROUTE_GAS_COST_PAGE_TITLE,
  ROUTE_PRICE,
  buildRouteGasCostJsonLd,
  displayKm,
  formatJaDate,
  reverseRouteName,
  routeCostTable,
  routeGasCostLink,
  routeGasCostOg,
  routePriceLabel,
  routeTotal,
  standardTotal,
  type RouteEntry,
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

  it("単価は全国平均のレギュラー", () => {
    expect(ROUTE_PRICE).toBe(NATIONAL_GAS_PRICE.regular);
    expect(formatJaDate("2026-10-26")).toBe("2026年10月26日");
    expect(routePriceLabel()).toBe("全国平均 170.1円/L（2026年10月26日調査）");
  });

  it("区間は重複せず、全セルが computeGasCost（片道・往復）と一致する", () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length);
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
    for (const { km, costs } of routeCostTable()) {
      expect(costs).toHaveLength(CAR_TYPE_EFFICIENCIES.length);
      costs.forEach(({ oneWay, roundTrip }, i) => {
        const input = { distance: String(km), efficiency: String(CAR_TYPE_EFFICIENCIES[i].efficiency), price: String(ROUTE_PRICE), people: "" };
        expect(oneWay).toBe(computeGasCost({ ...input, roundTrip: false }).cost);
        expect(roundTrip).toBe(computeGasCost({ ...input, roundTrip: true }).cost);
      });
    }
  });

  it("東京〜大阪（約 470 km）・普通車 13 km/L は片道 6,150 円、高速代 10,840 円で合計 16,990 円", () => {
    const t = standardTotal(ROUTES[0]);
    expect(t).toEqual({ gasOneWay: 6150, gasRoundTrip: 12300, toll: 10840, totalOneWay: 16990, totalRoundTrip: 33980 });
    expect(routeGasCostOg().content.formula.at(-2)).toEqual({ text: "16,990", kind: "result" });
  });

  it("合計 = ガソリン代 + 高速代（往復は高速代 × 2）。全区間に普通車・軽の料金がある", () => {
    for (const route of ROUTES) {
      expect(route.toll).not.toBeNull();
      expect(route.toll!.kei).toBeLessThan(route.toll!.standard);
      const t = standardTotal(route);
      expect(t.totalOneWay).toBe(t.gasOneWay + route.toll!.standard);
      expect(t.totalRoundTrip).toBe(t.gasRoundTrip + route.toll!.standard * 2);
      const gas = computeGasCost({ distance: String(displayKm(route.sourceKm)), efficiency: "13", price: String(ROUTE_PRICE), people: "", roundTrip: false }).cost;
      expect(t.gasOneWay).toBe(Number(gas!.replace(/,/g, "")));
    }
  });

  it("高速代が null の区間はガソリン代だけで、合計は null", () => {
    const route: RouteEntry = { ...ROUTES[0], toll: null };
    const t = routeTotal(route, 13, null);
    expect(t.toll).toBeNull();
    expect(t.totalOneWay).toBeNull();
    expect(t.totalRoundTrip).toBeNull();
    expect(t.gasOneWay).toBe(6150);
    expect(standardTotal(route).totalOneWay).toBeNull();
  });

  it("逆向きの表記", () => {
    expect(reverseRouteName(ROUTES[0])).toBe("大阪→東京");
  });

  it("計算機へのリンクは /gas-cost が受け取れる形", () => {
    for (const { km } of routeCostTable()) {
      const gas = routeGasCostLink(km);
      expect(gas).toBe(`/gas-cost?km=${km}#gas-cost-calculator`);
      expect(parseDistancePrefill(gas.slice(gas.indexOf("?"), gas.indexOf("#")))).toBe(String(km));
    }
  });
});

describe("ページの文言と構造化データ", () => {
  it("タイトル・説明文", () => {
    expect(ROUTE_GAS_COST_PAGE_TITLE).toContain("ガソリン代と高速代");
    expect(ROUTE_GAS_COST_PAGE_TITLE.endsWith("| FuelLens")).toBe(true);
    expect(ROUTE_GAS_COST_DESCRIPTION).toContain(`${ROUTES.length}区間`);
    expect(ROUTE_GAS_COST_DESCRIPTION.length).toBeLessThanOrEqual(130);
  });

  it("ハイオクの FAQ の割合は全国平均の単価から計算する", () => {
    expect(HIGH_OCTANE_RATIO_PERCENT).toBe(6);
    expect(ROUTE_GAS_COST_FAQS.some((f) => f.a.includes(`約 ${HIGH_OCTANE_RATIO_PERCENT}%`) && f.a.includes("181.0"))).toBe(true);
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
