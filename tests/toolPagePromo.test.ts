import { describe, expect, it } from "vitest";
import {
  TOOL_PAGE_PROMOS,
  findToolPagePromo,
  fuelDiscountSavings,
  litersFromDisplay,
  savingsText,
  type ToolPagePromo,
} from "@/lib/promo/toolPage";

const idemitsu = TOOL_PAGE_PROMOS.find((p) => p.id === "idemitsu-denki")!;

describe("findToolPagePromo", () => {
  it("出光でんきは /gas-cost 向けで、リンクが入るまでは出さない", () => {
    expect(idemitsu.pages).toEqual(["/gas-cost"]);
    expect(idemitsu.href).toBeNull();
    expect(findToolPagePromo("/gas-cost")).toBeNull();
  });

  it("リンクが入っていて、ページが一致する最初の 1 件を返す", () => {
    const promos: ToolPagePromo[] = [
      { ...idemitsu, id: "a", href: null },
      { ...idemitsu, id: "b", href: "https://px.a8.net/svt/ejp?a8mat=TEST", pages: ["/calc"] },
      { ...idemitsu, id: "c", href: "https://px.a8.net/svt/ejp?a8mat=TEST" },
    ];
    expect(findToolPagePromo("/gas-cost", promos)?.id).toBe("c");
    expect(findToolPagePromo("/calc", promos)?.id).toBe("b");
    expect(findToolPagePromo("/warikan", promos)).toBeNull();
  });
});

describe("fuelDiscountSavings", () => {
  it("給油量 × 2 円（1 円未満は四捨五入）", () => {
    expect(fuelDiscountSavings(23.08, idemitsu)).toBe(46);
    expect(fuelDiscountSavings(20, idemitsu)).toBe(40);
    expect(fuelDiscountSavings(10.25, idemitsu)).toBe(21);
  });

  it("月 100 L を超える分は数えない", () => {
    expect(fuelDiscountSavings(100, idemitsu)).toBe(200);
    expect(fuelDiscountSavings(150.5, idemitsu)).toBe(200);
  });

  it("給油量が出ていない・0 以下・数値でない・1 円に満たないときは null", () => {
    expect(fuelDiscountSavings(null, idemitsu)).toBeNull();
    expect(fuelDiscountSavings(0, idemitsu)).toBeNull();
    expect(fuelDiscountSavings(-5, idemitsu)).toBeNull();
    expect(fuelDiscountSavings(Number.NaN, idemitsu)).toBeNull();
    expect(fuelDiscountSavings(Number.POSITIVE_INFINITY, idemitsu)).toBeNull();
    expect(fuelDiscountSavings(0.1, idemitsu)).toBeNull();
  });
});

describe("litersFromDisplay / savingsText", () => {
  it("計算結果の給油量の表示文字列を数値にする", () => {
    expect(litersFromDisplay("23.08")).toBe(23.08);
    expect(litersFromDisplay("1,234.56")).toBe(1234.56);
    expect(litersFromDisplay(null)).toBeNull();
    expect(litersFromDisplay("abc")).toBeNull();
  });

  it("値引き額の一文。額が無ければ null", () => {
    expect(savingsText(46)).toBe("この計算の給油量なら約46円お得です。");
    expect(savingsText(1200)).toBe("この計算の給油量なら約1,200円お得です。");
    expect(savingsText(null)).toBeNull();
  });
});
