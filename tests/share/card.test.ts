import { describe, expect, it } from "vitest";
import { applyFillChain } from "@/lib/fillChain";
import {
  SHARE_CARD_DOMAIN,
  SHARE_URL,
  shareButtonLabelOf,
  shareCardModelOf,
  shareTextOf,
  xIntentUrlOf,
} from "@/lib/share/card";
import type { FuelRecord } from "@/lib/types";

function rec(id: string, date: string, extra: Partial<FuelRecord> = {}): FuelRecord {
  return {
    id,
    date,
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    ...extra,
  };
}

/** 連鎖計算して日付の降順にする（useVehicleScope の records と同じ形） */
function chained(records: FuelRecord[]): FuelRecord[] {
  return applyFillChain(records).sort((a, b) => b.date.localeCompare(a.date));
}

// ローカル時刻の 2026年10月14日
const TODAY = new Date(2026, 9, 14, 12, 0, 0);

describe("shareCardModelOf", () => {
  it("今月の満タン給油の燃費を Σkm/ΣL で求め、回数・走行・給油代を添える", () => {
    const records = chained([
      rec("a", "2026-09-20", { total_distance: 300, fuel_amount: 20, total_cost: 3400 }),
      rec("b", "2026-10-03", { total_distance: 500, fuel_amount: 25, total_cost: 4250 }),
      rec("c", "2026-10-12", { total_distance: 1000, fuel_amount: 40, total_cost: 6800 }),
    ]);
    const m = shareCardModelOf(records, TODAY, " プリウス ");
    expect(m).not.toBeNull();
    expect(m!.kind).toBe("month");
    expect(m!.periodLabel).toBe("2026年10月");
    expect(m!.periodPhrase).toBe("今月");
    expect(m!.vehicleName).toBe("プリウス");
    // (500 + 1000) / (25 + 40) = 23.0769…（各給油の単純平均 22.5 ではない）
    expect(m!.efficiency).toBeCloseTo(1500 / 65);
    expect(m!.efficiencyText).toBe("23.08");
    expect(m!.stats).toEqual([
      { label: "給油", value: "2", unit: "回" },
      { label: "走行", value: "1,500", unit: "km" },
      { label: "給油代", value: "¥11,050", unit: "" },
    ]);
    expect(m!.statsLine).toBe("給油 2回・走行 1,500 km・給油代 ¥11,050");
    expect(m!.filename).toBe("fuellens-2026-10.png");
    expect(m!.fraction).toBeGreaterThan(0);
    expect(m!.fraction).toBeLessThanOrEqual(1);
    expect(m!.scale.min).toBeLessThan(m!.efficiency);
    expect(m!.scale.max).toBeGreaterThan(m!.efficiency);
  });

  it("部分給油は次の満タン給油の run に合算する（部分給油だけの記録は数えない）", () => {
    const records = chained([
      rec("a", "2026-09-28", { total_distance: 400, fuel_amount: 20 }),
      rec("b", "2026-10-05", { total_distance: 200, fuel_amount: 10, is_full: false, total_cost: 1700 }),
      rec("c", "2026-10-10", { total_distance: 400, fuel_amount: 30, total_cost: 5100 }),
    ]);
    const m = shareCardModelOf(records, TODAY, null)!;
    // run = b + c: (200 + 400) / (10 + 30) = 15.00
    expect(m.efficiencyText).toBe("15.00");
    expect(m.vehicleName).toBeNull();
    // 回数・走行・給油代は部分給油も含めた期間内の合計
    expect(m.statsLine).toBe("給油 2回・走行 600 km・給油代 ¥6,800");
  });

  it("今月が部分給油だけなら直近 30 日に切り替える", () => {
    const records = chained([
      rec("a", "2026-09-10", { total_distance: 400, fuel_amount: 20 }),
      rec("b", "2026-09-25", { total_distance: 600, fuel_amount: 30, total_cost: 5000 }),
      rec("c", "2026-10-08", { total_distance: 100, fuel_amount: 5, is_full: false }),
    ]);
    const m = shareCardModelOf(records, TODAY, "N-BOX")!;
    expect(m.kind).toBe("recent");
    expect(m.periodLabel).toBe("直近30日");
    expect(m.periodPhrase).toBe("直近30日");
    // 直近 30 日 = 2026-09-15〜2026-10-14。a（9/10）は外、b と c が対象
    expect(m.efficiencyText).toBe("20.00");
    expect(m.stats[0]).toEqual({ label: "給油", value: "2", unit: "回" });
    expect(m.statsLine).toBe("給油 2回・走行 700 km・給油代 ¥5,000");
    expect(m.filename).toBe("fuellens-2026-10-14.png");
    expect(shareButtonLabelOf(m)).toBe("直近30日の燃費をシェア");
  });

  it("今月にも直近 30 日にも燃費が無ければ null（部分給油だけ・最初の 1 回だけ）", () => {
    const partialsOnly = chained([
      rec("a", "2026-08-01", { total_distance: 400, fuel_amount: 20 }),
      rec("b", "2026-08-20", { total_distance: 400, fuel_amount: 20 }),
      rec("c", "2026-10-02", { total_distance: 100, fuel_amount: 5, is_full: false }),
      rec("d", "2026-10-09", { total_distance: 100, fuel_amount: 5, is_full: false }),
    ]);
    expect(shareCardModelOf(partialsOnly, TODAY)).toBeNull();

    // 最初の満タン給油（前回が無い）は燃費が出ない
    const firstOnly = chained([rec("a", "2026-10-02", { total_distance: 400, fuel_amount: 20 })]);
    // トリップモードでは最初の記録にも区間距離があるので燃費が出る。オドメーターモードの最初の記録は出ない
    const odoFirst = applyFillChain([rec("a", "2026-10-02", { odometer: 12000, fuel_amount: 20 })], { distance_mode: "odometer" });
    expect(shareCardModelOf(firstOnly, TODAY)?.efficiencyText).toBe("20.00");
    expect(shareCardModelOf(odoFirst, TODAY)).toBeNull();
    expect(shareCardModelOf([], TODAY)).toBeNull();
  });

  it("記録漏れで連鎖が切れた記録は数えず、日付の不正な記録は無視する", () => {
    const records = chained([
      rec("a", "2026-10-02", { total_distance: 300, fuel_amount: 20, missed_previous: true }),
      rec("b", "", { total_distance: 300, fuel_amount: 10 }),
    ]);
    expect(shareCardModelOf(records, TODAY)).toBeNull();
  });

  it("給油代が分からなければ給油代を省き、走行が 0 なら走行も省く", () => {
    const records = [rec("a", "2026-10-02", { fuel_efficiency: 18, run_distance: 360, run_fuel: 20, fuel_amount: 20 })];
    const m = shareCardModelOf(records, TODAY)!;
    expect(m.stats).toEqual([{ label: "給油", value: "1", unit: "回" }]);
    expect(m.statsLine).toBe("給油 1回");
    expect(m.efficiencyText).toBe("18.00");
  });

  it("大きな値も小数第 2 位・桁区切りで表示する", () => {
    const records = chained([
      rec("a", "2026-10-01", { total_distance: 1, fuel_amount: 1 }),
      rec("b", "2026-10-02", { total_distance: 12345.6, fuel_amount: 197.3, total_cost: 1234567 }),
    ]);
    const m = shareCardModelOf(records, TODAY)!;
    expect(m.efficiencyText).toBe(((12345.6 + 1) / (197.3 + 1)).toFixed(2));
    expect(m.statsLine).toBe("給油 2回・走行 12,347 km・給油代 ¥1,234,567");
  });
});

describe("共有の文言と URL", () => {
  it("文言・リンク・X の投稿画面の URL", () => {
    expect(shareTextOf({ periodPhrase: "今月", efficiencyText: "62.54" })).toBe(
      "今月の燃費は 62.54 km/L でした #燃費記録 #FuelLens"
    );
    expect(SHARE_URL).toBe("https://fuel-lens.gadelog.com/?utm_source=share&utm_medium=card");
    expect(SHARE_CARD_DOMAIN).toBe("fuel-lens.gadelog.com");

    const intent = new URL(xIntentUrlOf("今月の燃費は 62.54 km/L でした #燃費記録"));
    expect(intent.origin + intent.pathname).toBe("https://twitter.com/intent/tweet");
    expect(intent.searchParams.get("text")).toBe("今月の燃費は 62.54 km/L でした #燃費記録");
    expect(intent.searchParams.get("url")).toBe(SHARE_URL);
  });
});
