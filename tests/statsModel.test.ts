import { describe, expect, it } from "vitest";
import { applyFillChain } from "@/lib/fillChain";
import type { FuelRecord } from "@/lib/types";
import {
  MAX_STATION_ROWS,
  buildStatsModel,
  priceDelta,
  selectStationRows,
  stationBarWidth,
  summarizeStations,
} from "@/lib/stats";

let seq = 0;
function rec(overrides: Partial<FuelRecord> = {}): FuelRecord {
  seq += 1;
  return {
    id: `m${String(seq).padStart(3, "0")}`,
    date: "2026-10-01",
    total_distance: null,
    fuel_amount: null,
    gas_station: null,
    price_per_unit: null,
    total_cost: null,
    fuel_efficiency: null,
    ...overrides,
  };
}

const today = new Date(2026, 9, 15); // 2026-10-15

function fixture(): FuelRecord[] {
  return [
    // 3 ヶ月より前
    rec({ date: "2025-01-10", gas_station: "ENEOS 調布店", fuel_amount: 30, price_per_unit: 170, total_cost: 5100 }),
    // 3 ヶ月以内
    rec({ date: "2026-08-20", gas_station: "ENEOS 調布店", fuel_amount: 30, price_per_unit: 175, total_cost: 5250 }),
    rec({ date: "2026-09-18", gas_station: "ENEOS 調布店", fuel_amount: 30, price_per_unit: 176, total_cost: 5280 }),
    rec({ date: "2026-10-10", gas_station: "コスモ 三鷹", fuel_amount: 30, price_per_unit: 168, total_cost: 5040 }),
    rec({ date: "2026-10-12", gas_station: "コスモ 三鷹", fuel_amount: 30, price_per_unit: 170, total_cost: 5100 }),
    // 日付不明
    rec({ date: "", gas_station: "ENEOS 調布店", fuel_amount: 20, price_per_unit: 180, total_cost: 3600 }),
  ];
}

