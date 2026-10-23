/**
 * 年間・月間のガソリン代シミュレーター（/annual-gas-cost）の純粋なロジック: 入力の検証と計算結果、早見表、FAQ、構造化データ（JSON-LD）。
 * 計算は丸める前の値で行い、丸めるのは表示用の文字列にするときだけ。
 * 単価・燃費の検証と注意は /gas-cost の computeGasCost に任せ、式を複製しない。
 */

import { parseDraftNumber } from "./recordDraft";
import type { FaqEntry } from "./calcPage";
import { EXAMPLE_PRICE, computeGasCost } from "./gasCostPage";

export const ANNUAL_GAS_COST_PATH = "/annual-gas-cost";
/** 構造化データの url に使う本番の絶対 URL（canonical は metadataBase からの相対） */
export const ANNUAL_GAS_COST_CANONICAL_URL = "https://fuel-lens.gadelog.com/annual-gas-cost";
/** ナビなどに出す短い名前 */
export const ANNUAL_GAS_COST_TITLE = "年間ガソリン代";

/** 出勤日数の上限（1 か月の日数） */
export const MAX_COMMUTE_DAYS = 31;
export const DEFAULT_COMMUTE_DAYS = "20";

export type AnnualMode = "distance" | "commute";
export type DistancePeriod = "month" | "year";

export type AnnualGasCostInput = {
  mode: AnnualMode;
  /** 「距離から」: 走行距離（期間は period） */
  distance: string;
  period: DistancePeriod;
  /** 「通勤から」: 片道の距離 (km) と月の出勤日数 */
  oneWay: string;
  days: string;
  efficiency: string;
  price: string;
};

export type AnnualGasCostField = "distance" | "oneWay" | "days" | "efficiency" | "price";

export type AnnualGasCostResult = {
  errors: Partial<Record<AnnualGasCostField, string>>;
  warnings: string[];
  /** 1 か月のガソリン代 (円) */
  monthlyCost: string | null;
  /** 1 年のガソリン代 (円)。月額 × 12 を丸める前の値で求める */
  yearlyCost: string | null;
  /** 月間走行距離 (km) */
  monthlyDistance: string | null;
  /** 年間走行距離 (km) */
  yearlyDistance: string | null;
  /** 月間の給油量 (L)（小数第 2 位） */
  monthlyFuel: string | null;
  /** 1km あたりのガソリン代 (円/km)（小数第 1 位） */
  costPerKm: string | null;
};

const LABELS = { distance: "走行距離", oneWay: "片道の距離", days: "出勤日数" } as const;

function parsePositive(field: "distance" | "oneWay", raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${LABELS[field]}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (parsed.value <= 0) return { value: null, error: `${LABELS[field]}は 0 より大きい数値で入力してください` };
  return { value: parsed.value };
}

/** 出勤日数は 1〜31 の整数。空なら未入力（結果が出ないだけ） */
function parseDays(raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (!parsed.error && parsed.value === null) return { value: null };
  const n = parsed.value;
  if (parsed.error || n === null || !Number.isInteger(n) || n < 1 || n > MAX_COMMUTE_DAYS) {
    return { value: null, error: `${LABELS.days}は 1〜${MAX_COMMUTE_DAYS} の整数で入力してください` };
  }
  return { value: n };
}

const formatInt = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });
const formatKm = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });

