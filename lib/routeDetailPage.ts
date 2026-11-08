/**
 * 区間ごとのページ（/route-gas-cost/[slug]）の純粋なロジック: 車種別のガソリン代と高速代の合計、人数で割った額、
 * 割り勘の計算機へのリンク、近くの区間、メタデータ、構造化データ、OG 画像。
 * 区間のデータ・丸め・単価は routeGasCostPage.ts（→ gasCostPage.ts の computeGasCost）に任せ、ここでは複製しない。
 */

import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { CAR_TYPE_EFFICIENCIES } from "./gasCostPage";
import { WARIKAN_CALCULATOR_ID, WARIKAN_PATH, buildWarikanQuery, computeWarikan, type WarikanInput } from "./warikanPage";
import {
  ROUTES,
  ROUTE_GAS_COST_CANONICAL_URL,
  ROUTE_PRICE,
  SITE_ORIGIN,
  STANDARD_EFFICIENCY,
  displayKm,
  reverseRouteName,
  routePath,
  routeTotal,
  standardTotal,
  totalFormula,
  yenRough,
  type RouteEntry,
  type RouteTotal,
} from "./routeGasCostPage";

export function findRoute(slug: string): RouteEntry | undefined {
  return ROUTES.find((r) => r.id === slug);
}

/** generateStaticParams の値（全区間） */
export function routeStaticParams(): { slug: string }[] {
  return ROUTES.map((r) => ({ slug: r.id }));
}

export function routeCanonicalUrl(route: RouteEntry): string {
  return `${SITE_ORIGIN}${routePath(route)}`;
}

/**
 * タイトル。モバイルの検索結果で切れない長さ（` | FuelLens` を除いて 32 字以内）に、区間名と片道の金額を先に出す。
 * 金額は説明文と同じ概数（普通車・ガソリン代 + 高速代。高速代が未確認ならガソリン代だけ）
 */
export function routePageTitle(route: RouteEntry): string {
  const t = standardTotal(route);
  if (t.totalOneWay == null) return `${route.name}の車のガソリン代は片道約${yenRough(t.gasOneWay)}円 | FuelLens`;
  return `${route.name}の車のガソリン代と高速代は片道約${yenRough(t.totalOneWay)}円 | FuelLens`;
}

export function routePageDescription(route: RouteEntry): string {
  const km = displayKm(route.sourceKm);
  const t = standardTotal(route);
  const reverse = reverseRouteName(route);
  if (t.totalOneWay == null || t.totalRoundTrip == null) {
    return `${route.name}（約${km}km）を車で走ったときのガソリン代の目安を車種別に計算。普通車なら片道約${yenRough(t.gasOneWay)}円。${reverse}も同じ金額です。`;
  }
  return `${route.name}（約${km}km）を車で走ると、普通車でガソリン代と高速代（ETC）の合計は片道約${yenRough(t.totalOneWay)}円・往復約${yenRough(t.totalRoundTrip)}円。${reverse}も同じです。車種別・人数で割った額も。`;
}

export type RouteCarRow = {
  id: string;
  label: string;
  efficiency: number;
  /** この車種の高速代の区分 */
  tollClass: "軽自動車等" | "普通車";
  total: RouteTotal;
};

/** 車種別（CAR_TYPE_EFFICIENCIES の順）のガソリン代と合計。軽自動車は軽自動車等の料金、ほかは普通車の料金 */
export function routeCarRows(route: RouteEntry): RouteCarRow[] {
  return CAR_TYPE_EFFICIENCIES.map(({ id, label, efficiency }) => {
    const isKei = id === "kei";
    const toll = route.toll ? (isKei ? route.toll.kei : route.toll.standard) : null;
    return { id, label, efficiency, tollClass: isKei ? "軽自動車等" : "普通車", total: routeTotal(route, efficiency, toll) };
  });
}

/** 人数で割る例の人数 */
export const SPLIT_PEOPLE = [2, 3, 4] as const;
/** 1 人あたりの切り上げの単位（割り勘の計算機の既定と同じ） */
export const SPLIT_ROUNDING = 100;
export const SPLIT_ROUNDING_NOTE = `${SPLIT_ROUNDING}円単位で切り上げ`;

/** 普通車・往復の割り勘の入力（高速代は往復分）。割り勘の計算機と同じ computeWarikan で計算し、同じ値をリンクに載せる */
export function routeWarikanInput(route: RouteEntry, people: number): WarikanInput {
  return {
    distance: String(displayKm(route.sourceKm)),
    trip: "round",
    efficiency: String(STANDARD_EFFICIENCY),
    price: String(ROUTE_PRICE),
    toll: route.toll ? String(route.toll.standard * 2) : "",
    people: String(people),
    driver: "all",
    rounding: SPLIT_ROUNDING,
  };
}

/** 普通車・往復で 2〜4 人で割ったときの 1 人あたり（円） */
export function routeSplits(route: RouteEntry): { people: number; perPerson: number }[] {
  return SPLIT_PEOPLE.map((people) => ({ people, perPerson: computeWarikan(routeWarikanInput(route, people)).perPerson ?? 0 }));
}

/** 割り勘の計算機へのリンク（普通車・往復・4 人の値を入れた状態） */
export function routeWarikanLink(route: RouteEntry, people: number = 4): string {
  return `${WARIKAN_PATH}?${buildWarikanQuery(routeWarikanInput(route, people))}#${WARIKAN_CALCULATOR_ID}`;
}

/** 近くの区間（同じ都市を含む区間を優先し、足りなければ一覧の前後で埋める）。最大 3 件 */
export function neighborRoutes(route: RouteEntry, max = 3): RouteEntry[] {
  const cities = new Set(route.name.split("〜"));
  const others = ROUTES.filter((r) => r.id !== route.id);
  const sharing = others.filter((r) => r.name.split("〜").some((c) => cities.has(c)));
  const index = ROUTES.findIndex((r) => r.id === route.id);
  const nearby = [...others].sort(
    (a, b) => Math.abs(ROUTES.indexOf(a) - index) - Math.abs(ROUTES.indexOf(b) - index)
  );
  const result: RouteEntry[] = [];
  for (const r of [...sharing, ...nearby]) {
    if (result.length >= max) break;
    if (!result.includes(r)) result.push(r);
  }
  return result;
}

/** OG / Twitter 画像（普通車・片道のガソリン代 + 高速代） */
export function routeDetailOg(route: RouteEntry): { alt: string; content: ToolOgImageContent } {
  return {
    alt: `${route.name}の車のガソリン代と高速代 - 普通車・片道の目安（FuelLens）`,
    content: {
      title: `${route.name}の車のガソリン代と高速代`,
      subtitle: route.toll ? "普通車・片道のガソリン代＋高速代（ETC）" : "普通車・片道のガソリン代",
      resultColor: "money",
      formula: totalFormula(standardTotal(route)),
    },
  };
}

/** 構造化データ（WebPage + BreadcrumbList）。固定のデータだけから作り、`<` をエスケープする */
export function buildRouteDetailJsonLd(route: RouteEntry): string {
  const url = routeCanonicalUrl(route);
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: `${route.name}の車のガソリン代と高速代の目安`,
        url,
        inLanguage: "ja",
        description: routePageDescription(route),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "FuelLens", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "主要区間のガソリン代と高速代", item: ROUTE_GAS_COST_CANONICAL_URL },
          { "@type": "ListItem", position: 3, name: route.name, item: url },
        ],
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
