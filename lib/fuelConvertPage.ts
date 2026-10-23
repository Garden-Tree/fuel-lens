/**
 * 燃費の単位換算ページ（/fuel-convert）の純粋なロジック: 換算、入力の検証、早見表、FAQ、構造化データ（JSON-LD）。
 * 換算は丸める前の値で行い、丸めるのは表示用の文字列にするときだけ。
 */

import { parseDraftNumber } from "./recordDraft";
import type { FaqEntry } from "./calcPage";

export const FUEL_CONVERT_PATH = "/fuel-convert";
/** ナビ・フッター用の短い名前 */
export const FUEL_CONVERT_TITLE = "燃費の単位換算";
/** 構造化データの url に使う本番の絶対 URL */
export const FUEL_CONVERT_CANONICAL_URL = "https://fuel-lens.gadelog.com/fuel-convert";

/** 米ガロン (L) */
export const US_GALLON_L = 3.785411784;
/** 英ガロン (L) */
export const UK_GALLON_L = 4.54609;
/** マイル (km) */
export const MILE_KM = 1.609344;

export type FuelUnit = "kmpl" | "l100km" | "mpgUs" | "mpgUk";

export const FUEL_UNITS: readonly FuelUnit[] = ["kmpl", "l100km", "mpgUs", "mpgUk"];

export const FUEL_UNIT_LABELS: Record<FuelUnit, string> = {
  kmpl: "km/L",
  l100km: "L/100km",
  mpgUs: "mpg (US)",
  mpgUk: "mpg (UK)",
};

/** 単位ごとの向き。L/100km だけ少ないほど良い */
export const FUEL_UNIT_BETTER: Record<FuelUnit, string> = {
  kmpl: "大きいほど良い",
  l100km: "少ないほど良い",
  mpgUs: "大きいほど良い",
  mpgUk: "大きいほど良い",
};

/** 任意の単位の値を km/L にする（value > 0 を前提） */
export function toKmPerL(value: number, unit: FuelUnit): number {
  switch (unit) {
    case "kmpl":
      return value;
    case "l100km":
      return 100 / value;
    case "mpgUs":
      return (value * MILE_KM) / US_GALLON_L;
    case "mpgUk":
      return (value * MILE_KM) / UK_GALLON_L;
  }
}

/** km/L を任意の単位にする（kmPerL > 0 を前提） */
export function fromKmPerL(kmPerL: number, unit: FuelUnit): number {
  switch (unit) {
    case "kmpl":
      return kmPerL;
    case "l100km":
      return 100 / kmPerL;
    case "mpgUs":
      return (kmPerL * US_GALLON_L) / MILE_KM;
    case "mpgUk":
      return (kmPerL * UK_GALLON_L) / MILE_KM;
  }
}

/** 単位間の換算 */
export function convertFuelEconomy(value: number, from: FuelUnit, to: FuelUnit): number {
  return fromKmPerL(toKmPerL(value, from), to);
}

const format2 = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format1 = (value: number) => value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatInt = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

export type FuelConvertInput = {
  value: string;
  unit: FuelUnit;
  /** ガソリン単価 (円/L)。任意 */
  price: string;
};

export type FuelConvertField = "value" | "price";

export type FuelConvertResult = {
  errors: Partial<Record<FuelConvertField, string>>;
  /** 4 単位の表示文字列（小数第 2 位）。出せなければ null */
  values: Record<FuelUnit, string> | null;
  /** 1km あたりの燃料費 (円/km)（小数第 1 位）。単価があるときだけ */
  costPerKm: string | null;
  /** 100km あたりの燃料費 (円)。単価があるときだけ */
  costPer100km: string | null;
};

/** 任意でない・任意の数値欄を検証する。空は value null でエラーにしない */
function parsePositive(raw: string, label: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${label}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (parsed.value <= 0) return { value: null, error: `${label}は 0 より大きい数値で入力してください` };
  return { value: parsed.value };
}

/** 入力中の文字列から換算結果を作る。未入力はエラーにしない（結果が出ないだけ） */
export function computeFuelConvert(input: FuelConvertInput): FuelConvertResult {
  const errors: FuelConvertResult["errors"] = {};
  const main = parsePositive(input.value, FUEL_UNIT_LABELS[input.unit]);
  if (main.error) errors.value = main.error;
  const priceParsed = parsePositive(input.price, "ガソリン単価");
  if (priceParsed.error) errors.price = priceParsed.error;

  const value = main.value;
  const price = priceParsed.value;
  const kmPerL = value != null ? toKmPerL(value, input.unit) : null;
  const values =
    value != null && kmPerL != null
      ? (Object.fromEntries(FUEL_UNITS.map((u) => [u, format2(u === input.unit ? value : fromKmPerL(kmPerL, u))])) as Record<
          FuelUnit,
          string
        >)
      : null;
  const costPerKm = kmPerL != null && price != null ? price / kmPerL : null;

  return {
    errors,
    values,
    costPerKm: costPerKm != null ? format1(costPerKm) : null,
    costPer100km: costPerKm != null ? formatInt(costPerKm * 100) : null,
  };
}

/** 早見表の km/L */
export const QUICK_TABLE_KMPL = [5, 10, 15, 20, 25, 30, 40, 50] as const;

/** 早見表: km/L ごとの L/100km・mpg (US)・mpg (UK)（表示用の文字列。電卓と同じ関数で求める） */
export function buildQuickTable(): { kmpl: number; l100km: string; mpgUs: string; mpgUk: string }[] {
  return QUICK_TABLE_KMPL.map((kmpl) => ({
    kmpl,
    l100km: format2(fromKmPerL(kmpl, "l100km")),
    mpgUs: format2(fromKmPerL(kmpl, "mpgUs")),
    mpgUk: format2(fromKmPerL(kmpl, "mpgUk")),
  }));
}

/** ページの FAQ と JSON-LD の FAQPage で共有する。換算の式と早見表は本文にあるので載せない */
export const FUEL_CONVERT_FAQS: FaqEntry[] = [
  {
    q: "L/100km は小さいほどよいのですか？",
    a: "はい。L/100km は 100km 走るのに必要なガソリンの量なので、小さいほど燃費がよいことを表します。km/L と mpg は 1 単位の燃料で走れる距離なので、大きいほど燃費がよいことを表します。",
  },
];

/**
 * /fuel-convert の構造化データ（WebApplication + FAQPage）を JSON 文字列で返す。
 * 固定の文言だけから作り、利用者の入力は含めない。`<` を < にして `</script>` で閉じられないようにする。
 */
export function buildFuelConvertJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "燃費の単位換算ツール",
        url: FUEL_CONVERT_CANONICAL_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description:
          "燃費を km/L・L/100km・mpg (US)・mpg (UK) の間で換算します。1 つの値を入れると、ほかの単位の値を同時に表示します。",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: FUEL_CONVERT_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
