import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { CAR_TYPE_EFFICIENCIES } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import { WARIKAN_QUERY_KEYS, computeWarikan, parseWarikanQuery } from "@/lib/warikanPage";
import { ROUTES, routePath, standardTotal, type RouteEntry } from "@/lib/routeGasCostPage";
import {
  buildRouteDetailJsonLd,
  findRoute,
  neighborRoutes,
  routeCanonicalUrl,
  routeCarRows,
  routeDetailOg,
  routePageDescription,
  routePageTitle,
  routeSplits,
  routeStaticParams,
  routeWarikanLink,
} from "@/lib/routeDetailPage";

const tokyoOsaka = findRoute("tokyo-osaka")!;
// 単価（全国平均）は週次で自動更新されるので、金額の期待値は standardTotal から作る
const yen = (v: number) => v.toLocaleString("ja-JP");
const yenRough = (v: number) => yen(Math.round(v / 100) * 100);

describe("区間ページの一覧", () => {
  it("slug は一意で URL に使える形。全区間が静的パラメータとサイトマップに載る", () => {
    const slugs = ROUTES.map((r) => r.id);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)+$/);
    expect(routeStaticParams()).toEqual(slugs.map((slug) => ({ slug })));
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    for (const r of ROUTES) expect(urls).toContain(routePath(r));
    expect(findRoute("unknown")).toBeUndefined();
  });

  it("タイトル・説明文・canonical", () => {
    const t0 = standardTotal(tokyoOsaka);
    expect(routePageTitle(tokyoOsaka)).toBe(`東京〜大阪の車のガソリン代と高速代は片道約${yenRough(t0.totalOneWay!)}円 | FuelLens`);
    expect(routeCanonicalUrl(tokyoOsaka)).toBe("https://fuel-lens.gadelog.com/route-gas-cost/tokyo-osaka");
    for (const r of ROUTES) {
      const d = routePageDescription(r);
      expect(d.length).toBeLessThanOrEqual(130);
      expect(d).toContain(r.name);
    }
    const t = standardTotal(tokyoOsaka);
    expect(routePageDescription(tokyoOsaka)).toContain(`片道約${yenRough(t.totalOneWay!)}円・往復約${yenRough(t.totalRoundTrip!)}円`);
    expect(routePageDescription(tokyoOsaka)).toContain("大阪→東京も同じ");
  });
});

describe("車種別の合計と割り勘", () => {
  it("軽自動車は軽自動車等、ほかは普通車の料金で合計する", () => {
    const rows = routeCarRows(tokyoOsaka);
    expect(rows.map((r) => r.id)).toEqual(CAR_TYPE_EFFICIENCIES.map((c) => c.id));
    for (const r of rows) {
      const toll = r.id === "kei" ? 8810 : 10840;
      expect(r.total.toll).toBe(toll);
      expect(r.total.totalOneWay).toBe(r.total.gasOneWay + toll);
      expect(r.total.totalRoundTrip).toBe(r.total.gasRoundTrip + toll * 2);
    }
  });

  it("2〜4 人の 1 人あたりは往復の合計を 100 円単位で切り上げ", () => {
    const total = standardTotal(tokyoOsaka).totalRoundTrip!;
    expect(routeSplits(tokyoOsaka)).toEqual([2, 3, 4].map((n) => ({ people: n, perPerson: Math.ceil(total / n / 100) * 100 })));
  });

  it("割り勘のリンクは /warikan が読めるキーだけで、開くと同じ結果になる", () => {
    for (const route of ROUTES) {
      const link = routeWarikanLink(route);
      expect(link.startsWith("/warikan?")).toBe(true);
      expect(link.endsWith("#warikan-calculator")).toBe(true);
      const search = link.slice(link.indexOf("?"), link.indexOf("#"));
      for (const key of new URLSearchParams(search).keys()) expect(WARIKAN_QUERY_KEYS).toContain(key as never);
      const input = parseWarikanQuery(search)!;
      expect(input).toMatchObject({ trip: "round", efficiency: "13", price: String(NATIONAL_GAS_PRICE.regular), toll: String(route.toll!.standard * 2), people: "4" });
      const result = computeWarikan(input);
      expect(result.total).toBe(standardTotal(route).totalRoundTrip);
      expect(result.perPerson).toBe(routeSplits(route).find((s) => s.people === 4)!.perPerson);
    }
  });

  it("高速代が null の区間はガソリン代だけで割り、リンクに toll を載せない", () => {
    const route: RouteEntry = { ...tokyoOsaka, toll: null };
    const rows = routeCarRows(route);
    expect(rows.every((r) => r.total.totalOneWay === null)).toBe(true);
    const link = routeWarikanLink(route);
    expect(new URLSearchParams(link.slice(link.indexOf("?"), link.indexOf("#"))).has("toll")).toBe(false);
    const gasRound = standardTotal(route).gasRoundTrip;
    expect(routeSplits(route)[0].perPerson).toBe(Math.ceil(gasRound / 2 / 100) * 100);
    expect(routePageDescription(route)).not.toContain("高速代");
    expect(routePageTitle(route)).not.toContain("高速代");
    expect(routePageTitle(route)).toContain(`片道約${yenRough(standardTotal(route).gasOneWay)}円`);
    expect(routeDetailOg(route).content.formula.some((p) => p.kind === "result")).toBe(true);
  });
});

describe("近くの区間・構造化データ", () => {
  it("近くの区間は自分を含まず、同じ都市を含む区間を優先して 3 件", () => {
    for (const route of ROUTES) {
      const n = neighborRoutes(route);
      expect(n).toHaveLength(3);
      expect(n).not.toContain(route);
      expect(new Set(n).size).toBe(3);
    }
    const names = neighborRoutes(tokyoOsaka).map((r) => r.name);
    expect(names.every((n) => n.includes("東京") || n.includes("大阪"))).toBe(true);
    // 現在の全区間で、近くの区間は起点か終点の都市が同じ区間だけで埋まる（一覧の前後で埋める分は使わない）
    for (const route of ROUTES) {
      const cities = route.name.split("〜");
      for (const n of neighborRoutes(route)) expect(n.name.split("〜").some((c) => cities.includes(c)), `${route.id} → ${n.id}`).toBe(true);
    }
  });

  it("同じ都市の区間は一覧で近い順に選ぶ（まとめて並べた行楽地の区間どうしがつながる）", () => {
    const route = findRoute("tokyo-karuizawa")!;
    const index = ROUTES.indexOf(route);
    const ids = neighborRoutes(route).map((r) => r.id);
    expect(ids).toEqual([ROUTES[index - 1].id, ROUTES[index + 1].id, ROUTES[index - 2].id]);
  });

  it("JSON-LD は WebPage + BreadcrumbList で < をエスケープする", () => {
    for (const route of ROUTES) {
      const json = buildRouteDetailJsonLd(route);
      expect(json).not.toContain("<");
      const data = JSON.parse(json);
      expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
      expect(data["@graph"][0].url).toBe(routeCanonicalUrl(route));
    }
  });

  it("OG 画像の式はガソリン代 + 高速代 = 合計", () => {
    const f = routeDetailOg(tokyoOsaka).content.formula;
    const t = standardTotal(tokyoOsaka);
    expect(t.toll).toBe(10840);
    expect(f.map((p) => p.text).join("")).toBe(`${yen(t.gasOneWay)}円+10,840円=${yen(t.totalOneWay!)}円`);
  });
});
