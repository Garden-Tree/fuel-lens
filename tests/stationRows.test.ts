import { describe, expect, it } from "vitest";
import { MAX_STATION_ROWS, STATION_BAR_MIN_WIDTH, selectStationRows, stationBarWidth } from "@/lib/stats";
import type { StationSummary } from "@/lib/stats";

function group(key: string, overrides: Partial<StationSummary> = {}): StationSummary {
  return {
    key,
    label: key,
    brand: null,
    visits: 1,
    pricedVisits: 1,
    totalFuel: 0,
    totalCost: 0,
    avgPrice: null,
    lastPrice: null,
    lastDate: null,
    minPrice: null,
    maxPrice: null,
    ...overrides,
  };
}

function groups(n: number): StationSummary[] {
  return Array.from({ length: n }, (_, i) => group(`s${i + 1}`));
}

describe("selectStationRows", () => {
  it("上限以下ならそのまま返し、hiddenCount は 0", () => {
    const g = groups(3);
    const { rows, hiddenCount } = selectStationRows({ groups: g, cheapestKey: null });
    expect(rows).toEqual(g);
    expect(hiddenCount).toBe(0);
  });

  it("既定の上限は 8 件で、超えた分を hiddenCount に数える", () => {
    expect(MAX_STATION_ROWS).toBe(8);
    const { rows, hiddenCount } = selectStationRows({ groups: groups(11), cheapestKey: null });
    expect(rows.map(r => r.key)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    expect(hiddenCount).toBe(3);
  });

  it("最安が上位に入っていれば並びは変えない", () => {
    const { rows, hiddenCount } = selectStationRows({ groups: groups(10), cheapestKey: "s3" });
    expect(rows.map(r => r.key)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]);
    expect(hiddenCount).toBe(2);
  });

  it("最安が圏外なら 8 行目と入れ替えて必ず見せる", () => {
    const { rows, hiddenCount } = selectStationRows({ groups: groups(10), cheapestKey: "s10" });
    expect(rows.map(r => r.key)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s10"]);
    expect(rows).toHaveLength(8);
    expect(hiddenCount).toBe(2);
  });

  it("最安が 8 行目ちょうどなら入れ替えない", () => {
    const { rows } = selectStationRows({ groups: groups(10), cheapestKey: "s8" });
    expect(rows.map(r => r.key).slice(-1)).toEqual(["s8"]);
  });

  it("cheapestKey が null や存在しないキーなら何もしない", () => {
    const g = groups(10);
    expect(selectStationRows({ groups: g, cheapestKey: null }).rows).toEqual(g.slice(0, 8));
    expect(selectStationRows({ groups: g, cheapestKey: "nope" }).rows).toEqual(g.slice(0, 8));
  });

  it("max を指定できる（最安の入れ替えも max 基準）", () => {
    const { rows, hiddenCount } = selectStationRows({ groups: groups(6), cheapestKey: "s6" }, 3);
    expect(rows.map(r => r.key)).toEqual(["s1", "s2", "s6"]);
    expect(hiddenCount).toBe(3);
  });

  it("グループが空なら空配列", () => {
    expect(selectStationRows({ groups: [], cheapestKey: null })).toEqual({ rows: [], hiddenCount: 0 });
  });
});

describe("stationBarWidth", () => {
  it("最安は 15%、最高は 100%、中間は線形", () => {
    expect(STATION_BAR_MIN_WIDTH).toBe(15);
    expect(stationBarWidth(150, 150, 170)).toBe(15);
    expect(stationBarWidth(170, 150, 170)).toBe(100);
    expect(stationBarWidth(160, 150, 170)).toBeCloseTo(57.5, 10);
  });

  it("最安 = 最高（1 件だけ・全て同額）なら 100%", () => {
    expect(stationBarWidth(160, 160, 160)).toBe(100);
  });

  it("平均単価・最安・最高のどれかが null なら 0", () => {
    expect(stationBarWidth(null, 150, 170)).toBe(0);
    expect(stationBarWidth(160, null, 170)).toBe(0);
    expect(stationBarWidth(160, 150, null)).toBe(0);
  });

  it("範囲内の値は 15〜100 に収まる", () => {
    for (const p of [150, 151.3, 160, 169.9, 170]) {
      const w = stationBarWidth(p, 150, 170);
      expect(w).toBeGreaterThanOrEqual(15);
      expect(w).toBeLessThanOrEqual(100);
    }
  });
});
