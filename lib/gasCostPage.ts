/**
 * ガソリン代計算ページ（/gas-cost）の純粋なロジック: 入力の検証と計算結果、FAQ、構造化データ（JSON-LD）。
 * 計算は丸める前の値で行い、丸めるのは表示用の文字列にするときだけ。
 */

import { parseDraftNumber } from "./recordDraft";
import type { FaqEntry } from "./calcPage";

export const GAS_COST_PATH = "/gas-cost";
/** ページ内の計算機への移動先（距離別の目安表の各行からリンクする） */
export const GAS_COST_CALCULATOR_ID = "gas-cost-calculator";
export const GAS_COST_PAGE_TITLE = "ガソリン代計算ツール｜300km走るといくら？距離・燃費・単価から計算 | FuelLens";
export const GAS_COST_DESCRIPTION =
  "距離・燃費・ガソリン単価を入れるだけでガソリン代を計算。300キロ・500キロなど距離別の目安表（軽自動車・普通車・ハイブリッド、ハイオクも）で「〇〇キロ走るといくら？」がすぐわかります。往復・割り勘にも対応。登録不要・無料。";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/gas-cost`） */
export const GAS_COST_CANONICAL_URL = "https://fuel-lens.gadelog.com/gas-cost";

/** 単価の注意を出す範囲（円/L）。範囲外でも計算はする */
export const PRICE_CHECK_RANGE = { min: 50, max: 400 } as const;
/** これを超える燃費（km/L）には注意を出す。50cc のスクーターは 60 km/L を超えることがあるので /calc の 60 より高くする */
export const EFFICIENCY_CHECK_MAX = 100;
/** 割り勘の人数の上限 */
export const MAX_PEOPLE = 99;

export type GasCostInput = {
  distance: string;
  efficiency: string;
  price: string;
  /** 割り勘の人数（任意。空なら 1 人） */
  people: string;
  /** true なら距離を 2 倍にする */
  roundTrip: boolean;
};

export type GasCostField = "distance" | "efficiency" | "price" | "people";

export type GasCostResult = {
  /** 欄ごとの検証エラー（日本語） */
  errors: Partial<Record<GasCostField, string>>;
  /** 注意（計算はする）。単価・燃費の桁違いが疑われるとき */
  warnings: string[];
  /** 計算に使った距離 (km)。往復なら 2 倍。出せなければ null */
  totalDistance: string | null;
  /** 必要なガソリン量 (L) の表示文字列（小数第 2 位） */
  fuel: string | null;
  /** ガソリン代 (円) の表示文字列（1 円未満を四捨五入、3 桁区切り） */
  cost: string | null;
  /** 割り勘の人数（2 人以上のときだけ。1 人なら null） */
  people: number | null;
  /** 1 人あたりのガソリン代 (円)。2 人以上のときだけ */
  perPerson: string | null;
  /** 1km あたりのガソリン代 (円/km) の表示文字列（小数第 1 位）。距離は不要 */
  costPerKm: string | null;
};

const LABELS: Record<GasCostField, string> = {
  distance: "走行距離",
  efficiency: "燃費",
  price: "ガソリン単価",
  people: "人数",
};

/** 必須の欄（距離・燃費・単価）は 0 より大きいこと */
function parsePositive(field: Exclude<GasCostField, "people">, raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${LABELS[field]}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (parsed.value <= 0) return { value: null, error: `${LABELS[field]}は 0 より大きい数値で入力してください` };
  return { value: parsed.value };
}

/** 人数は 1〜99 の整数。空なら 1 人 */
function parsePeople(raw: string): { value: number; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (!parsed.error && parsed.value === null) return { value: 1 };
  const n = parsed.value;
  if (parsed.error || n === null || !Number.isInteger(n) || n < 1 || n > MAX_PEOPLE) {
    return { value: 1, error: `${LABELS.people}は 1〜${MAX_PEOPLE} の整数で入力してください` };
  }
  return { value: n };
}

const formatInt = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

/** 入力中の文字列から計算結果を作る。未入力の欄はエラーにしない（結果が出ないだけ） */
export function computeGasCost(input: GasCostInput): GasCostResult {
  const errors: GasCostResult["errors"] = {};
  const read = (field: Exclude<GasCostField, "people">) => {
    const { value, error } = parsePositive(field, input[field]);
    if (error) errors[field] = error;
    return value;
  };
  const distance = read("distance");
  const efficiency = read("efficiency");
  const price = read("price");
  const peopleParsed = parsePeople(input.people);
  if (peopleParsed.error) errors.people = peopleParsed.error;

  const totalKm = distance != null ? (input.roundTrip ? distance * 2 : distance) : null;
  const fuelL = totalKm != null && efficiency != null ? totalKm / efficiency : null;
  const costYen = fuelL != null && price != null ? Math.round(fuelL * price) : null;
  const people = !peopleParsed.error && peopleParsed.value >= 2 ? peopleParsed.value : null;
  // 割り勘は表示したガソリン代（円）を人数で割り、1 円未満を切り上げる（集めた額が合計を下回らないように）
  const perPersonYen = costYen != null && people != null ? Math.ceil(costYen / people) : null;
  const costPerKm = price != null && efficiency != null ? price / efficiency : null;

  const warnings: string[] = [];
  if (price != null && (price < PRICE_CHECK_RANGE.min || price > PRICE_CHECK_RANGE.max)) {
    warnings.push(
      `ガソリン単価が ${PRICE_CHECK_RANGE.min}〜${PRICE_CHECK_RANGE.max} 円/L の範囲外です。1L あたりの価格（円/L）を入力しているか確認してください。`
    );
  }
  if (efficiency != null && efficiency > EFFICIENCY_CHECK_MAX) {
    warnings.push(`燃費が ${EFFICIENCY_CHECK_MAX} km/L を超えています。燃費（km/L）の値を確認してください。`);
  }

  return {
    errors,
    warnings,
    totalDistance: totalKm != null ? totalKm.toLocaleString("ja-JP", { maximumFractionDigits: 1 }) : null,
    fuel: fuelL != null ? fuelL.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null,
    cost: costYen != null ? formatInt(costYen) : null,
    people,
    perPerson: perPersonYen != null ? formatInt(perPersonYen) : null,
    costPerKm: costPerKm != null ? costPerKm.toFixed(1) : null,
  };
}

/** 距離別の目安表・FAQ の例に使う単価（円/L）。実際の単価ではなく計算の説明用 */
export const EXAMPLE_PRICE = 170;
/** ハイオクの例の単価がレギュラーより高い分（円/L）。価格は地域・時期で変わるので目安 */
export const HIGH_OCTANE_PREMIUM = 11;
/** ハイオクの例の単価（円/L） */
export const EXAMPLE_HIGH_OCTANE_PRICE = EXAMPLE_PRICE + HIGH_OCTANE_PREMIUM;

/** 目安表の燃料の種類（切り替えの選択肢） */
export const FUEL_GRADES = [
  { id: "regular", label: "レギュラー", price: EXAMPLE_PRICE },
  { id: "high-octane", label: "ハイオク", price: EXAMPLE_HIGH_OCTANE_PRICE },
] as const;
export type FuelGradeId = (typeof FUEL_GRADES)[number]["id"];

/**
 * 車種ごとの実燃費の目安（km/L）。カタログの WLTC モード燃費より実際に走ったときの燃費は低めになるので、それを見込んだ一般的な値。
 * /gas-cost の距離別の目安表と /route-gas-cost の区間別の表で共有する（ここ以外で定義しない）
 */
export const CAR_TYPE_EFFICIENCIES = [
  { id: "kei", label: "軽自動車", efficiency: 20 },
  { id: "standard", label: "普通車", efficiency: 13 },
  { id: "hybrid", label: "ハイブリッド車", efficiency: 25 },
  { id: "minivan", label: "ミニバン・ワンボックス", efficiency: 10 },
] as const;
/** 表の注記（燃費の目安の根拠）。/gas-cost と /route-gas-cost で同じ文を使う */
export const CAR_TYPE_EFFICIENCY_NOTE =
  "燃費は車種ごとの実燃費の一般的な目安で、カタログの WLTC モード燃費より低めにしています。";

/** 距離別の目安表の行（距離 km）。検索されやすい距離を並べる */
export const DISTANCE_TABLE_DISTANCES = [10, 14, 20, 30, 50, 100, 150, 180, 200, 300, 500, 1000] as const;

/** 例の単価でのガソリン代（表示用の文字列）。電卓と同じ computeGasCost で求めるので丸めも一致する */
export function exampleCost(distanceKm: number, efficiencyKmPerL: number, roundTrip = false, price: number = EXAMPLE_PRICE): string {
  return (
    computeGasCost({
      distance: String(distanceKm),
      efficiency: String(efficiencyKmPerL),
      price: String(price),
      people: "",
      roundTrip,
    }).cost ?? ""
  );
}

/** 距離別の目安表: 行ごとに距離と、車種ごと（CAR_TYPE_EFFICIENCIES の順）のガソリン代（円）の表示文字列 */
export function distanceCostTable(price: number = EXAMPLE_PRICE): { distance: number; costs: string[] }[] {
  return DISTANCE_TABLE_DISTANCES.map((distance) => ({
    distance,
    costs: CAR_TYPE_EFFICIENCIES.map(({ efficiency }) => exampleCost(distance, efficiency, false, price)),
  }));
}

/** 目安表の行から計算機へ飛ぶリンク（距離を `?km=` で渡す） */
export function distanceLink(distanceKm: number): string {
  return `${GAS_COST_PATH}?km=${distanceKm}#${GAS_COST_CALCULATOR_ID}`;
}

