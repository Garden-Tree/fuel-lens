import { describe, expect, it } from "vitest";
import { ROUTES } from "@/lib/routeGasCostPage";
import {
  ANNUAL_PROMO_ENKIRO_MAX_MONTHLY_KM,
  TOOL_PAGE_PROMOS,
  annualGasCostPromo,
  findToolPagePromo,
  fuelDiscountSavings,
  litersFromDisplay,
  routePagePromo,
  savingsText,
  type ToolPagePromo,
} from "@/lib/promo/toolPage";

const enkiro = TOOL_PAGE_PROMOS.find((p) => p.id === "enkiro")!;
const idemitsu = TOOL_PAGE_PROMOS.find((p) => p.id === "idemitsu-denki")!;
const inswebAnnual = TOOL_PAGE_PROMOS.find((p) => p.id === "insweb-car-annual")!;

describe("findToolPagePromo", () => {
  it("出光でんきは /gas-cost 向けで、リンクが入るまではインズウェブ（自動車保険）を出す", () => {
    expect(idemitsu.pages).toEqual(["/gas-cost"]);
    expect(idemitsu.href).toBeNull();
    const promo = findToolPagePromo("/gas-cost")!;
    expect(promo.id).toBe("insweb-car-gas-cost");
    expect(promo.href).toBe(inswebAnnual.href);
    expect(promo.discountYenPerL).toBeUndefined();
    expect(promo.body).toContain("自動車保険");
  });

  it("出光でんきのリンクが入れば、/gas-cost ではインズウェブより先に出す", () => {
    const promos = TOOL_PAGE_PROMOS.map((p) => (p.id === idemitsu.id ? { ...p, href: "https://px.a8.net/svt/ejp?a8mat=TEST" } : p));
    expect(findToolPagePromo("/gas-cost", promos)?.id).toBe("idemitsu-denki");
  });

  it("/gas-cost の PR は /annual-gas-cost と /route-gas-cost には出さない", () => {
    const gasCostInsweb = TOOL_PAGE_PROMOS.find((p) => p.id === "insweb-car-gas-cost")!;
    expect(gasCostInsweb.pages).toEqual(["/gas-cost"]);
    expect(findToolPagePromo("/route-gas-cost")?.id).not.toBe("insweb-car-gas-cost");
    expect(annualGasCostPromo(900)?.id).toBe("insweb-car-annual");
  });

  it("/expense は法人専用ガソリンカード（ETC協同組合）を出す", () => {
    const promo = findToolPagePromo("/expense")!;
    expect(promo.id).toBe("etc-kumiai-fuel-card");
    expect(promo.pages).toEqual(["/expense"]);
    expect(promo.href).toBe("https://px.a8.net/svt/ejp?a8mat=4BGGBM+5FA8QQ+3EV2+HV7V6");
    expect(promo.cta).toBe("資料を請求する");
    expect(promo.discountYenPerL).toBeUndefined();
  });

  it("/route-gas-cost（区間ページ）は法人 ETC カード（高速情報協同組合）を出す", () => {
    const promo = findToolPagePromo("/route-gas-cost")!;
    expect(promo.id).toBe("kosoku-kumiai-etc-card");
    expect(promo.pages).toEqual(["/route-gas-cost"]);
    expect(promo.href).toBe("https://px.a8.net/svt/ejp?a8mat=4BGGBM+5IUUDE+1WW0+5YJRM");
    expect(promo.cta).toBe("詳しく見る");
    expect(promo.discountYenPerL).toBeUndefined();
  });

  it("区間ページは種別で選ぶ: 都市間は法人 ETC カード、行楽地は じゃらんnet", () => {
    expect(routePagePromo("intercity")?.id).toBe("kosoku-kumiai-etc-card");
    const jalan = routePagePromo("resort")!;
    expect(jalan.id).toBe("jalan-route-resort");
    expect(jalan.pages).toEqual(["/route-gas-cost"]);
    expect(jalan.href).toBe("https://px.a8.net/svt/ejp?a8mat=4BGJFS+2MNZIA+14CS+64JTE");
    expect(jalan.discountYenPerL).toBeUndefined();
    expect(jalan.disclosure).toMatch(/報酬を受け取ることがあります/);
    // 区間ページの広告は id で区別できる（GA4 の promo_id）
    expect(new Set(TOOL_PAGE_PROMOS.map((p) => p.id)).size).toBe(TOOL_PAGE_PROMOS.length);
  });

  it("全区間で、その種別向けの広告が選ばれる", () => {
    for (const r of ROUTES) {
      const promo = routePagePromo(r.kind)!;
      expect(promo.routeKinds, r.id).toContain(r.kind);
      expect(promo.id, r.id).toBe(r.kind === "resort" ? "jalan-route-resort" : "kosoku-kumiai-etc-card");
    }
  });

  it("区間ページの広告: リンクが無い・種別が合わないものは選ばない（承認待ちは href: null で置ける）", () => {
    const pending = TOOL_PAGE_PROMOS.map((p) => (p.id === "jalan-route-resort" ? { ...p, href: null } : p));
    expect(routePagePromo("resort", pending)).toBeNull();
    expect(routePagePromo("intercity", pending)?.id).toBe("kosoku-kumiai-etc-card");
    // routeKinds を持たない提携先（/gas-cost など）は区間ページに出さない
    const noKinds = TOOL_PAGE_PROMOS.map((p) => ({ ...p, routeKinds: undefined }));
    expect(routePagePromo("intercity", noKinds)).toBeNull();
  });

  it("法人向けの 2 件は /gas-cost と /annual-gas-cost の PR を変えない", () => {
    expect(findToolPagePromo("/gas-cost")?.id).toBe("insweb-car-gas-cost");
    expect(findToolPagePromo("/annual-gas-cost")?.id).toBe("enkiro");
    expect(annualGasCostPromo(100)?.id).toBe("enkiro");
    expect(annualGasCostPromo(900)?.id).toBe("insweb-car-annual");
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

describe("提携先の NG 語", () => {
  // 広告主から使わないよう指定された語（ブランド名・カード会社名を含む）。じゃらんnet は、リクルートやじゃらんnet が運営すると
  // 誤解させる表現と、実際より著しく優良・有利と誤認させる表示（景品表示法）が禁止事項なので、公式・最安・最大級などを入れない
  const NG_WORDS: Record<string, readonly string[]> = {
    "jalan-route-resort": ["公式", "運営", "リクルート", "最安", "最大", "最大級", "No.1", "ナンバーワン", "日本一", "一番", "絶対", "必ず", "ポイント還元"],
    "etc-kumiai-fuel-card": ["審査なし", "誰でも通る", "ブラック", "エネオス", "ENEOS", "出光", "アポロ", "apollo", "昭和シェル", "発行", "申し込み", "申込"],
    "kosoku-kumiai-etc-card": ["ブラック", "審査なし", "誰でも通る", "セディナ", "UC", "ＵＣ"],
  };

  for (const [id, words] of Object.entries(NG_WORDS)) {
    it(`${id} の本文・リンクの文言・開示文に NG 語を含めない`, () => {
      const promo = TOOL_PAGE_PROMOS.find((p) => p.id === id)!;
      expect(promo).toBeDefined();
      const copy = [promo.body, promo.cta, promo.disclosure].join(" ").toLowerCase();
      for (const word of words) expect(copy, word).not.toContain(word.toLowerCase());
    });
  }

  it("区間ページの広告はすべて NG 語のテストの対象にする", () => {
    for (const p of TOOL_PAGE_PROMOS.filter((p) => p.routeKinds)) expect(Object.keys(NG_WORDS), p.id).toContain(p.id);
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

  it("値引きの無い提携先は null", () => {
    expect(fuelDiscountSavings(20, enkiro)).toBeNull();
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

describe("annualGasCostPromo", () => {
  it("月間 500 km 以下はエンキロ、超えたらインズウェブ（境界）", () => {
    expect(ANNUAL_PROMO_ENKIRO_MAX_MONTHLY_KM).toBe(500);
    expect(annualGasCostPromo(500)?.id).toBe("enkiro");
    expect(annualGasCostPromo(501)?.id).toBe("insweb-car-annual");
    expect(annualGasCostPromo(66.7)?.id).toBe("enkiro");
  });

  it("距離が分からない・0 以下・数値でないときは出さない", () => {
    expect(annualGasCostPromo(null)).toBeNull();
    expect(annualGasCostPromo(0)).toBeNull();
    expect(annualGasCostPromo(-1)).toBeNull();
    expect(annualGasCostPromo(Number.NaN)).toBeNull();
  });

  it("リンクが入っていなければ出さない", () => {
    const promos = TOOL_PAGE_PROMOS.map((p) => (p.id === "enkiro" ? { ...p, href: null } : p));
    expect(annualGasCostPromo(100, promos)).toBeNull();
    expect(annualGasCostPromo(900, promos)?.id).toBe("insweb-car-annual");
  });

  it("2 件とも /annual-gas-cost 向けで、A8 のリンクと開示文を持つ", () => {
    expect(enkiro.href).toBe("https://px.a8.net/svt/ejp?a8mat=4BGCF5+25ZUKI+5O9C+5YJRM");
    const insweb = annualGasCostPromo(900)!;
    expect(insweb.href).toBe("https://px.a8.net/svt/ejp?a8mat=4BEL1G+2ZRITE+2PS+15OZHU");
    for (const p of [enkiro, insweb]) {
      expect(p.pages).toEqual(["/annual-gas-cost"]);
      expect(p.disclosure).toMatch(/報酬を受け取ることがあります/);
    }
  });
});
