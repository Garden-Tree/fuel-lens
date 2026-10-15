/**
 * ガソリン代計算ページ（/gas-cost）の純粋なロジック: 入力の検証と計算結果、FAQ、構造化データ（JSON-LD）。
 * 計算は丸める前の値で行い、丸めるのは表示用の文字列にするときだけ。
 */

import { parseDraftNumber } from "./recordDraft";
import type { FaqEntry } from "./calcPage";

export const GAS_COST_PATH = "/gas-cost";
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

/** ページの FAQ と JSON-LD の FAQPage で共有する */
export const GAS_COST_FAQS: FaqEntry[] = [
  {
    q: "ガソリン代はどうやって計算しますか？",
    a: "必要なガソリン量（L）= 走行距離（km）÷ 燃費（km/L）、ガソリン代（円）= ガソリン量（L）× ガソリン単価（円/L）で求めます。たとえば 300 km を燃費 15 km/L の車で走ると 20 L で、単価が 170 円/L（例）なら 3,400 円です。",
  },
  {
    q: "往復の場合はどう計算しますか？",
    a: "片道の距離を 2 倍にしてから計算します。このツールでは「往復」を選ぶと、入力した片道の距離を 2 倍にして計算します。高速料金や駐車場代は含みません。",
  },
  {
    q: "車の燃費がわからないときはどうすればいいですか？",
    a: "実際の走り方での燃費（実燃費）は、カタログ燃費と異なることが多いです。満タン給油から次の満タン給油までに走った距離を給油量で割る満タン法で自分の車の実燃費を測ると、より正確に見積もれます。",
  },
  {
    q: "1km あたりのガソリン代はいくらですか？",
    a: "ガソリン単価（円/L）÷ 燃費（km/L）で求めます。たとえば単価 170 円/L（例）、燃費 15 km/L なら、1km あたり約 11.3 円です。",
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
  return JSON.stringify(data).replace(/</g, "\u003c");
}
