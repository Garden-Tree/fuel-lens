/**
 * 主要区間のガソリン代ページ（/route-gas-cost）のデータと純粋なロジック: 区間の距離、車種別の片道・往復のガソリン代、FAQ、構造化データ。
 * 燃費の目安（CAR_TYPE_EFFICIENCIES）と単価の例（EXAMPLE_PRICE）は /gas-cost と共有し、ここでは定義しない。
 */

import type { FaqEntry } from "./calcPage";
import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { CAR_TYPE_EFFICIENCIES, EXAMPLE_HIGH_OCTANE_PRICE, EXAMPLE_PRICE, GAS_COST_CALCULATOR_ID, GAS_COST_PATH, exampleCost } from "./gasCostPage";
import { WARIKAN_CALCULATOR_ID, WARIKAN_PATH } from "./warikanPage";

export const ROUTE_GAS_COST_PATH = "/route-gas-cost";
export const ROUTE_GAS_COST_PAGE_TITLE = "東京〜大阪のガソリン代はいくら？主要区間の片道・往復の目安 | FuelLens";
export const ROUTE_GAS_COST_DESCRIPTION =
  "東京〜大阪・東京〜名古屋・大阪〜福岡など主要12区間を高速道路で走ったときのガソリン代の目安を、軽自動車・普通車・ハイブリッド車・ミニバン別に片道・往復でまとめました。距離はNEXCOのルート検索で確認。";
export const ROUTE_GAS_COST_CANONICAL_URL = "https://fuel-lens.gadelog.com/route-gas-cost";

/** 距離の出典（ページ下部に出す） */
export const ROUTE_DISTANCE_SOURCE = {
  name: "NEXCO西日本「高速料金・ルート検索」",
  url: "https://search.w-nexco.co.jp/",
  /** 取得日 */
  retrieved: "2026年10月27日",
} as const;

export type RouteEntry = {
  id: string;
  /** 区間の表示名（例: 東京〜大阪） */
  name: string;
  /** 起点と終点の IC */
  from: string;
  to: string;
  /** 主な経路 */
  via: string;
  /** ルート検索の結果の距離（km）。出典の値をそのまま書く */
  sourceKm: number;
};

/**
 * 主要区間（高速道路だけで走る経路のうち、ルート検索で最短だったもの）。距離は ROUTE_DISTANCE_SOURCE で確認した値。
 * 確認できなかった区間は載せない。
 */
