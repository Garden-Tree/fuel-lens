/**
 * 主要区間のガソリン代ページ（/route-gas-cost）のデータと純粋なロジック: 区間の距離と高速代、車種別の片道・往復のガソリン代、
 * 普通車のガソリン代 + 高速代の合計、FAQ、構造化データ。区間ごとのページ（/route-gas-cost/[slug]）の計算は routeDetailPage.ts。
 * 燃費の目安（CAR_TYPE_EFFICIENCIES）と金額の丸め（exampleCost → computeGasCost）は /gas-cost と共有し、ここでは定義しない。
 * 単価は全国平均（NATIONAL_GAS_PRICE）。
 */

import type { FaqEntry } from "./calcPage";
import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { CAR_TYPE_EFFICIENCIES, GAS_COST_CALCULATOR_ID, GAS_COST_PATH, exampleCost } from "./gasCostPage";
import { NATIONAL_GAS_PRICE } from "./nationalGasPrice";

export const ROUTE_GAS_COST_PATH = "/route-gas-cost";
export const ROUTE_GAS_COST_PAGE_TITLE = "車のガソリン代と高速代の目安｜東京〜大阪など主要12区間の片道・往復 | FuelLens";
export const ROUTE_GAS_COST_DESCRIPTION =
  "東京〜大阪・名古屋〜大阪・大阪〜福岡など主要12区間を車で走ったときのガソリン代と高速代（ETC）の合計を片道・往復でまとめました。逆方向も同じ金額です。軽自動車・普通車・ハイブリッド車・ミニバン別のガソリン代も。";
export const SITE_ORIGIN = "https://fuel-lens.gadelog.com";
export const ROUTE_GAS_COST_CANONICAL_URL = `${SITE_ORIGIN}${ROUTE_GAS_COST_PATH}`;

/** 区間のページで使うガソリン単価（円/L）。全国平均のレギュラー */
export const ROUTE_PRICE: number = NATIONAL_GAS_PRICE.regular;

/** 単価の表示（例: 全国平均 170.1円/L（2026年10月26日調査）） */
export function routePriceLabel(): string {
  return `全国平均 ${ROUTE_PRICE}円/L（${formatJaDate(NATIONAL_GAS_PRICE.surveyDate)}調査）`;
}

/** YYYY-MM-DD を「2026年10月26日」にする */
export function formatJaDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

/** 距離・高速代の出典（ページ下部に出す） */
export const ROUTE_DISTANCE_SOURCE = {
  name: "NEXCO西日本「高速料金・ルート検索」",
  url: "https://search.w-nexco.co.jp/",
  /** 距離の取得日 */
  retrieved: "2026年10月27日",
  /** 高速代の取得日 */
  tollRetrieved: "2026年11月2日",
} as const;

/** 高速代の条件（本文の前提に出す） */
export const ROUTE_TOLL_NOTE =
  "高速代は平日昼間の ETC 料金（休日割引・深夜割引なし）で、IC までの首都高・阪神高速などの都市高速は含みません。";

export type RouteToll = {
  /** 普通車の ETC 料金（円） */
  standard: number;
  /** 軽自動車等の ETC 料金（円） */
  kei: number;
};

export type RouteEntry = {
  /** URL の slug（/route-gas-cost/tokyo-osaka） */
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
  /** 同じ IC・同じ経路（距離が一致するもの）の ETC 料金。確認できなければ null（ガソリン代だけ出す） */
  toll: RouteToll | null;
};

/**
 * 主要区間（高速道路だけで走る経路のうち、ルート検索で最短だったもの）。距離は ROUTE_DISTANCE_SOURCE で確認した値。
 * 確認できなかった区間は載せない。
 *
 * 高速代: 2026-11-02 に NEXCO西日本「高速料金・ルート検索」（https://search.w-nexco.co.jp/）で、
 * 各 IC 間を 2026-11-02（月）10:20 出発・普通車 / 軽・自動二輪で検索し、距離が sourceKm と一致する経路の ETC 料金を写した。
 * IC は検索画面の候補の次のもの（括弧内は検索の IC コード）:
 *   東京（E1 東名, 1010001）/ 名古屋（E1 東名, 1010256）/ 吹田（E1 名神, 1011161）/ 静岡（E1 東名, 1010111）/
 *   浦和（仙台方面）（E4 東北道, 1040013）/ 仙台宮城（E4, 1040241）/ 練馬（E17 関越道, 1800001）/ 新潟中央（1440096）/
 *   金沢東（E8 北陸道, 1080121）/ 広島（E2 山陽道, 1020206）/ 福岡（E3 九州道, 1030061）/ 鹿児島（E3 九州道, 1030261）
 * 料金は経路で変わる（例: 大阪〜広島は中国道経由だと高い）ので、距離の経路と同じ経路の料金を使うこと。
 */
