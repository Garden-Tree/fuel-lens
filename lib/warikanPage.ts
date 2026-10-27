/**
 * ガソリン代の割り勘ページ（/warikan）の純粋なロジック: 入力の検証と計算、共有用のクエリと文面、FAQ、構造化データ（JSON-LD）。
 * ガソリン代の計算（距離 ÷ 燃費 × 単価、1 円未満を四捨五入）は /gas-cost の computeGasCost に任せ、丸めを複製しない。
 */

import { parseDraftNumber } from "./recordDraft";
import type { FaqEntry } from "./calcPage";
import type { ToolOgImageContent } from "./og/renderToolOgImage";
import { EXAMPLE_PRICE, MAX_PEOPLE, computeGasCost } from "./gasCostPage";

export const WARIKAN_PATH = "/warikan";
export const WARIKAN_PAGE_TITLE = "ガソリン代の割り勘計算｜距離・燃費・人数から1人いくらか計算 | FuelLens";
export const WARIKAN_DESCRIPTION =
  "ドライブや帰省のガソリン代を割り勘すると1人いくら？距離・燃費・単価・人数を入れるだけで計算。高速代も足せて、運転手は払わない割り方や100円単位の切り上げにも対応。結果はLINEやリンクで送れます。登録不要・無料。";
/** 構造化データの url に使う本番の絶対 URL */
export const WARIKAN_CANONICAL_URL = "https://fuel-lens.gadelog.com/warikan";
/** 計算機の位置（共有リンク・区間表からの飛び先） */
export const WARIKAN_CALCULATOR_ID = "warikan-calculator";

/** 運転手の扱い: all = 全員で均等、exclude = 運転手は払わない（同乗者で割る） */
export type DriverMode = "all" | "exclude";
export const DRIVER_MODES: readonly DriverMode[] = ["all", "exclude"];
/** 1 人あたりの切り上げの単位（円） */
export type RoundingUnit = 1 | 10 | 100;
export const ROUNDING_UNITS: readonly RoundingUnit[] = [1, 10, 100];
export type TripMode = "oneway" | "round";

export type WarikanInput = {
  distance: string;
  trip: TripMode;
  efficiency: string;
  price: string;
  /** 高速代・駐車場代など（任意。円） */
  toll: string;
  people: string;
  driver: DriverMode;
  rounding: RoundingUnit;
};

export const EMPTY_WARIKAN_INPUT: WarikanInput = {
  distance: "",
  trip: "round",
  efficiency: "",
  price: "",
  toll: "",
  people: "",
  driver: "all",
  rounding: 100,
};

export type WarikanField = "distance" | "efficiency" | "price" | "toll" | "people";

export type WarikanResult = {
  errors: Partial<Record<WarikanField, string>>;
  /** ガソリン代（円、整数）。出せなければ null */
  fuelCost: number | null;
  /** 高速代など（円、整数。未入力は 0） */
  toll: number;
  /** 合計（ガソリン代 + 高速代など） */
  total: number | null;
  /** 人数（2 人以上のとき） */
  people: number | null;
  /** 払う人数（運転手は払わないなら people - 1） */
  payers: number | null;
  /** 1 人あたり（選んだ単位で切り上げ） */
  perPerson: number | null;
  /** 払う人数 × 1 人あたり（切り上げで合計より多くなる分を見せる） */
  collected: number | null;
};

/** OG / Twitter 画像の内容（静的な 1 枚。共有リンクのクエリごとには作らない） */
export const WARIKAN_OG = {
  alt: "ガソリン代の割り勘計算 - 距離・燃費・人数から1人いくらかを計算。高速代・運転手の分にも対応（FuelLens）",
  content: {
    title: "ガソリン代の割り勘計算",
    subtitle: "距離・燃費・人数から1人いくらかを計算",
    resultColor: "money",
    formula: [
      { text: "7,400", kind: "num" },
      { text: "円", kind: "unit" },
      { text: "÷", kind: "unit" },
      { text: "4", kind: "num" },
      { text: "人", kind: "unit" },
      { text: "=", kind: "unit" },
      { text: "1,850", kind: "result" },
      { text: "円", kind: "unit" },
    ],
  } satisfies ToolOgImageContent,
};

/** 入力の上限（クエリの範囲チェックにも使う） */
export const WARIKAN_LIMITS = {
  distance: 10000,
  efficiency: 100,
  price: 1000,
  toll: 1_000_000,
} as const;

const LABELS: Record<WarikanField, string> = {
  distance: "走行距離",
  efficiency: "燃費",
  price: "ガソリン単価",
  toll: "高速代など",
  people: "人数",
};

function parsePositive(field: "distance" | "efficiency" | "price", raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (parsed.error) return { value: null, error: `${LABELS[field]}は数値で入力してください` };
  if (parsed.value === null) return { value: null };
  if (parsed.value <= 0) return { value: null, error: `${LABELS[field]}は 0 より大きい数値で入力してください` };
  if (parsed.value > WARIKAN_LIMITS[field]) {
    return { value: null, error: `${LABELS[field]}は ${WARIKAN_LIMITS[field].toLocaleString("ja-JP")} 以下で入力してください` };
  }
  return { value: parsed.value };
}

