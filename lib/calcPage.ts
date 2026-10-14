/**
 * 燃費計算ページ（/calc）の純粋なロジック: 入力の検証と計算結果、FAQ、構造化データ（JSON-LD）。
 * 燃費と単価の計算・丸めは lib/calculations.ts の calculateFuelMetrics に任せる（ここで複製しない）。
 */

import { calculateFuelMetrics, formatPricePerUnit } from "./calculations";
import { parseDraftNumber } from "./recordDraft";
import { PLAUSIBILITY_LIMITS } from "./analyze";

export const CALC_PATH = "/calc";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対 `/calc`） */
export const CALC_CANONICAL_URL = "https://fuel-lens.gadelog.com/calc";

export type CalcInput = { distance: string; amount: string; cost: string };

export type CalcField = keyof CalcInput;

export type CalcResult = {
  /** 欄ごとの検証エラー（日本語） */
  errors: Partial<Record<CalcField, string>>;
  /** 注意（計算はする）。オドメーターを入れていそうなとき */
  warning: string | null;
  /** 燃費 (km/L) の表示文字列（小数第 2 位）。出せなければ null */
  efficiency: string | null;
  /** 単価 (円/L) の表示文字列（小数第 1 位）。支払総額が無ければ null */
  pricePerUnit: string | null;
  /** 1km あたりの燃料費 (円/km) の表示文字列（小数第 1 位）。支払総額が無ければ null */
  costPerKm: string | null;
};

const LABELS: Record<CalcField, string> = { distance: "走行距離", amount: "給油量", cost: "支払総額" };

/** 必須の欄（走行距離・給油量）は 0 より大きいこと。支払総額は任意で 0 以上 */
function parseField(field: CalcField, raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${LABELS[field]}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (field !== "cost" && parsed.value <= 0) {
    return { value: null, error: `${LABELS[field]}は 0 より大きい数値で入力してください` };
  }
  return { value: parsed.value };
}

/** 入力中の文字列から計算結果を作る。未入力の欄はエラーにしない（結果が出ないだけ） */
export function computeCalc(input: CalcInput): CalcResult {
  const errors: CalcResult["errors"] = {};
  const values = {} as Record<CalcField, number | null>;
  for (const field of ["distance", "amount", "cost"] as const) {
    const { value, error } = parseField(field, input[field]);
    values[field] = value;
    if (error) errors[field] = error;
  }

  const { distance, amount, cost } = values;
  const { fuel_efficiency, price_per_unit } = calculateFuelMetrics(distance, amount, cost);

  const efficiency = fuel_efficiency != null ? fuel_efficiency.toFixed(2) : null;
  const pricePerUnit = price_per_unit != null ? formatPricePerUnit(price_per_unit) : null;
  const costPerKm = cost != null && distance != null && distance > 0 ? (cost / distance).toFixed(1) : null;

  let warning: string | null = null;
  if (distance != null && distance > PLAUSIBILITY_LIMITS.maxTripDistance) {
    warning = `走行距離が ${PLAUSIBILITY_LIMITS.maxTripDistance} km を超えています。オドメーター（積算距離）ではなく、前回の満タン給油からの区間距離（トリップメーター）を入力してください。`;
  } else if (fuel_efficiency != null && fuel_efficiency > PLAUSIBILITY_LIMITS.maxFuelEfficiency) {
    warning = `燃費が ${PLAUSIBILITY_LIMITS.maxFuelEfficiency} km/L を超えています。走行距離と給油量を確認してください（部分給油の量だけで割っていませんか？）。`;
  }

  return { errors, warning, efficiency, pricePerUnit, costPerKm };
}

export type FaqEntry = { q: string; a: string };

/** ページの FAQ と JSON-LD の FAQPage で共有する */
export const CALC_FAQS: FaqEntry[] = [
  {
    q: "満タン法の燃費はどうやって計算しますか？",
    a: "満タンまで給油したときにトリップメーターを 0 にし、次に満タンまで給油したときの走行距離を、そのときの給油量で割ります。燃費（km/L）= 区間距離（km）÷ 給油量（L）です。",
  },
  {
    q: "走行距離にはオドメーターの数字を入れてもいいですか？",
    a: "いいえ。オドメーターは新車からの積算距離です。使うのは前回の満タン給油からの区間距離で、トリップメーターの値か、今回と前回のオドメーターの差を入力してください。",
  },
  {
    q: "満タンにしなかった（部分給油の）ときはどうしますか？",
    a: "部分給油の量だけで割ると燃費が実際より高く出ます。次に満タンにするまで走行距離と給油量をそれぞれ合算し、満タンにした時点でまとめて割ってください。",
  },
];

/**
 * /calc の構造化データ（WebApplication + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildCalcJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "満タン法 燃費計算ツール",
        url: CALC_CANONICAL_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description: "走行距離と給油量を入れるだけで、満タン法の燃費（km/L）・ガソリン単価（円/L）・1km あたりの燃料費を計算します。",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: CALC_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
