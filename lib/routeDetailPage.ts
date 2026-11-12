/**
 * 区間ごとのページ（/route-gas-cost/[slug]）の純粋なロジック: 車種別のガソリン代と高速代の合計、人数で割った額、
 * 区間ごとの数字から書く段落（所要時間・休日・深夜の料金。routeInsights）と FAQ（routeFaqs）、
 * 割り勘の計算機へのリンク、近くの区間、メタデータ、構造化データ、OG 画像。
 * 区間のデータ・丸め・単価は routeGasCostPage.ts（→ gasCostPage.ts の computeGasCost）に任せ、ここでは複製しない。
 */

import type { FaqEntry } from "./calcPage";
import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { CAR_TYPE_EFFICIENCIES, formatPrice } from "./gasCostPage";
import { NATIONAL_GAS_PRICE } from "./nationalGasPrice";
import { WARIKAN_CALCULATOR_ID, WARIKAN_PATH, buildWarikanQuery, computeWarikan, type WarikanInput } from "./warikanPage";
import {
  ROUTES,
  ROUTE_EXTRA_SOURCE,
  ROUTE_GAS_COST_CANONICAL_URL,
  ROUTE_PRICE,
  SITE_ORIGIN,
  STANDARD_EFFICIENCY,
  displayKm,
  gasCostYen,
  reverseRouteName,
  routePath,
  routeTotal,
  standardTotal,
  totalFormula,
  yen,
  yenRough,
  type RouteEntry,
  type RouteToll,
  type RouteTotal,
} from "./routeGasCostPage";
import { jsonLdString } from "./jsonLd";

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

/**
 * 普通車・往復の割り勘の入力（高速代は往復分）。割り勘の計算機と同じ computeWarikan で計算し、同じ値をリンクに載せる。
 * oneWayToll は片道の高速代（省略時は平日昼間の普通車の ETC 料金。休日の 1 人あたりでは休日の料金を渡す）
 */
