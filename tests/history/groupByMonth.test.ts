import { describe, expect, it } from "vitest";
import { groupByMonth, NO_DATE_GROUP_KEY, sumTotalCost } from "@/lib/history/groupByMonth";

type R = { id: string; date: string; total_cost: number | null };

const rec = (id: string, date: string, total_cost: number | null = 1000): R => ({ id, date, total_cost });

describe("groupByMonth", () => {
  it("並び順を保ったまま月ごとにまとめ、件数と支払総額の合計を出す", () => {
    const groups = groupByMonth([
      rec("a", "2026-09-11", 4920),
      rec("b", "2026-08-16", 5930),
      rec("c", "2026-06-25", 5377),
      rec("d", "2026-06-03", 4714),
    ]);
    expect(groups.map(g => [g.key, g.label, g.count, g.totalCost])).toEqual([
      ["2026-09", "2026年9月", 1, 4920],
      ["2026-08", "2026年8月", 1, 5930],
      ["2026-06", "2026年6月", 2, 10091],
    ]);
    expect(groups[2].records.map(r => r.id)).toEqual(["c", "d"]);
  });

  it("shortLabel では見出しを「9月」にする", () => {
    expect(groupByMonth([rec("a", "2026-09-11")], { shortLabel: true })[0].label).toBe("9月");
  });

  it("日付が無い・不正な記録は最後の「日付なし」にまとめる", () => {
    const groups = groupByMonth([rec("x", ""), rec("a", "2026-01-05"), rec("y", "2026-02-30", null), rec("b", "2025-12-31")]);
    expect(groups.map(g => g.label)).toEqual(["2026年1月", "2025年12月", "日付なし"]);
    const last = groups[groups.length - 1];
    expect(last.key).toBe(NO_DATE_GROUP_KEY);
    expect(last.records.map(r => r.id)).toEqual(["x", "y"]);
    expect(last.totalCost).toBe(1000);
  });

  it("ISO 日時の date も日付部分で月を決める", () => {
    expect(groupByMonth([rec("a", "2026-03-01T00:00:00Z")])[0].key).toBe("2026-03");
  });

  it("記録が無ければ空配列", () => {
    expect(groupByMonth([])).toEqual([]);
  });

  it("sumTotalCost は有限の数値だけを足す", () => {
    expect(sumTotalCost([{ total_cost: 100 }, { total_cost: null }, { total_cost: NaN }, { total_cost: 50 }])).toBe(150);
  });
});