/** 入力中の文字列から計算結果を作る。未入力の欄はエラーにしない（結果が出ないだけ） */
export function computeAnnualGasCost(input: AnnualGasCostInput): AnnualGasCostResult {
  const errors: AnnualGasCostResult["errors"] = {};

  // 燃費・単価の検証、注意、1km あたりは /gas-cost の計算に任せる（距離は仮の 1 km）
  const base = computeGasCost({ distance: "1", efficiency: input.efficiency, price: input.price, people: "", roundTrip: false });
  if (base.errors.efficiency) errors.efficiency = base.errors.efficiency;
  if (base.errors.price) errors.price = base.errors.price;

  let monthlyKm: number | null = null;
  if (input.mode === "distance") {
    const { value, error } = parsePositive("distance", input.distance);
    if (error) errors.distance = error;
    if (value != null) monthlyKm = input.period === "year" ? value / 12 : value;
  } else {
    const oneWay = parsePositive("oneWay", input.oneWay);
    const days = parseDays(input.days);
    if (oneWay.error) errors.oneWay = oneWay.error;
    if (days.error) errors.days = days.error;
    if (oneWay.value != null && days.value != null) monthlyKm = oneWay.value * 2 * days.value;
  }

  const eff = errors.efficiency ? null : parseDraftNumber(input.efficiency).value;
  const price = errors.price ? null : parseDraftNumber(input.price).value;
  const monthlyL = monthlyKm != null && eff != null ? monthlyKm / eff : null;
  const monthlyYen = monthlyL != null && price != null ? monthlyL * price : null;

  return {
    errors,
    warnings: base.warnings,
    monthlyCost: monthlyYen != null ? formatInt(Math.round(monthlyYen)) : null,
    yearlyCost: monthlyYen != null ? formatInt(Math.round(monthlyYen * 12)) : null,
    monthlyDistance: monthlyKm != null ? formatKm(monthlyKm) : null,
    yearlyDistance: monthlyKm != null ? formatKm(monthlyKm * 12) : null,
    monthlyFuel:
      monthlyL != null ? monthlyL.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null,
    costPerKm: base.costPerKm,
  };
}

/** 早見表: 行は月間走行距離 (km/月)、列は燃費 (km/L)。単価は /gas-cost と同じ例の値 */
export { EXAMPLE_PRICE };
export const MONTHLY_TABLE_DISTANCES = [300, 500, 800, 1000, 1500, 2000] as const;
export const MONTHLY_TABLE_EFFICIENCIES = [10, 15, 20, 25] as const;

/** 例の単価での月額・年額（表示用の文字列）。電卓と同じ computeAnnualGasCost で求めるので丸めも一致する */
export function exampleMonthlyAndYearly(monthlyKm: number, efficiency: number): { monthly: string; yearly: string } {
  const r = computeAnnualGasCost({
    mode: "distance",
    distance: String(monthlyKm),
    period: "month",
    oneWay: "",
    days: "",
    efficiency: String(efficiency),
    price: String(EXAMPLE_PRICE),
  });
  return { monthly: r.monthlyCost ?? "", yearly: r.yearlyCost ?? "" };
}

/** 早見表の 1 行: 月間走行距離と、燃費ごとの月額・年額 */
export function buildMonthlyTable(): { distance: number; cells: { monthly: string; yearly: string }[] }[] {
  return MONTHLY_TABLE_DISTANCES.map((distance) => ({
    distance,
    cells: MONTHLY_TABLE_EFFICIENCIES.map((eff) => exampleMonthlyAndYearly(distance, eff)),
  }));
}

/** 通勤の例: 片道 15 km・月 20 日出勤・燃費 15 km/L */
export const COMMUTE_EXAMPLE = { oneWayKm: 15, days: 20, efficiency: 15 } as const;
export function commuteExample(): { monthlyKm: string; monthly: string; yearly: string } {
  const { oneWayKm, days, efficiency } = COMMUTE_EXAMPLE;
  const r = computeAnnualGasCost({
    mode: "commute",
    distance: "",
    period: "month",
    oneWay: String(oneWayKm),
    days: String(days),
    efficiency: String(efficiency),
    price: String(EXAMPLE_PRICE),
  });
  return { monthlyKm: r.monthlyDistance ?? "", monthly: r.monthlyCost ?? "", yearly: r.yearlyCost ?? "" };
}

/** ページの FAQ と JSON-LD の FAQPage で共有する。本文（計算式・早見表・通勤の例）で答えていることは載せない */
export const ANNUAL_GAS_COST_FAQS: FaqEntry[] = [
  {
    q: "年間の金額は今後も同じになりますか？",
    a: "ガソリン単価は時期によって変わるため、年額は「今の単価が続いた場合」の目安です。走行距離や燃費が変わっても金額は変わります。実際の燃費は FuelLens などで記録して確かめると、見積もりが正確になります。",
  },
];

/**
 * /annual-gas-cost の構造化データ（WebApplication + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildAnnualGasCostJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "年間・月間のガソリン代シミュレーター",
        url: ANNUAL_GAS_COST_CANONICAL_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description:
          "走行距離または通勤の片道距離と出勤日数、燃費、ガソリン単価から、1 か月と 1 年のガソリン代を計算します。月間・年間の走行距離や給油量、1km あたりのガソリン代も出せます。",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: ANNUAL_GAS_COST_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