export const ROUTES: readonly RouteEntry[] = [
  { id: "tokyo-osaka", name: "東京〜大阪", from: "東京IC", to: "吹田IC", via: "新東名・伊勢湾岸道・新名神", sourceKm: 468.5, toll: { standard: 10840, kei: 8810 } },
  { id: "tokyo-nagoya", name: "東京〜名古屋", from: "東京IC", to: "名古屋IC", via: "新東名・伊勢湾岸道", sourceKm: 314.6, toll: { standard: 7320, kei: 5890 } },
  { id: "nagoya-osaka", name: "名古屋〜大阪", from: "名古屋IC", to: "吹田IC", via: "東名・名神", sourceKm: 189.1, toll: { standard: 5120, kei: 4130 } },
  { id: "tokyo-shizuoka", name: "東京〜静岡", from: "東京IC", to: "静岡IC", via: "東名", sourceKm: 161.8, toll: { standard: 4300, kei: 3470 } },
  { id: "tokyo-sendai", name: "東京〜仙台", from: "浦和IC", to: "仙台宮城IC", via: "東北道", sourceKm: 327.6, toll: { standard: 7440, kei: 5990 } },
  { id: "tokyo-niigata", name: "東京〜新潟", from: "練馬IC", to: "新潟中央IC", via: "関越道・北陸道", sourceKm: 301.9, toll: { standard: 7000, kei: 5640 } },
  { id: "tokyo-kanazawa", name: "東京〜金沢", from: "練馬IC", to: "金沢東IC", via: "関越道・上信越道・北陸道", sourceKm: 454.5, toll: { standard: 9890, kei: 7940 } },
  { id: "nagoya-kanazawa", name: "名古屋〜金沢", from: "名古屋IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 259.8, toll: { standard: 5990, kei: 4830 } },
  { id: "osaka-kanazawa", name: "大阪〜金沢", from: "吹田IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 289.7, toll: { standard: 6780, kei: 5460 } },
  { id: "osaka-hiroshima", name: "大阪〜広島", from: "吹田IC", to: "広島IC", via: "新名神・山陽道", sourceKm: 339.5, toll: { standard: 7250, kei: 5830 } },
  { id: "osaka-fukuoka", name: "大阪〜福岡", from: "吹田IC", to: "福岡IC", via: "新名神・山陽道・中国道・九州道", sourceKm: 616.2, toll: { standard: 12570, kei: 10180 } },
  { id: "fukuoka-kagoshima", name: "福岡〜鹿児島", from: "福岡IC", to: "鹿児島IC", via: "九州道", sourceKm: 277.8, toll: { standard: 6330, kei: 5100 } },
];

/** 表に出す距離（km）。出典の値を 5 km 単位に丸めた「約○km」。ガソリン代もこの距離で計算する */
export function displayKm(sourceKm: number): number {
  return Math.round(sourceKm / 5) * 5;
}

/** 区間名を逆向きにした表記（東京〜大阪 → 大阪→東京） */
export function reverseRouteName(route: Pick<RouteEntry, "name">): string {
  const [a, b] = route.name.split("〜");
  return `${b}→${a}`;
}

/** 金額（円、整数）の 3 桁区切り */
export const yen = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

/** ガソリン代（円、整数）。exampleCost（= computeGasCost）の表示文字列から戻すので丸めは計算機と同じ */
export function gasCostYen(km: number, efficiency: number, roundTrip: boolean, price: number = ROUTE_PRICE): number {
  return Number(exampleCost(km, efficiency, roundTrip, price).replace(/,/g, ""));
}

export type RouteTotal = {
  gasOneWay: number;
  gasRoundTrip: number;
  /** 片道の高速代（null なら未確認） */
  toll: number | null;
  /** ガソリン代 + 高速代。高速代が null なら null */
  totalOneWay: number | null;
  /** 往復のガソリン代 + 高速代 × 2 */
  totalRoundTrip: number | null;
};

/** 区間・燃費・高速代から片道・往復のガソリン代と合計を出す */
export function routeTotal(route: RouteEntry, efficiency: number, toll: number | null, price: number = ROUTE_PRICE): RouteTotal {
  const km = displayKm(route.sourceKm);
  const gasOneWay = gasCostYen(km, efficiency, false, price);
  const gasRoundTrip = gasCostYen(km, efficiency, true, price);
  return {
    gasOneWay,
    gasRoundTrip,
    toll,
    totalOneWay: toll == null ? null : gasOneWay + toll,
    totalRoundTrip: toll == null ? null : gasRoundTrip + toll * 2,
  };
}

/** 普通車の燃費の目安（km/L） */
export const STANDARD_EFFICIENCY: number = CAR_TYPE_EFFICIENCIES.find((c) => c.id === "standard")!.efficiency;

/** 普通車の合計（ガソリン代 + 普通車の ETC 料金） */
export function standardTotal(route: RouteEntry, price: number = ROUTE_PRICE): RouteTotal {
  return routeTotal(route, STANDARD_EFFICIENCY, route.toll?.standard ?? null, price);
}

export type RouteCostRow = {
  route: RouteEntry;
  km: number;
  /** CAR_TYPE_EFFICIENCIES の順に、片道・往復のガソリン代（円）の表示文字列 */
  costs: { oneWay: string; roundTrip: string }[];
};

/** 区間別・車種別のガソリン代の表。値は /gas-cost の計算機と同じ computeGasCost で求める */
export function routeCostTable(price: number = ROUTE_PRICE): RouteCostRow[] {
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

/** 区間ページのパス */
export function routePath(route: Pick<RouteEntry, "id">): string {
  return `${ROUTE_GAS_COST_PATH}/${route.id}`;
}

/** 区間の距離を入れたガソリン代の計算機へのリンク */
export function routeGasCostLink(km: number): string {
  return `${GAS_COST_PATH}?km=${km}#${GAS_COST_CALCULATOR_ID}`;
}

/** ハイオクがレギュラーより何 % 高いか（FAQ の文言。四捨五入した整数） */
export const HIGH_OCTANE_RATIO_PERCENT = Math.round((NATIONAL_GAS_PRICE.highOctane / NATIONAL_GAS_PRICE.regular - 1) * 100);

/** FAQ（本文の表・注記で答えていることは載せない） */
export const ROUTE_GAS_COST_FAQS: FaqEntry[] = [
  {
    q: "下道（一般道）で行くとガソリン代は安くなりますか？",
    a: "一概には言えません。距離は高速道路より短くなることがありますが、信号や渋滞で止まる回数が増えると燃費が落ちやすくなります。下道の距離を地図アプリで調べて、ガソリン代計算ツールで比べてください。",
  },
  {
    q: "ハイオク車だといくらになりますか？",
    a: `ガソリン代は全国平均のレギュラー ${NATIONAL_GAS_PRICE.regular} 円/L で計算しています。ハイオクの全国平均 ${NATIONAL_GAS_PRICE.highOctane.toFixed(1)} 円/L で走ると、ガソリン代は約 ${HIGH_OCTANE_RATIO_PERCENT}% 増しが目安です。`,
  },
  {
    q: "土日や深夜に走ると高速代は安くなりますか？",
    a: "ETC の休日割引（地方部の区間）や深夜割引で安くなることがあります。対象の区間・時間帯や適用されない日は NEXCO の割引の案内で確認してください。",
  },
];

/** OG / Twitter 画像（東京〜大阪・普通車・片道の合計の例） */
export function routeGasCostOg(): { alt: string; content: ToolOgImageContent } {
  const route = ROUTES[0];
  const t = standardTotal(route);
  return {
    alt: "車のガソリン代と高速代 - 東京〜大阪など主要区間の片道・往復の合計の目安（FuelLens）",
    content: {
      title: "車のガソリン代と高速代",
      subtitle: `${route.name}など主要区間の片道・往復の目安（普通車・ETC）`,
      resultColor: "money",
      formula: totalFormula(t),
    },
  };
}

/** 「ガソリン代 + 高速代 = 合計」の画像用の式（高速代が無ければガソリン代だけ） */
export function totalFormula(t: RouteTotal): ToolOgImageContent["formula"] {
  if (t.toll == null || t.totalOneWay == null) {
    return [
      { text: "ガソリン代", kind: "unit" },
      { text: yen(t.gasOneWay), kind: "result" },
      { text: "円", kind: "unit" },
    ];
  }
  return [
    { text: yen(t.gasOneWay), kind: "num" },
    { text: "円", kind: "unit" },
    { text: "+", kind: "unit" },
    { text: yen(t.toll), kind: "num" },
    { text: "円", kind: "unit" },
    { text: "=", kind: "unit" },
    { text: yen(t.totalOneWay), kind: "result" },
    { text: "円", kind: "unit" },
  ];
}

/** 構造化データ（WebPage + FAQPage）。固定の文言だけから作り、`<` をエスケープする */
export function buildRouteGasCostJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        name: "主要区間の車のガソリン代と高速代の目安",
        url: ROUTE_GAS_COST_CANONICAL_URL,
        inLanguage: "ja",
        description:
          "主要区間を車で走ったときの片道・往復のガソリン代と高速代（ETC）の合計の目安と、軽自動車・普通車・ハイブリッド車・ミニバン・ワンボックス別のガソリン代の表です。",
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