export const ROUTES: readonly RouteEntry[] = [
  { id: "tokyo-osaka", name: "東京〜大阪", from: "東京IC", to: "吹田IC", via: "新東名・伊勢湾岸道・新名神", sourceKm: 468.5 },
  { id: "tokyo-nagoya", name: "東京〜名古屋", from: "東京IC", to: "名古屋IC", via: "新東名・伊勢湾岸道", sourceKm: 314.6 },
  { id: "nagoya-osaka", name: "名古屋〜大阪", from: "名古屋IC", to: "吹田IC", via: "東名・名神", sourceKm: 189.1 },
  { id: "tokyo-shizuoka", name: "東京〜静岡", from: "東京IC", to: "静岡IC", via: "東名", sourceKm: 161.8 },
  { id: "tokyo-sendai", name: "東京〜仙台", from: "浦和IC", to: "仙台宮城IC", via: "東北道", sourceKm: 327.6 },
  { id: "tokyo-niigata", name: "東京〜新潟", from: "練馬IC", to: "新潟中央IC", via: "関越道・北陸道", sourceKm: 301.9 },
  { id: "tokyo-kanazawa", name: "東京〜金沢", from: "練馬IC", to: "金沢東IC", via: "関越道・上信越道・北陸道", sourceKm: 454.5 },
  { id: "nagoya-kanazawa", name: "名古屋〜金沢", from: "名古屋IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 259.8 },
  { id: "osaka-kanazawa", name: "大阪〜金沢", from: "吹田IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 289.7 },
  { id: "osaka-hiroshima", name: "大阪〜広島", from: "吹田IC", to: "広島IC", via: "新名神・山陽道", sourceKm: 339.5 },
  { id: "osaka-fukuoka", name: "大阪〜福岡", from: "吹田IC", to: "福岡IC", via: "新名神・山陽道・中国道・九州道", sourceKm: 616.2 },
  { id: "fukuoka-kagoshima", name: "福岡〜鹿児島", from: "福岡IC", to: "鹿児島IC", via: "九州道", sourceKm: 277.8 },
];

/** 表に出す距離（km）。出典の値を 5 km 単位に丸めた「約○km」。ガソリン代もこの距離で計算する */
export function displayKm(sourceKm: number): number {
  return Math.round(sourceKm / 5) * 5;
}

export type RouteCostRow = {
  route: RouteEntry;
  km: number;
  /** CAR_TYPE_EFFICIENCIES の順に、片道・往復のガソリン代（円）の表示文字列 */
  costs: { oneWay: string; roundTrip: string }[];
};

/** 区間別の表（単価はレギュラーの例）。値は /gas-cost の計算機と同じ computeGasCost で求める */
export function routeCostTable(price: number = EXAMPLE_PRICE): RouteCostRow[] {
  return ROUTES.map((route) => {
    const km = displayKm(route.sourceKm);
    return {
      route,
      km,
      costs: CAR_TYPE_EFFICIENCIES.map(({ efficiency }) => ({
        oneWay: exampleCost(km, efficiency, false, price),
        roundTrip: exampleCost(km, efficiency, true, price),
      })),
    };
  });
}

/** 区間の距離を入れたガソリン代の計算機へのリンク */
export function routeGasCostLink(km: number): string {
  return `${GAS_COST_PATH}?km=${km}#${GAS_COST_CALCULATOR_ID}`;
}

/** 区間の距離（往復）を入れた割り勘の計算機へのリンク */
export function routeWarikanLink(km: number): string {
  return `${WARIKAN_PATH}?km=${km}&trip=round#${WARIKAN_CALCULATOR_ID}`;
}

/** ハイオクがレギュラーより何 % 高いか（FAQ の文言。四捨五入した整数） */
export const HIGH_OCTANE_RATIO_PERCENT = Math.round((EXAMPLE_HIGH_OCTANE_PRICE / EXAMPLE_PRICE - 1) * 100);

/** FAQ（本文の表・注記で答えていることは載せない） */
export const ROUTE_GAS_COST_FAQS: FaqEntry[] = [
  {
    q: "下道（一般道）で行くとガソリン代は安くなりますか？",
    a: "一概には言えません。距離は高速道路より短くなることがありますが、信号や渋滞で止まる回数が増えると燃費が落ちやすくなります。下道の距離を地図アプリで調べて、ガソリン代計算ツールで比べてください。",
  },
  {
    q: "ハイオク車だといくらになりますか？",
    a: `表はレギュラー ${EXAMPLE_PRICE} 円/L の例です。ハイオクを ${EXAMPLE_HIGH_OCTANE_PRICE} 円/L とすると、表の金額の約 ${HIGH_OCTANE_RATIO_PERCENT}% 増しが目安です。`,
  },
];

/** OG / Twitter 画像（東京〜大阪・普通車・片道の例） */
export function routeGasCostOg(): { alt: string; content: ToolOgImageContent } {
  const row = routeCostTable()[0];
  const standardIndex = CAR_TYPE_EFFICIENCIES.findIndex((c) => c.id === "standard");
  const eff = CAR_TYPE_EFFICIENCIES[standardIndex].efficiency;
  return {
    alt: "主要区間のガソリン代 - 東京〜大阪など主要区間の片道・往復のガソリン代の目安（FuelLens）",
    content: {
      title: "主要区間のガソリン代",
      subtitle: `${row.route.name}など片道・往復の目安（車種別）`,
      resultColor: "money",
      formula: [
        { text: String(row.km), kind: "num" },
        { text: "km", kind: "unit" },
        { text: "÷", kind: "unit" },
        { text: String(eff), kind: "num" },
        { text: "km/L", kind: "unit" },
        { text: "×", kind: "unit" },
        { text: String(EXAMPLE_PRICE), kind: "num" },
        { text: "円/L", kind: "unit" },
        { text: "=", kind: "unit" },
        { text: row.costs[standardIndex].oneWay, kind: "result" },
        { text: "円", kind: "unit" },
      ],
    },
  };
}

/** 構造化データ（WebPage + FAQPage）。固定の文言だけから作り、`<` をエスケープする */
export function buildRouteGasCostJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: "主要区間のガソリン代の目安",
        url: ROUTE_GAS_COST_CANONICAL_URL,
        inLanguage: "ja",
        description:
          "主要区間を高速道路で走ったときの片道・往復のガソリン代の目安を、軽自動車・普通車・ハイブリッド車・ミニバン・ワンボックスの燃費の目安で計算した表です。",
      },
      {
        "@type": "FAQPage",
        mainEntity: ROUTE_GAS_COST_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