export function routeWarikanInput(route: RouteEntry, people: number, oneWayToll: number | null = route.toll?.standard ?? null): WarikanInput {
  return {
    distance: String(displayKm(route.sourceKm)),
    trip: "round",
    efficiency: String(STANDARD_EFFICIENCY),
    price: String(ROUTE_PRICE),
    toll: oneWayToll != null ? String(oneWayToll * 2) : "",
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

/** 所要時間（分）の表示（54分 / 4時間41分 / 3時間） */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 休憩の目安の間隔（分）。2 時間ごとに休憩するとして、途中の休憩の回数を数える */
export const REST_INTERVAL_MIN = 120;

/** 渋滞なしの所要時間で、2 時間ごとに休憩したときの途中の休憩の回数（2 時間ちょうどまでは 0 回） */
export function restStops(durationMin: number): number {
  return Math.max(0, Math.ceil(durationMin / REST_INTERVAL_MIN) - 1);
}

/** 片道で使うガソリンの量（L、小数 1 桁）。表と同じ 5 km 単位の距離で計算する */
export function oneWayLiters(route: RouteEntry, efficiency: number): number {
  return Math.round((displayKm(route.sourceKm) / efficiency) * 10) / 10;
}

export type RouteTollComparisonRow = { label: string; note: string; toll: RouteToll };

/**
 * 高速代の比較表（平日昼間・休日・深夜の ETC 料金）。確認できた行だけ。平日昼間の料金が無ければ空。
 * ETC なしの通常料金は FAQ（routeFaqs）で答えるので、表には入れない
 */
export function routeTollComparison(route: RouteEntry): RouteTollComparisonRow[] {
  if (!route.toll) return [];
  const dep = route.departure ?? ROUTE_EXTRA_SOURCE.departure;
  const rows: (RouteTollComparisonRow | null)[] = [
    { label: "平日昼間", note: `ETC・平日 ${dep} 出発`, toll: route.toll },
    route.holidayToll ? { label: "休日", note: `ETC・土曜 ${dep} 出発`, toll: route.holidayToll } : null,
    route.nightToll ? { label: "深夜", note: "ETC・平日 0:00 出発", toll: route.nightToll } : null,
  ];
  return rows.filter((r): r is RouteTollComparisonRow => r !== null);
}

const KEI = CAR_TYPE_EFFICIENCIES.find((c) => c.id === "kei")!;

/**
 * 区間ごとの数字から言えることだけを書いた段落（所要時間と休憩、休日割引、深夜割引、ガソリンの量）。
 * 確認できなかった項目（null）の段落は出さない。文は区間の数字で変わる
 */
export function routeInsights(route: RouteEntry): string[] {
  const paragraphs: string[] = [];

  if (route.durationMin != null) {
    const d = route.durationMin;
    const speed = Math.round(route.sourceKm / (d / 60));
    const rests = restStops(d);
    const restText =
      rests === 0
        ? "2時間以内に着くので、2時間ごとに休憩するとしても途中の休憩は要りません。"
        : `2時間ごとに休憩するなら、途中で${rests}回は休憩を入れることになります。`;
    const roundTrip = `${route.kind === "resort" ? "日帰りで往復すると" : "往復すると"}、運転は渋滞なしでも計${formatDuration(d * 2)}です。`;
    paragraphs.push(
      `${route.from}から${route.to}までは、ルート検索の所要時間で渋滞なしの目安が${formatDuration(d)}（休憩を含まない。平均時速は約${speed}km）。${restText}${roundTrip}`
    );
  }

  if (route.toll && route.holidayToll) {
    const diff = route.toll.standard - route.holidayToll.standard;
    if (diff > 0) {
      const pct = Math.round((diff / route.toll.standard) * 100);
      const total = gasCostYen(displayKm(route.sourceKm), STANDARD_EFFICIENCY, true) + route.holidayToll.standard * 2;
      const perPerson = computeWarikan(routeWarikanInput(route, 4, route.holidayToll.standard)).perPerson ?? 0;
      paragraphs.push(
        `土日祝（休日割引の適用除外日を除く）に走ると、休日割引で普通車の高速代は${yen(route.holidayToll.standard)}円になり、平日昼間より片道${yen(diff)}円（約${pct}%）安くなります。` +
          `休日に往復すると、ガソリン代と合わせて${yen(total)}円で、家族4人なら1人${yen(perPerson)}円（${SPLIT_ROUNDING_NOTE}）です。`
      );
    } else {
      paragraphs.push(`この区間は土曜に検索しても普通車の高速代が${yen(route.toll.standard)}円で、平日昼間と変わりませんでした（休日割引が付かない）。`);
    }
  }

  if (route.toll && route.nightToll) {
    const diff = route.toll.standard - route.nightToll.standard;
    let compare = "";
    if (route.holidayToll) {
      const vsHoliday = route.holidayToll.standard - route.nightToll.standard;
      compare =
        vsHoliday > 0
          ? `休日の料金よりさらに${yen(vsHoliday)}円安く、この区間では深夜がいちばん安くなります。`
          : vsHoliday < 0
            ? `ただしこの区間では休日の料金のほうが${yen(-vsHoliday)}円安く、深夜に走るより土日祝の昼間のほうが安くなります。`
            : "休日の料金と同じです。";
    }
    paragraphs.push(
      diff > 0
        ? `平日の深夜0時に入口のICを出ると、深夜割引で普通車の高速代は${yen(route.nightToll.standard)}円（平日昼間より${yen(diff)}円安い）。${compare}`
        : `平日の深夜0時に出ても、普通車の高速代は${yen(route.nightToll.standard)}円で平日昼間と変わりませんでした。`
    );
  }

  const litersStd = oneWayLiters(route, STANDARD_EFFICIENCY);
  const litersKei = oneWayLiters(route, KEI.efficiency);
  paragraphs.push(
    `${route.name}で使うガソリンは片道で普通車が約${litersStd.toFixed(1)}L（燃費${STANDARD_EFFICIENCY}km/L）、軽自動車が約${litersKei.toFixed(1)}L（${KEI.efficiency}km/L）で、往復では普通車で約${(litersStd * 2).toFixed(1)}Lです。`
  );
  return paragraphs;
}

/** 区間ページの FAQ（本文で答えていないことだけ。ETC なしの料金と、ハイオク車のガソリン代） */
export function routeFaqs(route: RouteEntry): FaqEntry[] {
  const faqs: FaqEntry[] = [];
  if (route.toll && route.cashToll) {
    const diff = route.cashToll.standard - route.toll.standard;
    faqs.push({
      q: `ETC カードが無いと${route.name}の高速代はいくら？`,
      a:
        `ETC を使わない通常料金（現金等）は普通車で${yen(route.cashToll.standard)}円、軽自動車等で${yen(route.cashToll.kei)}円です。` +
        (diff > 0 ? `平日昼間の ETC 料金より普通車で${yen(diff)}円高く、` : "平日昼間の ETC 料金と同じですが、") +
        "休日割引・深夜割引は付きません。",
    });
  }
  const km = displayKm(route.sourceKm);
  const regular = gasCostYen(km, STANDARD_EFFICIENCY, false);
  const highOctane = gasCostYen(km, STANDARD_EFFICIENCY, false, NATIONAL_GAS_PRICE.highOctane);
  const highOctaneRound = gasCostYen(km, STANDARD_EFFICIENCY, true, NATIONAL_GAS_PRICE.highOctane);
  faqs.push({
    q: `ハイオク車だと${route.name}のガソリン代はいくら？`,
    a: `ハイオクの全国平均 ${formatPrice(NATIONAL_GAS_PRICE.highOctane)}円/L で、燃費${STANDARD_EFFICIENCY}km/L の車なら片道${yen(highOctane)}円・往復${yen(highOctaneRound)}円です。レギュラーより片道${yen(highOctane - regular)}円高くなります。`,
  });
  return faqs;
}

/**
 * 近くの区間（同じ都市を含む区間を優先し、足りなければ一覧の前後で埋める）。最大 3 件。
 * どちらも一覧で近い順に選ぶので、同じ都市から出る行楽地の区間（一覧でまとめて並べている）どうしがつながる
 */
export function neighborRoutes(route: RouteEntry, max = 3): RouteEntry[] {
  const cities = new Set(route.name.split("〜"));
  const index = ROUTES.findIndex((r) => r.id === route.id);
  const nearby = ROUTES.filter((r) => r.id !== route.id).sort(
    (a, b) => Math.abs(ROUTES.indexOf(a) - index) - Math.abs(ROUTES.indexOf(b) - index)
  );
  const sharing = nearby.filter((r) => r.name.split("〜").some((c) => cities.has(c)));
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

/** 構造化データ（WebPage + BreadcrumbList + FAQPage）。固定のデータだけから作り、`<` をエスケープする */
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
      {
        "@type": "FAQPage",
        mainEntity: routeFaqs(route).map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return jsonLdString(data);
}
