import { describe, expect, it } from "vitest";
import { ANNUAL_GAS_COST_DESCRIPTION, ANNUAL_GAS_COST_PAGE_TITLE, QUICK_ANSWER_EXAMPLE, exampleMonthlyAndYearly } from "@/lib/annualGasCostPage";
import { CALC_DESCRIPTION, CALC_PAGE_TITLE } from "@/lib/calcPage";
import { FUEL_CONVERT_DESCRIPTION, FUEL_CONVERT_PAGE_TITLE } from "@/lib/fuelConvertPage";
import { GAS_COST_DESCRIPTION, GAS_COST_PAGE_TITLE, quickAnswer } from "@/lib/gasCostPage";
import { LANDING_DESCRIPTION, LANDING_DESCRIPTION_WITH_TRIAL, LANDING_TITLE } from "@/lib/landingPage";
import { routePageDescription, routePageTitle } from "@/lib/routeDetailPage";
import {
  ROUTES,
  ROUTE_GAS_COST_DESCRIPTION,
  ROUTE_GAS_COST_PAGE_TITLE,
  standardTotal,
  yenRough,
} from "@/lib/routeGasCostPage";
import { WARIKAN_DESCRIPTION, WARIKAN_PAGE_TITLE } from "@/lib/warikanPage";

// モバイルの検索結果は、タイトルが全角 30〜32 字前後、説明文が全角 70〜80 字前後で切れる。
// 検索語と答えの数字がその手前に入っていることを、全公開ページで確かめる（文字数はコードポイント数。半角も 1 字と数える）。

const TITLE_MAX = 32;
const DESCRIPTION_MAX = 120;
const ANSWER_WITHIN = 70;

const len = (s: string) => [...s].length;
const withoutSuffix = (title: string) => title.replace(/ ?\| FuelLens$/, "");
/** key の終わりが先頭から何字目か（見つからなければ Infinity） */
const endOf = (text: string, key: string) => {
  const i = text.indexOf(key);
  return i < 0 ? Infinity : len(text.slice(0, i)) + len(key);
};

type Page = { path: string; title: string; description: string; answer: string };

function publicPages(): Page[] {
  const gas = quickAnswer();
  const standard = gas.items.find((i) => i.label === "普通車")!;
  const annual = exampleMonthlyAndYearly(QUICK_ANSWER_EXAMPLE.monthlyKm, QUICK_ANSWER_EXAMPLE.efficiency);
  const first = ROUTES.find((r) => r.id === "tokyo-osaka")!;
  return [
    { path: "/", title: LANDING_TITLE, description: LANDING_DESCRIPTION, answer: "燃費とガソリン代を自動で記録" },
    { path: "/ (trial)", title: LANDING_TITLE, description: LANDING_DESCRIPTION_WITH_TRIAL, answer: "燃費とガソリン代を自動で記録" },
    { path: "/calc", title: CALC_PAGE_TITLE, description: CALC_DESCRIPTION, answer: "燃費（km/L）を計算" },
    { path: "/fuel-convert", title: FUEL_CONVERT_PAGE_TITLE, description: FUEL_CONVERT_DESCRIPTION, answer: "相互に換算" },
    { path: "/gas-cost", title: GAS_COST_PAGE_TITLE, description: GAS_COST_DESCRIPTION, answer: `普通車で約${standard.cost}円` },
    { path: "/annual-gas-cost", title: ANNUAL_GAS_COST_PAGE_TITLE, description: ANNUAL_GAS_COST_DESCRIPTION, answer: `月約${annual.monthly}円` },
    { path: "/warikan", title: WARIKAN_PAGE_TITLE, description: WARIKAN_DESCRIPTION, answer: "1人いくら" },
    {
      path: "/route-gas-cost",
      title: ROUTE_GAS_COST_PAGE_TITLE,
      description: ROUTE_GAS_COST_DESCRIPTION,
      answer: `片道約${yenRough(standardTotal(first).totalOneWay!)}円`,
    },
    ...ROUTES.map((r) => {
      const t = standardTotal(r);
      return {
        path: `/route-gas-cost/${r.id}`,
        title: routePageTitle(r),
        description: routePageDescription(r),
        answer: t.totalOneWay == null ? `片道約${yenRough(t.gasOneWay)}円` : `片道約${yenRough(t.totalOneWay)}円・往復約${yenRough(t.totalRoundTrip!)}円`,
      };
    }),
  ];
}

describe("検索結果（モバイル）のタイトルと説明文", () => {
  it("区間ページのタイトルは ` | FuelLens` を除いて 32 字以内で、区間名と片道の金額で始まる", () => {
    for (const r of ROUTES) {
      const title = routePageTitle(r);
      expect(title.endsWith(" | FuelLens")).toBe(true);
      expect(len(withoutSuffix(title)), title).toBeLessThanOrEqual(TITLE_MAX);
      expect(title.startsWith(`${r.name}の車のガソリン代`)).toBe(true);
      const t = standardTotal(r);
      expect(title).toContain(`片道約${yenRough(t.totalOneWay ?? t.gasOneWay)}円`);
    }
  });

  it("公開ページのタイトルは ` | FuelLens` を除いて 32 字以内", () => {
    for (const { path, title } of publicPages()) expect(len(withoutSuffix(title)), path).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("公開ページの説明文は 120 字以内で、答え（金額など）が先頭 70 字に入る", () => {
    for (const { path, description, answer } of publicPages()) {
      expect(len(description), path).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(endOf(description, answer), `${path}: ${answer}`).toBeLessThanOrEqual(ANSWER_WITHIN);
    }
  });
});