describe("buildStatsModel", () => {
  it("全期間: 件数・系列・サマリーを導出する", () => {
    const records = fixture();
    const model = buildStatsModel(records, "all", today);

    expect(model.period).toBe("all");
    expect(model.unknownDateCount).toBe(1);
    // 全期間は全記録（日付不明を含む）を通す
    expect(model.filteredRecords).toHaveLength(6);
    expect(model.validRecordCount).toBe(6);
    expect(model.summary.count).toBe(6);
    expect(model.summary.totalCost).toBe(5100 + 5250 + 5280 + 5040 + 5100 + 3600);
    // 支払総額は月別（2025-01 / 2026-08 / 2026-09 / 2026-10）に集計される
    expect(model.monthlyCost.length).toBeGreaterThanOrEqual(4);
    // 単価系列は日付の有効な記録だけ（日付不明は除く）
    expect(model.price.series).toHaveLength(5);
    expect(model.price.timeDomain).not.toBeNull();
    expect(model.price.axis.averageTick).not.toBeNull();
    // 燃費の算出された記録が無ければ系列は空
    expect(model.efficiency.series).toEqual([]);
    expect(model.efficiency.timeDomain).toBeNull();
  });

  it("期間で絞ると古い記録は集計から外れ、日付不明の件数は期間に関係しない", () => {
    const model = buildStatsModel(fixture(), "3m", today);

    expect(model.unknownDateCount).toBe(1);
    expect(model.filteredRecords).toHaveLength(4);
    expect(model.validRecordCount).toBe(4);
    expect(model.summary.count).toBe(4);
    expect(model.price.series).toHaveLength(4);
    expect(model.stations.comparison.groups.map(g => g.visits).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("スタンド比較の行・hiddenCount・棒の長さはヘルパーと一致する", () => {
    const model = buildStatsModel(fixture(), "all", today);
    const comparison = summarizeStations(model.filteredRecords);
    const { rows, hiddenCount } = selectStationRows(comparison);

    expect(model.stations.comparison).toEqual(comparison);
    expect(model.stations.hiddenCount).toBe(hiddenCount);
    expect(model.stations.rows.map(r => r.group)).toEqual(rows);

    const prices = rows.flatMap(g => (g.avgPrice != null ? [g.avgPrice] : []));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    expect(model.stations.rows.map(r => r.barWidth)).toEqual(rows.map(g => stationBarWidth(g.avgPrice, min, max)));
    expect(model.stations.rows.map(r => r.isCheapest)).toEqual(rows.map(g => g.key === comparison.cheapestKey));
    // 最安は 15%、最高は 100%
    expect(Math.min(...model.stations.rows.map(r => r.barWidth))).toBeCloseTo(15);
    expect(Math.max(...model.stations.rows.map(r => r.barWidth))).toBeCloseTo(100);
  });

  it("スタンドが多いときは MAX_STATION_ROWS 件に絞り、残りを hiddenCount にする", () => {
    const records = Array.from({ length: MAX_STATION_ROWS + 3 }, (_, i) =>
      rec({
        date: "2026-10-01",
        gas_station: `スタンド${String.fromCharCode(65 + i)}`,
        fuel_amount: 10,
        price_per_unit: 160 + i,
        total_cost: (160 + i) * 10,
      })
    );
    const model = buildStatsModel(records, "all", today);

    expect(model.stations.rows).toHaveLength(MAX_STATION_ROWS);
    expect(model.stations.hiddenCount).toBe(3);
  });

  it("前回比 (priceDelta) は期間に関係なく全記録で求める", () => {
    const records = fixture();
    const all = buildStatsModel(records, "all", today);
    const recent = buildStatsModel(records, "3m", today);

    expect(all.price.delta).toEqual(priceDelta(records));
    expect(recent.price.delta).toEqual(priceDelta(records));

    // 期間内に 1 件しか残らなくても、前回（期間外）との差が出る
    const sparse = [
      rec({ date: "2025-01-10", fuel_amount: 30, price_per_unit: 170, total_cost: 5100 }),
      rec({ date: "2026-10-10", fuel_amount: 30, price_per_unit: 180, total_cost: 5400 }),
    ];
    const model = buildStatsModel(sparse, "3m", today);
    expect(model.price.series).toHaveLength(1);
    expect(model.price.delta.diffFromPrevious).toBeCloseTo(10);
  });

  it("合計（走行距離・給油量）は支払総額の無い部分給油・持ち越し行も含め、平均は満タン給油で閉じた run だけで求める", () => {
    // オドメーターモード: A(先頭) → B(部分給油・支払総額なし) → C(オドメーターなし = 持ち越し行・支払総額なし) → D(満タン)
    const chained = applyFillChain(
      [
        rec({ date: "2026-10-01", odometer: 1000, fuel_amount: 30, total_cost: 5100 }),
        rec({ date: "2026-10-03", odometer: 1200, fuel_amount: 10, is_full: false }),
        rec({ date: "2026-10-05", odometer: null, fuel_amount: 5 }),
        rec({ date: "2026-10-08", odometer: 1600, fuel_amount: 25, total_cost: 4250 }),
      ],
      { distance_mode: "odometer" }
    );
    const model = buildStatsModel(chained, "all", today);

    // 燃費も支払総額も無い B・C は件数・系列の対象外
    expect(model.validRecordCount).toBe(2);
    expect(model.summary.count).toBe(2);
    expect(model.summary.totalFuel).toBe(30 + 10 + 5 + 25);
    expect(model.summary.totalDistance).toBe(200 + 400);
    expect(model.summary.totalCost).toBe(5100 + 4250);
    // 平均燃費は D が閉じた run（B・C・D）の Σkm / ΣL
    expect(model.summary.avgEfficiency).toBeCloseTo(600 / 40, 10);
  });

  it("記録が無ければ空のモデルになる", () => {
    const model = buildStatsModel([], "all", today);

    expect(model.unknownDateCount).toBe(0);
    expect(model.validRecordCount).toBe(0);
    expect(model.summary.count).toBe(0);
    expect(model.monthlyCost).toEqual([]);
    expect(model.price.series).toEqual([]);
    expect(model.price.delta.latest).toBeNull();
    expect(model.stations.rows).toEqual([]);
    expect(model.stations.hiddenCount).toBe(0);
  });
});
