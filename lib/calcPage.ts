/**
 * 燃費計算ページ（/calc）の純粋なロジック: 入力の検証と計算結果、FAQ、構造化データ（JSON-LD）。
 * 燃費と単価の計算・丸めは lib/calculations.ts の calculateFuelMetrics に任せる（ここで複製しない）。
 */

import { calculateFuelMetrics, formatPricePerUnit } from "./calculations";
import { parseDraftNumber } from "./recordDraft";
import { PLAUSIBILITY_LIMITS } from "./analyze";
import { buildManualPrefillHref } from "./manualPrefill";
import { CAR_TYPE_EFFICIENCIES } from "./gasCostPage";
import type { OgFormulaPart } from "./og/renderToolOgImage";

export const CALC_PATH = "/calc";
/**
 * 検索結果のタイトル（ルートレイアウトの `%s | FuelLens` を使わず absolute で指定する）。
 * 検索語「燃費計算」「満タン法 計算」を先頭に置き、` | FuelLens` を除いて 32 字以内（tests/serpSnippet.test.ts）
 */
export const CALC_PAGE_TITLE = "燃費計算ツール｜満タン法で走行距離と給油量から燃費を計算 | FuelLens";
/** ページの見出し（h1） */
export const CALC_H1 = "燃費計算ツール（満タン法）";
/** meta description。答え（何が出るか・入力は 2 つ）→ 登録不要・無料 → アプリでの記録の順 */
export const CALC_DESCRIPTION =
  "走行距離と給油量の2つを入れるだけで、満タン法の燃費（km/L）を計算。支払総額を足せば1kmあたりのガソリン代も出ます。登録不要・無料。結果はそのまま記録でき、次回からは写真1枚で自動記録。";

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

/**
 * 入力の上限（実在の車より十分大きく、∞ や 1e+300 のような表示にならない範囲）。
 * 走行距離 km・給油量 L・支払総額 円。燃費 km/L・単価 円/L は計算結果の上限（超えたら結果を出さずにエラーにする）
 */
export const CALC_LIMITS = {
  distance: 100_000,
  amount: 1_000,
  cost: 10_000_000,
  efficiency: 1_000,
  pricePerUnit: 10_000,
} as const;

/** 必須の欄（走行距離・給油量）は 0 より大きいこと。支払総額は任意で 0 以上。どれも CALC_LIMITS 以下 */
function parseField(field: CalcField, raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${LABELS[field]}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (field !== "cost" && parsed.value <= 0) {
    return { value: null, error: `${LABELS[field]}は 0 より大きい数値で入力してください` };
  }
  if (parsed.value > CALC_LIMITS[field]) {
    return { value: null, error: `${LABELS[field]}は ${CALC_LIMITS[field].toLocaleString("ja-JP")} 以下で入力してください` };
  }
  return { value: parsed.value };
}

/** 3 つの欄をまとめて読む（computeCalc と calcRecordHref で共有） */
function parseCalcInput(input: CalcInput): { values: Record<CalcField, number | null>; errors: CalcResult["errors"] } {
  const errors: CalcResult["errors"] = {};
  const values = {} as Record<CalcField, number | null>;
  for (const field of ["distance", "amount", "cost"] as const) {
    const { value, error } = parseField(field, input[field]);
    values[field] = value;
    if (error) errors[field] = error;
  }
  return { values, errors };
}