function parseToll(raw: string): { value: number; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (!parsed.error && parsed.value === null) return { value: 0 };
  const n = parsed.value;
  if (parsed.error || n === null || !Number.isInteger(n) || n > WARIKAN_LIMITS.toll) {
    return { value: 0, error: `${LABELS.toll}は 0〜${WARIKAN_LIMITS.toll.toLocaleString("ja-JP")} の整数（円）で入力してください` };
  }
  return { value: n };
}

/** 人数は 2〜99 の整数。空なら null（結果が出ないだけ） */
function parsePeople(raw: string): { value: number | null; error?: string } {
  const parsed = parseDraftNumber(raw);
  if (!parsed.error && parsed.value === null) return { value: null };
  const n = parsed.value;
  if (parsed.error || n === null || !Number.isInteger(n) || n < 2 || n > MAX_PEOPLE) {
    return { value: null, error: `${LABELS.people}は運転手を含めて 2〜${MAX_PEOPLE} の整数で入力してください` };
  }
  return { value: n };
}

/** 1 人あたり: 合計 ÷ 払う人数を、選んだ単位で切り上げる（集めた額が合計を下回らないように） */
export function perPersonAmount(total: number, payers: number, unit: RoundingUnit): number {
  return Math.ceil(total / payers / unit) * unit;
}

/** 入力中の文字列から結果を作る。未入力の欄はエラーにしない（結果が出ないだけ） */
export function computeWarikan(input: WarikanInput): WarikanResult {
  const errors: WarikanResult["errors"] = {};
  const read = (field: "distance" | "efficiency" | "price") => {
    const { value, error } = parsePositive(field, input[field]);
    if (error) errors[field] = error;
    return value;
  };
  const distance = read("distance");
  const efficiency = read("efficiency");
  const price = read("price");
  const toll = parseToll(input.toll);
  if (toll.error) errors.toll = toll.error;
  const people = parsePeople(input.people);
  if (people.error) errors.people = people.error;

  const fuelCostText =
    distance != null && efficiency != null && price != null
      ? computeGasCost({
          distance: String(distance),
          efficiency: String(efficiency),
          price: String(price),
          people: "",
          roundTrip: input.trip === "round",
        }).cost
      : null;
  const fuelCost = fuelCostText != null ? Number(fuelCostText.replace(/,/g, "")) : null;
  const total = fuelCost != null && !toll.error ? fuelCost + toll.value : null;
  const payers = people.value != null ? (input.driver === "exclude" ? people.value - 1 : people.value) : null;
  const perPerson = total != null && payers != null ? perPersonAmount(total, payers, input.rounding) : null;

  return {
    errors,
    fuelCost,
    toll: toll.value,
    total,
    people: people.value,
    payers,
    perPerson,
    collected: perPerson != null && payers != null ? perPerson * payers : null,
  };
}

export const formatYen = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 0 });

// ---- 共有用のクエリ ----

/** クエリのキー（これ以外は読まない） */
export const WARIKAN_QUERY_KEYS = ["km", "trip", "eff", "price", "toll", "people", "driver", "round"] as const;

/** クエリの数値: 半角数字（小数は 2 桁まで）だけ。全角・符号・指数・空白は受け付けない */
const QUERY_NUMBER = /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/;
const QUERY_INTEGER = /^(?:0|[1-9]\d{0,6})$/;

function queryNumber(raw: string | null, { min, max, integer = false, allowZero = false }: { min?: number; max: number; integer?: boolean; allowZero?: boolean }): string {
  if (raw === null || !(integer ? QUERY_INTEGER : QUERY_NUMBER).test(raw)) return "";
  const n = Number(raw);
  if (!Number.isFinite(n) || n > max) return "";
  if (min !== undefined ? n < min : allowZero ? n < 0 : n <= 0) return "";
  return raw;
}

/**
 * URL のクエリから入力を作る（共有リンクを開いたとき）。キーと値はホワイトリストと範囲で検証し、不正な値は無視する。
 * 読めた値が 1 つも無ければ null。
 */
export function parseWarikanQuery(search: string): WarikanInput | null {
  const params = new URLSearchParams(search);
  const input: WarikanInput = {
    ...EMPTY_WARIKAN_INPUT,
    distance: queryNumber(params.get("km"), { max: WARIKAN_LIMITS.distance }),
    efficiency: queryNumber(params.get("eff"), { max: WARIKAN_LIMITS.efficiency }),
    price: queryNumber(params.get("price"), { max: WARIKAN_LIMITS.price }),
    toll: queryNumber(params.get("toll"), { max: WARIKAN_LIMITS.toll, integer: true, allowZero: true }),
    people: queryNumber(params.get("people"), { min: 2, max: MAX_PEOPLE, integer: true }),
  };
  const trip = params.get("trip");
  if (trip === "oneway" || trip === "round") input.trip = trip;
  const driver = params.get("driver");
  if (driver === "all" || driver === "exclude") input.driver = driver;
  const round = params.get("round");
  const rounding = ROUNDING_UNITS.find((u) => String(u) === round);
  if (rounding) input.rounding = rounding;

  const hasValue =
    input.distance !== "" || input.efficiency !== "" || input.price !== "" || input.toll !== "" || input.people !== "";
  return hasValue ? input : null;
}

