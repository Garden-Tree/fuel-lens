import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { CAR_TYPE_EFFICIENCIES } from "@/lib/gasCostPage";
import { NATIONAL_GAS_PRICE } from "@/lib/nationalGasPrice";
import { WARIKAN_QUERY_KEYS, computeWarikan, parseWarikanQuery } from "@/lib/warikanPage";
import { ROUTES, gasCostYen, routePath, standardTotal, type RouteEntry } from "@/lib/routeGasCostPage";
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
  formatDuration,
  oneWayLiters,
  restStops,
  routeFaqs,
  routeInsights,
  routeStaticParams,
  routeTollComparison,
  routeWarikanLink,
  routeWarikanInput,
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

  it("JSON-LD は WebPage + BreadcrumbList + FAQPage で < をエスケープする", () => {
    for (const route of ROUTES) {
      const json = buildRouteDetailJsonLd(route);
      expect(json).not.toContain("<");
      const data = JSON.parse(json);
      expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebPage", "BreadcrumbList", "FAQPage"]);
      expect(data["@graph"][0].url).toBe(routeCanonicalUrl(route));
      expect(data["@graph"][2].mainEntity.map((q: { name: string }) => q.name)).toEqual(routeFaqs(route).map((f) => f.q));
    }
  });

  it("OG 画像の式はガソリン代 + 高速代 = 合計", () => {
    const f = routeDetailOg(tokyoOsaka).content.formula;
    const t = standardTotal(tokyoOsaka);
    expect(t.toll).toBe(10840);
    expect(f.map((p) => p.text).join("")).toBe(`${yen(t.gasOneWay)}円+10,840円=${yen(t.totalOneWay!)}円`);
  });
});

describe("区間ごとの段落（所要時間・休日・深夜）と FAQ", () => {
  const hakone = findRoute("tokyo-hakone")!;
  const takamatsu = findRoute("osaka-takamatsu")!;

  it("所要時間の表示と、2 時間ごとに休憩したときの途中の休憩の回数", () => {
    expect(formatDuration(54)).toBe("54分");
    expect(formatDuration(120)).toBe("2時間");
    expect(formatDuration(281)).toBe("4時間41分");
    expect(restStops(54)).toBe(0);
    expect(restStops(120)).toBe(0);
    expect(restStops(121)).toBe(1);
    expect(restStops(871)).toBe(7);
  });

  it("東京〜箱根: 54 分で休憩なし、休日は 220 円安く、深夜がいちばん安い。ETC なしは ETC と同じ", () => {
    const [time, holiday, night, fuel] = routeInsights(hakone);
    expect(time).toContain("渋滞なしの目安が54分");
    expect(time).toContain("途中の休憩は要りません");
    expect(time).toContain("日帰りで往復すると、運転は渋滞なしでも計1時間48分");
    expect(holiday).toContain("普通車の高速代は1,820円");
    expect(holiday).toContain("片道220円（約11%）安く");
    const perPerson = computeWarikan(routeWarikanInput(hakone, 4, 1820)).perPerson!;
    expect(holiday).toContain(`家族4人なら1人${yen(perPerson)}円`);
    expect(holiday).toContain(`${yen(gasCostYen(65, 13, true) + 1820 * 2)}円`);
    expect(night).toContain("1,430円（平日昼間より610円安い）");
    expect(night).toContain("さらに390円安く、この区間では深夜がいちばん安く");
    expect(fuel).toContain(`普通車が約${oneWayLiters(hakone, 13).toFixed(1)}L`);
    expect(routeFaqs(hakone)[0].a).toContain("平日昼間の ETC 料金と同じ");
  });

  it("大阪〜高松: 休日のほうが深夜より安い区間は、そう書く", () => {
    const night = routeInsights(takamatsu).find((p) => p.includes("深夜0時"))!;
    expect(night).toContain("休日の料金のほうが380円安く");
    expect(routeFaqs(takamatsu)[0].a).toContain("普通車で9,250円");
    expect(routeFaqs(takamatsu)[0].a).toContain("2,370円高く");
  });

  it("段落と FAQ は区間ごとに違い、区間の数字を含む", () => {
    const all = ROUTES.map((r) => routeInsights(r));
    for (let i = 0; i < all.length; i++) {
      expect(all[i]).toHaveLength(4);
      for (let j = i + 1; j < all.length; j++) {
        // 同じ段落を持つ区間の組はない（所要時間・休日・深夜・ガソリンの量のどれも区間ごとに違う）
        for (let k = 0; k < 4; k++) expect(all[i][k], `${ROUTES[i].id} / ${ROUTES[j].id}`).not.toBe(all[j][k]);
      }
    }
    for (const r of ROUTES) {
      const text = routeInsights(r).join("");
      expect(text).toContain(formatDuration(r.durationMin!));
      expect(text).toContain(`${yen(r.holidayToll!.standard)}円`);
      expect(text).toContain(`${yen(r.nightToll!.standard)}円`);
      expect(text).not.toMatch(/undefined|NaN|null/);
      const faqs = routeFaqs(r);
      expect(faqs.length).toBeGreaterThanOrEqual(2);
      expect(faqs.length).toBeLessThanOrEqual(4);
      for (const f of faqs) expect(f.q).toContain(r.name);
    }
  });

  it("本文の段落と FAQ で同じ金額の話を繰り返さない（FAQ の通常料金・ハイオクは本文に出ない）", () => {
    for (const r of ROUTES) {
      const body = routeInsights(r).join("");
      expect(body).not.toContain("通常料金");
      expect(body).not.toContain("ハイオク");
      expect(body).not.toContain(`${yen(r.cashToll!.standard)}円`);
    }
  });

  it("確認できなかった項目は段落・表・FAQ に出さない", () => {
    const route: RouteEntry = { ...hakone, durationMin: null, holidayToll: null, nightToll: null, cashToll: null };
    const paragraphs = routeInsights(route);
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain("で使うガソリン");
    expect(routeTollComparison(route).map((r) => r.label)).toEqual(["平日昼間"]);
    expect(routeFaqs(route).map((f) => f.q)).toEqual([`ハイオク車だと${route.name}のガソリン代はいくら？`]);
    expect(routeTollComparison({ ...hakone, toll: null })).toEqual([]);
  });

  it("高速代の比較表は平日昼間・休日・深夜の順（ETC なしは FAQ で答えるので入れない）。東京〜鹿児島は 6:00 出発", () => {
    expect(routeTollComparison(hakone).map((r) => r.label)).toEqual(["平日昼間", "休日", "深夜"]);
    expect(routeTollComparison(hakone)[1].note).toBe("ETC・土曜 10:20 出発");
    expect(routeTollComparison(findRoute("tokyo-kagoshima")!)[0].note).toBe("ETC・平日 6:00 出発");
  });
});
