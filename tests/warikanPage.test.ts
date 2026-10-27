import { describe, expect, it } from "vitest";
import {
  EMPTY_WARIKAN_INPUT,
  WARIKAN_DESCRIPTION,
  WARIKAN_EXAMPLE,
  WARIKAN_FAQS,
  WARIKAN_PAGE_TITLE,
  buildWarikanJsonLd,
  buildWarikanQuery,
  buildWarikanShareText,
  computeWarikan,
  lineShareUrl,
  parseWarikanQuery,
  perPersonAmount,
  warikanExample,
  type WarikanInput,
} from "@/lib/warikanPage";
import { computeGasCost } from "@/lib/gasCostPage";

const base: WarikanInput = { ...WARIKAN_EXAMPLE }; // 往復 150 km × 2・15 km/L・170 円/L・高速代 4,000 円・4 人・全員・100 円単位

describe("computeWarikan", () => {
  it("ガソリン代・合計・1 人あたりを出す（往復）", () => {
    expect(computeWarikan(base)).toEqual({
      errors: {},
      fuelCost: 3400,
      toll: 4000,
      total: 7400,
      people: 4,
      payers: 4,
      perPerson: 1900,
      collected: 7600,
    });
  });

  it("ガソリン代は /gas-cost の computeGasCost と同じ丸め", () => {
    const input = { ...base, distance: "10", efficiency: "3", price: "155", trip: "oneway" as const };
    expect(computeWarikan(input).fuelCost).toBe(
      Number(computeGasCost({ distance: "10", efficiency: "3", price: "155", people: "", roundTrip: false }).cost)
    );
  });

  it("運転手は払わないなら同乗者の人数で割る", () => {
    const r = computeWarikan({ ...base, driver: "exclude" });
    expect(r.payers).toBe(3);
    expect(r.perPerson).toBe(2500);
    expect(r.collected).toBe(7500);
  });

  it("端数は選んだ単位で切り上げる", () => {
    expect(perPersonAmount(7400, 3, 1)).toBe(2467);
    expect(perPersonAmount(7400, 3, 10)).toBe(2470);
    expect(perPersonAmount(7400, 3, 100)).toBe(2500);
    expect(perPersonAmount(7400, 4, 100)).toBe(1900);
    expect(perPersonAmount(7400, 4, 1)).toBe(1850);
    expect(computeWarikan({ ...base, rounding: 1 }).collected).toBe(7400);
  });

  it("高速代などは任意。人数が無ければ 1 人あたりは出ない", () => {
    expect(computeWarikan({ ...base, toll: "" })).toMatchObject({ toll: 0, total: 3400, perPerson: 900 });
    expect(computeWarikan({ ...base, people: "" })).toMatchObject({ total: 7400, perPerson: null, people: null });
    expect(computeWarikan(EMPTY_WARIKAN_INPUT)).toMatchObject({ errors: {}, fuelCost: null, total: null, perPerson: null });
  });

  it("不正な入力は日本語のエラー", () => {
    const r = computeWarikan({ ...base, distance: "abc", people: "1", toll: "-5" });
    expect(r.errors.distance).toBe("走行距離は数値で入力してください");
    expect(r.errors.people).toContain("2〜99");
    expect(r.errors.toll).toBeDefined();
    expect(r.perPerson).toBeNull();
    expect(computeWarikan({ ...base, toll: "100.5" }).errors.toll).toBeDefined();
    expect(computeWarikan({ ...base, distance: "20000" }).errors.distance).toContain("以下");
  });
});