/** 数値を、クエリで読み戻せる文字列にする（小数 2 桁まで） */
function numberForQuery(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * 入力から共有用のクエリ（先頭の ? なし）を作る。値は検証済みの数値から作り直すので、
 * 全角数字やカンマで入力されても半角に正規化され、不正な欄は載せない。数値の欄が全部空なら空文字。
 */
export function buildWarikanQuery(input: WarikanInput): string {
  const r = computeWarikan(input);
  const params = new URLSearchParams();
  const positive = (field: "distance" | "efficiency" | "price") => {
    if (r.errors[field]) return null;
    const { value } = parseDraftNumber(input[field]);
    return value != null && value > 0 ? value : null;
  };
  const km = positive("distance");
  const eff = positive("efficiency");
  const price = positive("price");
  const tollParsed = parseDraftNumber(input.toll);
  const toll = !r.errors.toll && tollParsed.value != null ? tollParsed.value : null;
  if (km == null && eff == null && price == null && toll == null && r.people == null) return "";
  if (km != null) params.set("km", numberForQuery(km));
  params.set("trip", input.trip);
  if (eff != null) params.set("eff", numberForQuery(eff));
  if (price != null) params.set("price", numberForQuery(price));
  if (toll != null) params.set("toll", String(toll));
  if (r.people != null) params.set("people", String(r.people));
  params.set("driver", input.driver);
  params.set("round", String(input.rounding));
  return params.toString();
}

/**
 * 共有する文面（URL は含めない）。1 人あたりが出ていなければ null。
 * 例: 「ガソリン代の割り勘：1人 1,900円（ガソリン代 3,400円＋高速代など 4,000円、4人で均等）」
 */
export function buildWarikanShareText(input: WarikanInput, result: WarikanResult = computeWarikan(input)): string | null {
  const { perPerson, fuelCost, toll, people } = result;
  if (perPerson == null || fuelCost == null || people == null) return null;
  const breakdown = toll > 0 ? `ガソリン代 ${formatYen(fuelCost)}円＋高速代など ${formatYen(toll)}円` : `ガソリン代 ${formatYen(fuelCost)}円`;
  const how = input.driver === "exclude" ? `${people}人・運転手は払わない` : `${people}人で均等`;
  return `ガソリン代の割り勘：1人 ${formatYen(perPerson)}円（${breakdown}、${how}）`;
}

/** LINE で送る URL（LINE の公式のシェア用 URL に、共有する URL だけを渡す） */
export function lineShareUrl(url: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
}

// ---- 本文の例・FAQ・構造化データ ----

/** 本文の計算例: 往復 300 km・燃費 15 km/L・170 円/L・高速代 4,000 円・4 人 */
export const WARIKAN_EXAMPLE: WarikanInput = {
  distance: "150",
  trip: "round",
  efficiency: "15",
  price: String(EXAMPLE_PRICE),
  toll: "4000",
  people: "4",
  driver: "all",
  rounding: 100,
};

/** 本文の例の結果（全員で均等 / 運転手は払わない） */
export function warikanExample(): { all: WarikanResult; exclude: WarikanResult } {
  return {
    all: computeWarikan(WARIKAN_EXAMPLE),
    exclude: computeWarikan({ ...WARIKAN_EXAMPLE, driver: "exclude" }),
  };
}

/** ページの FAQ と JSON-LD で共有する。本文（計算式・端数・運転手の分の考え方）で答えていることは載せない */
export const WARIKAN_FAQS: FaqEntry[] = [
  {
    q: "レンタカーやカーシェアの料金も一緒に割り勘できますか？",
    a: "はい。「高速代など」の欄にレンタル料金や駐車場代も足して入れると、ガソリン代と合わせた合計を人数で割ります。",
  },
  {
    q: "送ったリンクには何が入りますか？保存されますか？",
    a: "距離・燃費・単価・高速代など・人数・割り方が URL に入り、開いた人にも同じ結果が出ます。入力した値は FuelLens のサーバーには保存されません。",
  },
  {
    q: "車の燃費が分からないときは？",
    a: "ガソリン代計算ツールの目安表に、軽自動車・普通車・ハイブリッド車・ミニバンの燃費の目安を載せています。自分の車の実燃費は満タン法の燃費計算ツールで測れます。",
  },
];

/** /warikan の構造化データ（WebApplication + FAQPage）。固定の文言だけから作り、`<` をエスケープする */
export function buildWarikanJsonLd(): string {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "ガソリン代の割り勘計算",
        url: WARIKAN_CANONICAL_URL,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web",
        inLanguage: "ja",
        isAccessibleForFree: true,
        description:
          "走行距離・燃費・ガソリン単価・人数から、ガソリン代と高速代などを割り勘したときの 1 人あたりの金額を計算します。運転手は払わない割り方や、端数の切り上げの単位も選べます。",
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
      },
      {
        "@type": "FAQPage",
        mainEntity: WARIKAN_FAQS.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
