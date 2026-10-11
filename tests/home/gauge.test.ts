import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAUGE_SCALE,
  gaugeArcPath,
  gaugeFraction,
  gaugePoint,
  gaugeScaleOf,
  gaugeBasisOf,
  withoutOutliers,
  GAUGE_RECENT_COUNT,
} from "@/lib/home/gauge";

describe("gaugeScaleOf", () => {
  it("燃費が無ければ既定の目盛り", () => {
    expect(gaugeScaleOf([])).toEqual(DEFAULT_GAUGE_SCALE);
    expect(gaugeScaleOf([null, undefined, 0, -3, Number.NaN])).toEqual(DEFAULT_GAUGE_SCALE);
  });

  it("最小〜最大の幅の 15% を上下に足し、整数に丸める", () => {
    // 幅 4 → 余白 0.6 → 11.4〜16.6 → 11〜17
    expect(gaugeScaleOf([12, 16, 14.5])).toEqual({ min: 11, max: 17 });
  });

  it("幅が狭いときは最低 0.5 km/L の余白を取る", () => {
    // 幅 1 → 余白 0.5 → 14.5〜16.5 → 14〜17
    expect(gaugeScaleOf([15, 16])).toEqual({ min: 14, max: 17 });
  });

  it("1 件だけ・全件同じ値なら値の 20%（最低 2）を上下に足す", () => {
    expect(gaugeScaleOf([15])).toEqual({ min: 12, max: 18 });
    expect(gaugeScaleOf([5, 5])).toEqual({ min: 3, max: 7 });
  });

  it("下限は 0 未満にしない", () => {
    expect(gaugeScaleOf([1, 30]).min).toBe(0);
  });

  it("null や 0 は無視する", () => {
    expect(gaugeScaleOf([null, 12, 0, 16])).toEqual(gaugeScaleOf([12, 16]));
  });
});

describe("gaugeFraction", () => {
  const scale = { min: 10, max: 20 };
  it("範囲内は比率、範囲外は 0〜1 に収める", () => {
    expect(gaugeFraction(15, scale)).toBe(0.5);
    expect(gaugeFraction(5, scale)).toBe(0);
    expect(gaugeFraction(25, scale)).toBe(1);
  });
  it("値が無い・目盛りの幅が 0 なら 0", () => {
    expect(gaugeFraction(null, scale)).toBe(0);
    expect(gaugeFraction(Number.NaN, scale)).toBe(0);
    expect(gaugeFraction(10, { min: 10, max: 10 })).toBe(0);
  });
});

describe("gaugePoint / gaugeArcPath", () => {
  const g = { cx: 150, cy: 144, r: 110 };
  it("左端・真上・右端の座標", () => {
    expect(gaugePoint(0, g)).toEqual({ x: 40, y: 144 });
    expect(gaugePoint(0.5, g)).toEqual({ x: 150, y: 34 });
    expect(gaugePoint(1, g)).toEqual({ x: 260, y: 144 });
    expect(gaugePoint(0.5, g, 130)).toEqual({ x: 150, y: 14 });
  });
  it("左端から値までの円弧。0 なら null", () => {
    expect(gaugeArcPath(0, g)).toBeNull();
    expect(gaugeArcPath(1, g)).toBe("M40,144 A110,110 0 0 1 260,144");
    expect(gaugeArcPath(0.5, g)).toBe("M40,144 A110,110 0 0 1 150,34");
  });
});

describe("withoutOutliers", () => {
  it("四分位範囲の 1.5 倍より外れた値を除き、順序は保つ", () => {
    expect(withoutOutliers([55, 58, 95, 60, 57, 62, 43])).toEqual([55, 58, 60, 57, 62]);
  });

  it("4 件未満はそのまま返す", () => {
    expect(withoutOutliers([10, 50, 90])).toEqual([10, 50, 90]);
  });
});

describe("gaugeBasisOf", () => {
  it("正の値だけを新しい順に直近 GAUGE_RECENT_COUNT 件使う", () => {
    const values = [null, 15, 0, 14, ...Array.from({ length: 20 }, (_, i) => 13 + (i % 3))];
    const basis = gaugeBasisOf(values);
    expect(basis).toHaveLength(GAUGE_RECENT_COUNT);
    expect(basis.slice(0, 2)).toEqual([15, 14]);
  });

  it("極端な値を除くので目盛りが広がりすぎない", () => {
    const values = [62.54, 57.88, 60.49, 95, 55, 58, 43, 59];
    expect(gaugeBasisOf(values)).not.toContain(95);
    const scale = gaugeScaleOf([...gaugeBasisOf(values), 62.54, 54.63]);
    expect(scale.max).toBeLessThan(80);
  });
});
