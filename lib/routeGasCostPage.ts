/**
 * 主要区間のガソリン代ページ（/route-gas-cost）のデータと純粋なロジック: 区間の距離と高速代、車種別の片道・往復のガソリン代、
 * 普通車のガソリン代 + 高速代の合計、FAQ、構造化データ。区間ごとのページ（/route-gas-cost/[slug]）の計算は routeDetailPage.ts。
 * 燃費の目安（CAR_TYPE_EFFICIENCIES）と金額の丸め（exampleCost・exampleCostYen → computeGasCost）は /gas-cost と共有し、ここでは定義しない。
 * 単価は全国平均（NATIONAL_GAS_PRICE）。
 */

import type { FaqEntry } from "./calcPage";
import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { CAR_TYPE_EFFICIENCIES, GAS_COST_CALCULATOR_ID, GAS_COST_PATH, exampleCost, exampleCostYen, formatPrice } from "./gasCostPage";
import { NATIONAL_GAS_PRICE } from "./nationalGasPrice";
import { jsonLdString } from "./jsonLd";
import { formatInt, formatJaDate } from "./format";

export const ROUTE_GAS_COST_PATH = "/route-gas-cost";
export const SITE_ORIGIN = "https://fuel-lens.gadelog.com";
export const ROUTE_GAS_COST_CANONICAL_URL = `${SITE_ORIGIN}${ROUTE_GAS_COST_PATH}`;

/** 区間のページで使うガソリン単価（円/L）。全国平均のレギュラー */
export const ROUTE_PRICE: number = NATIONAL_GAS_PRICE.regular;