/**
 * 計算機の距離の初期値。`?km=` が目安表の距離のどれかと一致するときだけ受け取る（任意の文字列は入れない）。
 * 該当しなければ空文字。
 */
export function parseDistancePrefill(search: string): string {
  const km = new URLSearchParams(search).get("km");
  return km !== null && (DISTANCE_TABLE_DISTANCES as readonly number[]).some((d) => String(d) === km) ? km : "";
}

/** 通勤の月額の例: 片道 15 km・燃費 15 km/L・月 20 日出勤 */
export const COMMUTE_EXAMPLE = { oneWayKm: 15, efficiency: 15, days: 20 } as const;
export function commuteExample(): { perDay: string; perMonth: string } {
  const { oneWayKm, efficiency, days } = COMMUTE_EXAMPLE;
  return {
    perDay: exampleCost(oneWayKm, efficiency, true),
    perMonth: exampleCost(oneWayKm * 2 * days, efficiency),
  };
}

/**
 * ページの FAQ と JSON-LD の FAQPage で共有する。本文（計算式・手順・使い方・距離別の目安表）で答えていることは載せない。
 * 計算の対象は computeGasCost の範囲（ガソリン代だけ。高速料金・駐車場代は含まない。燃料の種類は問わず、燃費と単価を入れるだけ）。
 * ハイオクは目安表の切り替えで答えているので FAQ には載せない。
 */
export const GAS_COST_FAQS: FaqEntry[] = [
  {
    q: "高速道路の料金や駐車場代も含まれますか？",
    a: "いいえ、このツールで計算するのはガソリン代だけです。高速料金や駐車場代は含まれないので、必要なら別に足してください。",
  },
  {
    q: "軽油（ディーゼル車）でも計算できますか？",
    a: "はい。計算機は燃料の種類を問いません。燃費（km/L）と軽油の 1L あたりの単価（円/L）を入れれば計算できます。",
  },
];

/**
 * /gas-cost の構造化データ（WebApplication + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildGasCostJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "ガソリン代計算ツール",
        url: GAS_COST_CANONICAL_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description:
          "走行距離・燃費・ガソリン単価から、必要なガソリン量とガソリン代を計算します。往復の距離や割り勘の 1 人あたりの金額、1km あたりのガソリン代も出せます。",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: GAS_COST_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
