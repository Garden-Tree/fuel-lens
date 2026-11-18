import { describe, expect, it } from "vitest";
import { CAR_TYPE_EFFICIENCIES, computeGasCost, parseDistancePrefill } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import {
  HIGH_OCTANE_RATIO_PERCENT,
  ROUTES,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_FAQS,
  ROUTE_GAS_COST_PAGE_TITLE,
  ROUTE_SNIPPET_IDS,
  ROUTE_EXTRA_SOURCE,
  ROUTE_PRICE,
  buildRouteGasCostJsonLd,
  displayKm,
  reverseRouteName,
  routeCostTable,
  routeGasCostLink,
  routeGasCostOg,
  routePriceLabel,
  routeTotal,
  snippetRoutes,
  standardTotal,
  type RouteEntry,
} from "@/lib/routeGasCostPage";
import { formatJaDate } from "@/lib/format";

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
    expect(routePriceLabel()).toBe(
      `全国平均 ${NATIONAL_GAS_PRICE.regular.toFixed(1)}円/L（${formatJaDate(NATIONAL_GAS_PRICE.surveyDate)}調査）`
    );
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

  it("東京〜大阪（約 470 km）・普通車 13 km/L・170.1 円/L は片道 6,150 円、高速代 10,840 円で合計 16,990 円", () => {
    // 計算のテストは単価を固定する（全国平均は週次で自動更新される）
    const t = standardTotal(ROUTES[0], 170.1);
    expect(t).toEqual({ gasOneWay: 6150, gasRoundTrip: 12300, toll: 10840, totalOneWay: 16990, totalRoundTrip: 33980 });
  });

  it("OG 画像は東京〜大阪の全国平均の単価での片道の合計", () => {
    const t = standardTotal(ROUTES[0]);
    expect(t.gasOneWay).toBe(Math.round((470 / 13) * NATIONAL_GAS_PRICE.regular));
    expect(routeGasCostOg().content.formula.at(-2)).toEqual({ text: t.totalOneWay!.toLocaleString("ja-JP"), kind: "result" });
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

  it("区間のデータ: slug は from-to の英小文字、距離は正、名前は「A〜B」、取得日は「YYYY年M月D日」", () => {
    for (const route of ROUTES) {
      expect(route.id).toMatch(/^[a-z]+-[a-z]+$/);
      expect(route.sourceKm).toBeGreaterThan(0);
      expect(route.name.split("〜")).toHaveLength(2);
      expect(route.from.endsWith("IC") && route.to.endsWith("IC")).toBe(true);
      if (route.retrieved !== undefined) expect(route.retrieved).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日$/);
    }
  });

  it("種別: 2026-11-09 に足した 23 区間が行楽地、ほかの 22 区間が都市間", () => {
    const resort = ROUTES.filter((r) => r.kind === "resort");
    expect(resort).toHaveLength(23);
    expect(ROUTES.filter((r) => r.kind === "intercity")).toHaveLength(22);
    for (const r of ROUTES) expect(r.kind === "resort", r.id).toBe(r.retrieved === "2026年11月9日");
  });

  it("所要時間・休日・深夜・通常料金のデータの整合性", () => {
    for (const r of ROUTES) {
      // 所要時間は正の整数（分）で、平均時速が高速道路としてありえる範囲（50〜110 km/h）
      expect(Number.isInteger(r.durationMin), r.id).toBe(true);
      const speed = r.sourceKm / (r.durationMin! / 60);
      expect(speed, r.id).toBeGreaterThan(50);
      expect(speed, r.id).toBeLessThan(110);
      for (const t of [r.holidayToll!, r.nightToll!, r.cashToll!]) {
        expect(Number.isInteger(t.standard) && Number.isInteger(t.kei), r.id).toBe(true);
        expect(t.kei, r.id).toBeLessThan(t.standard);
      }
      // 割引は平日昼間の ETC 料金を超えず、通常料金（現金等）は ETC 料金以上
      expect(r.holidayToll!.standard, r.id).toBeLessThanOrEqual(r.toll!.standard);
      expect(r.holidayToll!.kei, r.id).toBeLessThanOrEqual(r.toll!.kei);
      expect(r.nightToll!.standard, r.id).toBeLessThan(r.toll!.standard);
      expect(r.nightToll!.kei, r.id).toBeLessThan(r.toll!.kei);
      expect(r.cashToll!.standard, r.id).toBeGreaterThanOrEqual(r.toll!.standard);
      expect(r.cashToll!.kei, r.id).toBeGreaterThanOrEqual(r.toll!.kei);
    }
    // 出発時刻が違うのは東京〜鹿児島（6:00）だけ
    expect(ROUTES.filter((r) => r.departure !== undefined).map((r) => [r.id, r.departure])).toEqual([["tokyo-kagoshima", "6:00"]]);
    expect(ROUTE_EXTRA_SOURCE.retrieved).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日$/);
  });

  it("高速代が null の区間はガソリン代だけで、合計は null", () => {
    const route: RouteEntry = { ...ROUTES[0], toll: null };
    const t = routeTotal(route, 13, null, 170.1);
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
    expect(ROUTE_GAS_COST_PAGE_TITLE).toContain(`${ROUTES.length}区間`);
    // 区間名の検索（「名古屋から大阪 車 ガソリン代」）に合わせ、代表の区間を「AからB」で出す。区間は ROUTES に実在する
    for (const id of ROUTE_SNIPPET_IDS) {
      const route = ROUTES.find((r) => r.id === id);
      expect(route).toBeDefined();
      expect(ROUTE_GAS_COST_DESCRIPTION).toContain(route!.name.replace("〜", "から"));
    }
    expect(ROUTE_GAS_COST_PAGE_TITLE).toContain("東京〜大阪");
    expect(ROUTE_GAS_COST_DESCRIPTION).toContain("高速代");
    expect(ROUTE_GAS_COST_DESCRIPTION.length).toBeLessThanOrEqual(130);
  });

  it("ハイオクの FAQ の割合は全国平均の単価から計算する", () => {
    const { regular, highOctane } = NATIONAL_GAS_PRICE;
    expect(HIGH_OCTANE_RATIO_PERCENT).toBe(Math.round((highOctane / regular - 1) * 100));
    expect(HIGH_OCTANE_RATIO_PERCENT).toBeGreaterThan(0);
    const faq = ROUTE_GAS_COST_FAQS.find((f) => f.a.includes(`約 ${HIGH_OCTANE_RATIO_PERCENT}%`))!;
    expect(faq.a).toContain(`レギュラー ${regular.toFixed(1)} 円/L`);
    expect(faq.a).toContain(`ハイオクの全国平均 ${highOctane.toFixed(1)} 円/L`);
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

describe("代表の区間（/gas-cost からのリンク）", () => {
  it("snippetRoutes は ROUTE_SNIPPET_IDS の順に区間を返す", () => {
    expect(snippetRoutes().map((r) => r.id)).toEqual([...ROUTE_SNIPPET_IDS]);
  });
});