describe("共有のクエリ", () => {
  it("入力からクエリを作り、読み戻すと同じ入力になる", () => {
    const query = buildWarikanQuery(base);
    expect(query).toBe("km=150&trip=round&eff=15&price=170&toll=4000&people=4&driver=all&round=100");
    expect(parseWarikanQuery(`?${query}`)).toEqual(base);
    const exclude: WarikanInput = { ...base, trip: "oneway", driver: "exclude", rounding: 10, toll: "" };
    expect(parseWarikanQuery(`?${buildWarikanQuery(exclude)}`)).toEqual(exclude);
  });

  it("全角数字・カンマは半角に正規化し、不正な欄は載せない", () => {
    const q = new URLSearchParams(buildWarikanQuery({ ...base, distance: "１,２００", efficiency: "abc", toll: "4,000" }));
    expect(q.get("km")).toBe("1200");
    expect(q.get("eff")).toBeNull();
    expect(q.get("toll")).toBe("4000");
    expect(buildWarikanQuery(EMPTY_WARIKAN_INPUT)).toBe("");
  });

  it("不正な値・範囲外・知らないキーは無視する", () => {
    const parsed = parseWarikanQuery(
      "?km=abc&trip=both&eff=-3&price=1e3&toll=12.5&people=1&driver=me&round=50&other=1&efficiency=15"
    );
    expect(parsed).toBeNull();
    const partly = parseWarikanQuery("?km=300&people=100&eff=150&price=%EF%BC%91%EF%BC%97%EF%BC%90&driver=exclude&round=10");
    expect(partly).toEqual({ ...EMPTY_WARIKAN_INPUT, distance: "300", driver: "exclude", rounding: 10 });
    expect(parseWarikanQuery("?km=0")).toBeNull();
    expect(parseWarikanQuery("?km=10001")).toBeNull();
    expect(parseWarikanQuery("?km=12.345")).toBeNull();
    expect(parseWarikanQuery("?km=<script>")).toBeNull();
    expect(parseWarikanQuery("?toll=0")).toEqual({ ...EMPTY_WARIKAN_INPUT, toll: "0" });
    expect(parseWarikanQuery("?km=12.5&trip=oneway")).toEqual({ ...EMPTY_WARIKAN_INPUT, distance: "12.5", trip: "oneway" });
    expect(parseWarikanQuery("")).toBeNull();
    expect(parseWarikanQuery("?trip=round&driver=all")).toBeNull();
  });
});

describe("共有する文面", () => {
  it("1 人あたり・内訳・人数と割り方を書く", () => {
    expect(buildWarikanShareText(base)).toBe("ガソリン代の割り勘：1人 1,900円（ガソリン代 3,400円＋高速代など 4,000円、4人で均等）");
    expect(buildWarikanShareText({ ...base, driver: "exclude", toll: "" })).toBe(
      "ガソリン代の割り勘：1人 1,200円（ガソリン代 3,400円、4人・運転手は払わない）"
    );
  });

  it("1 人あたりが出ていなければ null", () => {
    expect(buildWarikanShareText({ ...base, people: "" })).toBeNull();
    expect(buildWarikanShareText(EMPTY_WARIKAN_INPUT)).toBeNull();
  });

  it("LINE の URL は共有する URL をエンコードして渡す", () => {
    expect(lineShareUrl("https://fuel-lens.gadelog.com/warikan?km=300&trip=round")).toBe(
      "https://social-plugins.line.me/lineit/share?url=https%3A%2F%2Ffuel-lens.gadelog.com%2Fwarikan%3Fkm%3D300%26trip%3Dround"
    );
  });
});

describe("ページの文言と構造化データ", () => {
  it("本文の例は computeWarikan と一致する", () => {
    const { all, exclude } = warikanExample();
    expect(all).toMatchObject({ fuelCost: 3400, total: 7400, perPerson: 1900, collected: 7600 });
    expect(exclude).toMatchObject({ payers: 3, perPerson: 2500 });
  });

  it("タイトル・説明文", () => {
    expect(WARIKAN_PAGE_TITLE).toContain("割り勘");
    expect(WARIKAN_PAGE_TITLE).toContain("1人いくら");
    expect(WARIKAN_PAGE_TITLE.endsWith("| FuelLens")).toBe(true);
    expect(WARIKAN_DESCRIPTION.length).toBeLessThanOrEqual(130);
  });

  it("FAQ は 2〜4 問で、JSON-LD は < をエスケープする", () => {
    expect(WARIKAN_FAQS.length).toBeGreaterThanOrEqual(2);
    expect(WARIKAN_FAQS.length).toBeLessThanOrEqual(4);
    const json = buildWarikanJsonLd();
    expect(json).not.toContain("<");
    const data = JSON.parse(json);
    expect(data["@graph"].map((n: { "@type": string }) => n["@type"])).toEqual(["WebApplication", "FAQPage"]);
    expect(data["@graph"][0].url).toBe("https://fuel-lens.gadelog.com/warikan");
    expect(data["@graph"][1].mainEntity).toHaveLength(WARIKAN_FAQS.length);
  });
});