/** 単価の表示（例: 全国平均 170.1円/L（2026年10月26日調査）） */
export function routePriceLabel(): string {
  return `全国平均 ${formatPrice(ROUTE_PRICE)}円/L（${formatJaDate(NATIONAL_GAS_PRICE.surveyDate)}調査）`;
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
  /** 距離と高速代をまとめて取得した日（例: 2026年11月8日）。省略時は ROUTE_DISTANCE_SOURCE の取得日 */
  retrieved?: string;
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
 *
 * retrieved が RETRIEVED_20261108 の区間: 2026-11-08 に同じ検索で、2026-11-09（月）10:20 出発・普通車 / 軽・自動二輪の
 * 距離と ETC 料金をまとめて写した（東京〜鹿児島だけは 10:20 出発だと深夜 0〜4 時にかかり深夜割引が入るため 6:00 出発）。
 * 阪神高速・一般道を通る経路は除き、残った候補の先頭（既存の区間と同じ選び方）を使った。追加の IC:
 *   京都東（E1 名神, 1011126。京都南 1011131 より手前で、東京・名古屋からの距離が短い）/ 岡山（E2 山陽道, 1020096）/
 *   高松中央（E11 高松道, 1611126。高速道路だけの候補は神戸淡路鳴門道経由の 1 本だけで、瀬戸中央道経由は候補に出ない）/
 *   盛岡（E4 東北道, 1040366）
 *
 * retrieved が RETRIEVED_20261109 の区間（行楽地への区間）: 2026-11-09 に同じ検索（距離順）で、2026-11-09（月）10:20 出発・
 * 普通車 / 軽・自動二輪の距離と ETC 料金（現金料金ではなく ETC の列）をまとめて写した。首都高・阪神高速・名古屋高速などの
 * 都市高速と一般道を通る経路は除き、残った候補の先頭を使った（名古屋〜伊勢・大阪〜城崎温泉は先頭が都市高速経由なので 2 番目）。
 * 距離と料金は IC までで、IC から温泉街・観光地までの一般道は含まない。追加の IC:
 *   調布（E20 中央道, 1101016。高井戸は一般道から八王子方面に入れないため）/ 三郷（E6 常磐道, 1400001）/
 *   箱根口（E84 西湘BP, 5010041）/ 沼津（E1 東名, 1010076）/ 河口湖（E68 中央道, 1103086）/ 長坂（E20 中央道, 1101156）/
 *   松本（E19 長野道, 1820021）/ 渋川伊香保（E17 関越道, 1800091）/ 碓氷軽井沢（E18 上信越道, 1810036）/
 *   長野（E18 上信越道, 1810086）/ 日光（E81 日光宇都宮道路, 5017021）/ 那須（E4 東北道, 1040116）/ 水戸（E6 常磐道, 1400081）/
 *   高山（E67 中部縦貫道, 5051020）/ 白川郷（E41 東海北陸道, 1830101）/ 伊勢（E23 伊勢道, 1710061）/
 *   鳴門（E28 神戸淡路鳴門道, 1611001）/ 南紀白浜（E42 紀勢道, 1730640）/ 日高神鍋高原（E72 北近畿豊岡道, 5048070）/
 *   与謝天橋立（E9 山陰近畿道, 9050010）/ 長浜（E8 北陸道, 1080011）/ 熊本（E3 九州道, 1030141）/ 長崎（E34 長崎道, 1311096）/
 *   湯布院（E34 大分道, 1312051）/ 別府（E10 東九州道, 1302280）
 * 大阪〜白浜は吹田（名神, 1011161）で検索すると、結果の起点が吹田（近畿道, 1073003）になる（1073003 で検索しても同じ距離・料金）。
 * from は他の大阪発と同じ「吹田IC」と書く。
 */
/** 2026-11-08 に追加した区間の取得日 */
const RETRIEVED_20261108 = "2026年11月8日";
/** 2026-11-09 に追加した区間（行楽地への区間）の取得日 */
const RETRIEVED_20261109 = "2026年11月9日";

export const ROUTES: readonly RouteEntry[] = [
  { id: "tokyo-osaka", name: "東京〜大阪", from: "東京IC", to: "吹田IC", via: "新東名・伊勢湾岸道・新名神", sourceKm: 468.5, toll: { standard: 10840, kei: 8810 } },
  { id: "tokyo-nagoya", name: "東京〜名古屋", from: "東京IC", to: "名古屋IC", via: "新東名・伊勢湾岸道", sourceKm: 314.6, toll: { standard: 7320, kei: 5890 } },
  { id: "nagoya-osaka", name: "名古屋〜大阪", from: "名古屋IC", to: "吹田IC", via: "東名・名神", sourceKm: 189.1, toll: { standard: 5120, kei: 4130 } },
  { id: "tokyo-kyoto", name: "東京〜京都", from: "東京IC", to: "京都東IC", via: "新東名・伊勢湾岸道・新名神・名神", sourceKm: 431.5, toll: { standard: 10070, kei: 8130 }, retrieved: RETRIEVED_20261108 },
  { id: "tokyo-hiroshima", name: "東京〜広島", from: "東京IC", to: "広島IC", via: "新東名・伊勢湾岸道・新名神・山陽道", sourceKm: 786.2, toll: { standard: 16940, kei: 13630 }, retrieved: RETRIEVED_20261108 },
  { id: "tokyo-fukuoka", name: "東京〜福岡", from: "東京IC", to: "福岡IC", via: "新東名・伊勢湾岸道・新名神・山陽道・中国道・九州道", sourceKm: 1062.9, toll: { standard: 22310, kei: 18000 }, retrieved: RETRIEVED_20261108 },
  { id: "tokyo-kagoshima", name: "東京〜鹿児島", from: "東京IC", to: "鹿児島IC", via: "新東名・伊勢湾岸道・新名神・山陽道・中国道・九州道", sourceKm: 1340.7, toll: { standard: 27510, kei: 22100 }, retrieved: RETRIEVED_20261108 },
  { id: "tokyo-shizuoka", name: "東京〜静岡", from: "東京IC", to: "静岡IC", via: "東名", sourceKm: 161.8, toll: { standard: 4300, kei: 3470 } },
  { id: "tokyo-sendai", name: "東京〜仙台", from: "浦和IC", to: "仙台宮城IC", via: "東北道", sourceKm: 327.6, toll: { standard: 7440, kei: 5990 } },
  { id: "tokyo-morioka", name: "東京〜盛岡", from: "浦和IC", to: "盛岡IC", via: "東北道", sourceKm: 507.3, toll: { standard: 10800, kei: 8710 }, retrieved: RETRIEVED_20261108 },
  { id: "tokyo-niigata", name: "東京〜新潟", from: "練馬IC", to: "新潟中央IC", via: "関越道・北陸道", sourceKm: 301.9, toll: { standard: 7000, kei: 5640 } },
  { id: "tokyo-kanazawa", name: "東京〜金沢", from: "練馬IC", to: "金沢東IC", via: "関越道・上信越道・北陸道", sourceKm: 454.5, toll: { standard: 9890, kei: 7940 } },
  { id: "tokyo-hakone", name: "東京〜箱根", from: "東京IC", to: "箱根口IC", via: "東名・小田原厚木道路", sourceKm: 67.4, toll: { standard: 2040, kei: 1710 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-numazu", name: "東京〜沼津", from: "東京IC", to: "沼津IC", via: "東名", sourceKm: 103.3, toll: { standard: 3130, kei: 2530 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-kawaguchiko", name: "東京〜河口湖", from: "調布IC", to: "河口湖IC", via: "中央道", sourceKm: 86.2, toll: { standard: 2600, kei: 2110 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-kiyosato", name: "東京〜清里", from: "調布IC", to: "長坂IC", via: "中央道", sourceKm: 132.4, toll: { standard: 3620, kei: 2930 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-matsumoto", name: "東京〜松本", from: "調布IC", to: "松本IC", via: "中央道・長野道", sourceKm: 200.2, toll: { standard: 4990, kei: 4020 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-ikaho", name: "東京〜伊香保温泉", from: "練馬IC", to: "渋川伊香保IC", via: "関越道", sourceKm: 103.4, toll: { standard: 3150, kei: 2550 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-karuizawa", name: "東京〜軽井沢", from: "練馬IC", to: "碓氷軽井沢IC", via: "関越道・上信越道", sourceKm: 131.1, toll: { standard: 3700, kei: 3000 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-nagano", name: "東京〜長野", from: "練馬IC", to: "長野IC", via: "関越道・上信越道", sourceKm: 203.5, toll: { standard: 5150, kei: 4160 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-nikko", name: "東京〜日光", from: "浦和IC", to: "日光IC", via: "東北道・日光宇都宮道路", sourceKm: 122.9, toll: { standard: 3530, kei: 2960 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-nasu", name: "東京〜那須", from: "浦和IC", to: "那須IC", via: "東北道", sourceKm: 147.7, toll: { standard: 3980, kei: 3220 }, retrieved: RETRIEVED_20261109 },
  { id: "tokyo-mito", name: "東京〜水戸", from: "三郷IC", to: "水戸IC", via: "常磐道", sourceKm: 82, toll: { standard: 2550, kei: 2070 }, retrieved: RETRIEVED_20261109 },
  { id: "nagoya-kanazawa", name: "名古屋〜金沢", from: "名古屋IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 259.8, toll: { standard: 5990, kei: 4830 } },
  { id: "nagoya-kyoto", name: "名古屋〜京都", from: "名古屋IC", to: "京都東IC", via: "東名・名神", sourceKm: 152.1, toll: { standard: 4210, kei: 3400 }, retrieved: RETRIEVED_20261108 },
  { id: "nagoya-fukuoka", name: "名古屋〜福岡", from: "名古屋IC", to: "福岡IC", via: "名神・新名神・山陽道・中国道・九州道", sourceKm: 783.5, toll: { standard: 16470, kei: 13270 }, retrieved: RETRIEVED_20261108 },
  { id: "nagoya-takayama", name: "名古屋〜高山", from: "名古屋IC", to: "高山IC", via: "東名・名神・東海北陸道・中部縦貫道", sourceKm: 166.6, toll: { standard: 4240, kei: 3420 }, retrieved: RETRIEVED_20261109 },
  { id: "nagoya-shirakawago", name: "名古屋〜白川郷", from: "名古屋IC", to: "白川郷IC", via: "東名・名神・東海北陸道", sourceKm: 176.3, toll: { standard: 4730, kei: 3820 }, retrieved: RETRIEVED_20261109 },
  { id: "nagoya-ise", name: "名古屋〜伊勢", from: "名古屋IC", to: "伊勢IC", via: "東名・伊勢湾岸道・東名阪道・伊勢道", sourceKm: 172.9, toll: { standard: 5030, kei: 4100 }, retrieved: RETRIEVED_20261109 },
  { id: "osaka-kanazawa", name: "大阪〜金沢", from: "吹田IC", to: "金沢東IC", via: "名神・北陸道", sourceKm: 289.7, toll: { standard: 6780, kei: 5460 } },
  { id: "osaka-okayama", name: "大阪〜岡山", from: "吹田IC", to: "岡山IC", via: "新名神・山陽道", sourceKm: 190.8, toll: { standard: 4400, kei: 3560 }, retrieved: RETRIEVED_20261108 },
  { id: "osaka-hiroshima", name: "大阪〜広島", from: "吹田IC", to: "広島IC", via: "新名神・山陽道", sourceKm: 339.5, toll: { standard: 7250, kei: 5830 } },
  { id: "osaka-fukuoka", name: "大阪〜福岡", from: "吹田IC", to: "福岡IC", via: "新名神・山陽道・中国道・九州道", sourceKm: 616.2, toll: { standard: 12570, kei: 10180 } },
  { id: "osaka-kagoshima", name: "大阪〜鹿児島", from: "吹田IC", to: "鹿児島IC", via: "新名神・山陽道・中国道・九州道", sourceKm: 894, toll: { standard: 17770, kei: 14270 }, retrieved: RETRIEVED_20261108 },
  { id: "osaka-takamatsu", name: "大阪〜高松", from: "吹田IC", to: "高松中央IC", via: "新名神・山陽道・神戸淡路鳴門道・高松道", sourceKm: 224.3, toll: { standard: 6880, kei: 5580 }, retrieved: RETRIEVED_20261108 },
  { id: "osaka-naruto", name: "大阪〜鳴門", from: "吹田IC", to: "鳴門IC", via: "新名神・山陽道・神戸淡路鳴門道", sourceKm: 168, toll: { standard: 5200, kei: 4230 }, retrieved: RETRIEVED_20261109 },
  { id: "osaka-shirahama", name: "大阪〜白浜", from: "吹田IC", to: "南紀白浜IC", via: "近畿道・阪和道・湯浅御坊道路・紀勢道", sourceKm: 171.2, toll: { standard: 4220, kei: 3410 }, retrieved: RETRIEVED_20261109 },
  { id: "osaka-kinosaki", name: "大阪〜城崎温泉", from: "吹田IC", to: "日高神鍋高原IC", via: "新名神・中国道・舞鶴若狭道・北近畿豊岡道", sourceKm: 159.1, toll: { standard: 2710, kei: 2160 }, retrieved: RETRIEVED_20261109 },
  { id: "osaka-amanohashidate", name: "大阪〜天橋立", from: "吹田IC", to: "与謝天橋立IC", via: "名神・京都縦貫道", sourceKm: 118.6, toll: { standard: 3940, kei: 3240 }, retrieved: RETRIEVED_20261109 },
  { id: "osaka-nagahama", name: "大阪〜長浜", from: "吹田IC", to: "長浜IC", via: "名神・京滋バイパス・北陸道", sourceKm: 119, toll: { standard: 3470, kei: 2810 }, retrieved: RETRIEVED_20261109 },
  { id: "fukuoka-kagoshima", name: "福岡〜鹿児島", from: "福岡IC", to: "鹿児島IC", via: "九州道", sourceKm: 277.8, toll: { standard: 6330, kei: 5100 } },
  { id: "fukuoka-kumamoto", name: "福岡〜熊本", from: "福岡IC", to: "熊本IC", via: "九州道", sourceKm: 102.9, toll: { standard: 2930, kei: 2380 }, retrieved: RETRIEVED_20261109 },
  { id: "fukuoka-nagasaki", name: "福岡〜長崎", from: "福岡IC", to: "長崎IC", via: "九州道・長崎道", sourceKm: 147.9, toll: { standard: 3840, kei: 3110 }, retrieved: RETRIEVED_20261109 },
  { id: "fukuoka-yufuin", name: "福岡〜湯布院", from: "福岡IC", to: "湯布院IC", via: "九州道・大分道", sourceKm: 115.7, toll: { standard: 3190, kei: 2580 }, retrieved: RETRIEVED_20261109 },
  { id: "fukuoka-beppu", name: "福岡〜別府", from: "福岡IC", to: "別府IC", via: "九州道・大分道・東九州道", sourceKm: 139.6, toll: { standard: 3670, kei: 2970 }, retrieved: RETRIEVED_20261109 },
];

/**
 * タイトル・説明文に名前を出す代表の区間（ROUTES の id）。検索語が「名古屋から大阪 車 ガソリン代」のような区間名なので、
 * 検索の多い区間を「AからB」の形で並べる
 */
export const ROUTE_SNIPPET_IDS = ["tokyo-osaka", "nagoya-osaka", "osaka-fukuoka"] as const;

/** ROUTE_SNIPPET_IDS の区間（/gas-cost からのリンクにも使う） */
export function snippetRoutes(): RouteEntry[] {
  return ROUTE_SNIPPET_IDS.map((id) => ROUTES.find((r) => r.id === id)!);
}

/** 表に出す距離（km）。出典の値を 5 km 単位に丸めた「約○km」。ガソリン代もこの距離で計算する */
export function displayKm(sourceKm: number): number {
  return Math.round(sourceKm / 5) * 5;
}

/** 区間名を逆向きにした表記（東京〜大阪 → 大阪→東京） */
export function reverseRouteName(route: Pick<RouteEntry, "name">): string {
  const [a, b] = route.name.split("〜");
  return `${b}→${a}`;
}

/** 金額（円、整数）の 3 桁区切り。lib/format.ts の formatInt（ページと app/route-gas-cost で呼び出しが多いので別名で出す） */
export const yen = formatInt;

/** ガソリン代（円、整数）。exampleCostYen（= computeGasCost）で求めるので丸めは計算機と同じ。出せなければ 0 */
export function gasCostYen(km: number, efficiency: number, roundTrip: boolean, price: number = ROUTE_PRICE): number {
  return exampleCostYen(km, efficiency, roundTrip, price) ?? 0;
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

/** 説明文・タイトル用の概数（100 円単位で四捨五入、3 桁区切り） */
export function yenRough(value: number): string {
  return (Math.round(value / 100) * 100).toLocaleString("ja-JP");
}

/**
 * 一覧ページのタイトル。モバイルの検索結果で切れない長さ（` | FuelLens` を除いて 32 字以内）にするため、区間名は代表の 1 つだけ
 */
export const ROUTE_GAS_COST_PAGE_TITLE = `車のガソリン代と高速代｜${snippetRoutes()[0].name}など主要${ROUTES.length}区間の片道・往復 | FuelLens`;

/** 一覧ページの説明文。モバイルで切れる前（先頭 70 字以内）に代表の区間の金額を出す */
export const ROUTE_GAS_COST_DESCRIPTION = (() => {
  const [first, ...rest] = snippetRoutes();
  const t = standardTotal(first);
  const fromTo = (r: RouteEntry) => r.name.replace("〜", "から");
  return (
    `${fromTo(first)}は普通車でガソリン代と高速代の合計が片道約${yenRough(t.totalOneWay ?? t.gasOneWay)}円。` +
    `${rest.map(fromTo).join("・")}など主要${ROUTES.length}区間の合計を片道・往復でまとめました（逆方向も同じ金額）。` +
    "軽自動車・ハイブリッド車・ミニバン別のガソリン代も。"
  );
})();

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
    a: `ガソリン代は全国平均のレギュラー ${formatPrice(NATIONAL_GAS_PRICE.regular)} 円/L で計算しています。ハイオクの全国平均 ${formatPrice(NATIONAL_GAS_PRICE.highOctane)} 円/L で走ると、ガソリン代は約 ${HIGH_OCTANE_RATIO_PERCENT}% 増しが目安です。`,
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
  return jsonLdString(data);
}