/** 入力中の文字列から計算結果を作る。未入力の欄はエラーにしない（結果が出ないだけ） */
export function computeCalc(input: CalcInput): CalcResult {
  const { values, errors } = parseCalcInput(input);
  const { distance, amount, cost } = values;
  const metrics = calculateFuelMetrics(distance, amount, cost);
  let { fuel_efficiency, price_per_unit } = metrics;
  // 給油量が極端に少ないと燃費・単価が桁外れ（∞ を含む）になる。結果は出さずに給油量のエラーにする
  if (fuel_efficiency != null && !(Number.isFinite(fuel_efficiency) && fuel_efficiency <= CALC_LIMITS.efficiency)) {
    fuel_efficiency = null;
    errors.amount ??= `燃費が ${CALC_LIMITS.efficiency.toLocaleString("ja-JP")} km/L を超えます。給油量を確認してください`;
  }
  if (price_per_unit != null && !(Number.isFinite(price_per_unit) && price_per_unit <= CALC_LIMITS.pricePerUnit)) {
    price_per_unit = null;
    errors.cost ??= `単価が ${CALC_LIMITS.pricePerUnit.toLocaleString("ja-JP")} 円/L を超えます。支払総額と給油量を確認してください`;
  }

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

/**
 * 「この内容で FuelLens に記録する」のリンク先（アプリの手動入力を事前入力つきで開く。lib/manualPrefill.ts）。
 * 走行距離と給油量が正しく入っていて、どの欄にもエラーが無いときだけ作る（支払総額は任意）。それ以外は null（ボタンを出さない）。
 * 走行距離は区間距離（トリップメーター）で、記録の total_distance（区間距離）に入る。URL には読み取り済みの数値だけを載せる
 * （全角数字・桁区切りの入力も正規化される）。何も保存しない。保存は利用者がアプリのフォームで日付・車両を確認してから
 */
export function calcRecordHref(input: CalcInput): string | null {
  const { values } = parseCalcInput(input);
  // 計算結果のエラー（燃費が桁外れ）も含めて、computeCalc がエラーを出す入力ではボタンを出さない
  if (Object.keys(computeCalc(input).errors).length > 0) return null;
  const { distance, amount, cost } = values;
  if (distance == null || amount == null) return null;
  return buildManualPrefillHref({
    total_distance: distance,
    fuel_amount: amount,
    ...(cost != null && cost > 0 ? { total_cost: cost } : {}),
  });
}

/** ページ冒頭の一行回答と FAQ の計算例に使う値（区間距離 km・給油量 L・支払総額 円） */
export const CALC_EXAMPLE = { distance: 400, amount: 30, cost: 4800 } as const;

/** 計算例の結果。計算機と同じ computeCalc（= calculateFuelMetrics）で求める（結果の数字を手で書かない） */
export function calcExample(): { efficiency: string; pricePerUnit: string; costPerKm: string } {
  const r = computeCalc({
    distance: String(CALC_EXAMPLE.distance),
    amount: String(CALC_EXAMPLE.amount),
    cost: String(CALC_EXAMPLE.cost),
  });
  return { efficiency: r.efficiency!, pricePerUnit: r.pricePerUnit!, costPerKm: r.costPerKm! };
}

/** ページ冒頭の一行回答（計算式と計算例） */
export function calcQuickAnswerText(): string {
  const { efficiency } = calcExample();
  return `燃費（km/L）は「走行距離 ÷ 給油量」で求めます。満タン給油から${CALC_EXAMPLE.distance}km走って、次の満タンで${CALC_EXAMPLE.amount}L入ったら、燃費は${efficiency}km/Lです。`;
}

/** OG / Twitter 画像の式（一行回答と同じ CALC_EXAMPLE・calcExample() から作り、ページの数字とずれないようにする） */
export function calcOgFormula(): OgFormulaPart[] {
  return [
    { text: String(CALC_EXAMPLE.distance), kind: "num" },
    { text: "km", kind: "unit" },
    { text: "÷", kind: "unit" },
    { text: String(CALC_EXAMPLE.amount), kind: "num" },
    { text: "L", kind: "unit" },
    { text: "=", kind: "unit" },
    { text: calcExample().efficiency, kind: "result" },
    { text: "km/L", kind: "unit" },
  ];
}

export type FaqEntry = { q: string; a: string };

/**
 * ページの FAQ と JSON-LD の FAQPage で共有する。
 * 本文（満タン法とは・正しく測るコツ）で答えていること（オドメーターではなく区間距離を使う など）は載せない
 */
export const CALC_FAQS: FaqEntry[] = (() => {
  const { pricePerUnit, costPerKm } = calcExample();
  const typical = CAR_TYPE_EFFICIENCIES.map((c) => `${c.label}で約${c.efficiency}km/L`).join("、");
  return [
    {
      q: "燃費計算の式は？",
      a: `燃費（km/L）= 区間距離（km）÷ 給油量（L）です。単価（円/L）は支払総額 ÷ 給油量、1kmあたりのガソリン代（円/km）は支払総額 ÷ 区間距離で求めます。${CALC_EXAMPLE.distance}km・${CALC_EXAMPLE.amount}Lで支払総額が${CALC_EXAMPLE.cost.toLocaleString("ja-JP")}円なら、単価は${pricePerUnit}円/L、1kmあたり${costPerKm}円です。`,
    },
    {
      q: "満タンにしなかった（部分給油の）ときはどうしますか？",
      a: "部分給油の量だけで割ると燃費が実際より高く出ます。次に満タンにするまで走行距離と給油量をそれぞれ合算し、満タンにした時点でまとめて割ってください。",
    },
    {
      q: "軽自動車・ハイブリッド車の燃費の目安は？",
      a: `実燃費の一般的な目安は、${typical}です（カタログの WLTC モード燃費より低めの値）。車種や乗り方で変わるので、自分の車の燃費は上の計算機で測ってください。`,
    },
  ];
})();

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
        name: "燃費計算ツール（満タン法）",
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
