import { describe, expect, it } from "vitest";

import {
  efficiencyNullReason,
  formatDateLabel,
  formatKm,
  formatOdometer,
  formatPriceDiff,
} from "@/lib/format";

describe("efficiencyNullReason", () => {
  it("燃費があれば null", () => {
    expect(efficiencyNullReason({ fuel_efficiency: 15.2, is_full: true, fuel_amount: 30 })).toBeNull();
    // 燃費があれば部分給油でも理由は出さない
    expect(efficiencyNullReason({ fuel_efficiency: 12, is_full: false, fuel_amount: 10 })).toBeNull();
  });

  it("部分給油は次の満タンで計算する旨", () => {
    expect(efficiencyNullReason({ fuel_efficiency: null, is_full: false, fuel_amount: 10 })).toBe(
      "部分給油（次の満タンで計算）"
    );
  });

  it("給油量が無い・0 以下なら給油量不明", () => {
    expect(efficiencyNullReason({ fuel_efficiency: null, is_full: true, fuel_amount: null })).toBe("給油量不明");
    expect(efficiencyNullReason({ fuel_efficiency: null, is_full: true, fuel_amount: 0 })).toBe("給油量不明");
    expect(efficiencyNullReason({ fuel_efficiency: null, is_full: true, fuel_amount: -1 })).toBe("給油量不明");
  });

  it("それ以外は区間不明", () => {
    expect(efficiencyNullReason({ fuel_efficiency: null, is_full: true, fuel_amount: 30 })).toBe("区間不明");
    expect(efficiencyNullReason({ fuel_efficiency: 0, is_full: true, fuel_amount: 30 })).toBe("区間不明");
  });
});

describe("formatOdometer", () => {
  it("桁区切りと小数 1 桁までで km を付ける", () => {
    expect(formatOdometer(12345)).toBe("ODO 12,345 km");
    expect(formatOdometer(12345.67)).toBe("ODO 12,345.7 km");
    expect(formatOdometer(0)).toBe("ODO 0 km");
  });

  it("未入力・非有限は「ODO 未入力」", () => {
    expect(formatOdometer(null)).toBe("ODO 未入力");
    expect(formatOdometer(undefined)).toBe("ODO 未入力");
    expect(formatOdometer(Number.NaN)).toBe("ODO 未入力");
    expect(formatOdometer(Number.POSITIVE_INFINITY)).toBe("ODO 未入力");
  });
});

describe("formatKm", () => {
  it("桁区切りと小数 2 桁までで整形する（単位なし）", () => {
    expect(formatKm(1234)).toBe("1,234");
    expect(formatKm(1234.567)).toBe("1,234.57");
    expect(formatKm(5.5)).toBe("5.5");
    expect(formatKm(0)).toBe("0");
  });
});

describe("formatDateLabel", () => {
  it("YYYY-MM-DD を YYYY/M/D にする（月日のゼロ埋めを外す）", () => {
    expect(formatDateLabel("2026-10-01")).toBe("2026/10/1");
    expect(formatDateLabel("2026-01-09")).toBe("2026/1/9");
  });
});

describe("formatPriceDiff", () => {
  it("符号付きで小数第 1 位まで表示する", () => {
    expect(formatPriceDiff(2.34)).toBe("+2.3");
    expect(formatPriceDiff(-1.5)).toBe("−1.5");
  });

  it("0.1 円未満の差は ±0.0", () => {
    expect(formatPriceDiff(0)).toBe("±0.0");
    expect(formatPriceDiff(0.04)).toBe("±0.0");
    expect(formatPriceDiff(-0.04)).toBe("±0.0");
  });
});

