import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import PeriodFilter from "@/app/stats/_components/PeriodFilter";
import { CostSummary, EfficiencyHero, efficiencyRange } from "@/app/stats/_components/SummaryCards";
import { buildStatsModel, type StatsSummary } from "@/lib/stats";
import type { FuelRecord } from "@/lib/types";

const summary: StatsSummary = {
  count: 13,
  avgEfficiency: 12.97,
  meanEfficiency: 13.2,
  totalCost: 77083,
  avgPricePerUnit: 169.3,
  costPerKm: 13.1,
  totalDistance: 5000,
  totalFuel: 400,
};

describe("EfficiencyHero", () => {
  it("平均燃費と、系列の最高・最低を表示し、子要素（グラフ）を内側に置く", () => {
    render(
      <EfficiencyHero summary={summary} records={[{ fuel_efficiency: 11.2 }, { fuel_efficiency: 16.06 }, { fuel_efficiency: 12.5 }]}>
        <div data-testid="chart" />
      </EfficiencyHero>
    );
    expect(screen.getByRole("heading", { name: "平均燃費" })).toBeInTheDocument();
    expect(screen.getByText("12.97")).toBeInTheDocument();
    expect(screen.getByText("16.06")).toBeInTheDocument();
    expect(screen.getByText("11.20")).toBeInTheDocument();
    expect(screen.getByText("単純平均").parentElement).toHaveTextContent("13.20");
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });

  it("燃費の系列が空なら最高・最低を出さず、平均が無ければ -- を出す", () => {
    render(<EfficiencyHero summary={{ ...summary, avgEfficiency: null, meanEfficiency: null }} records={[]} />);
    expect(screen.getByText("--")).toBeInTheDocument();
    expect(screen.queryByText(/最高/)).not.toBeInTheDocument();
    expect(screen.queryByText(/単純平均/)).not.toBeInTheDocument();
  });
});

describe("efficiencyRange", () => {
  it("日付が不正な記録も含め、正の燃費だけから最高・最低を求める（平均と同じ母集団）", () => {
    const model = buildStatsModel(
      [
        { id: "a", date: "2026-09-01", fuel_efficiency: 12 },
        { id: "b", date: "2026-09-10", fuel_efficiency: 15 },
        { id: "c", date: "2026-02-30", fuel_efficiency: 25 },
        { id: "d", date: "2026-09-12", fuel_efficiency: null },
        { id: "e", date: "2026-09-13", fuel_efficiency: 0 },
      ] as unknown as FuelRecord[],
      "all",
      new Date(2026, 9, 1)
    );
    // グラフの系列は日付不正の c を落とすが、最高・最低は平均（meanEfficiency）と同じく c を含める
    expect(model.efficiency.series.map(p => p.efficiency)).not.toContain(25);
    expect(model.summary.meanEfficiency).toBeCloseTo((12 + 15 + 25) / 3, 10);
    expect(efficiencyRange(model.filteredRecords)).toEqual({ max: 25, min: 12 });
  });

  it("正の燃費が無ければ null", () => {
    expect(efficiencyRange([{ fuel_efficiency: null }, { fuel_efficiency: 0 }])).toBeNull();
    expect(efficiencyRange([])).toBeNull();
  });
});

describe("CostSummary", () => {
  it("費用の 4 行を表示する", () => {
    render(<CostSummary summary={summary} />);
    expect(screen.getByRole("heading", { name: "費用" })).toBeInTheDocument();
    expect(screen.getByText("給油代の合計").nextElementSibling).toHaveTextContent("¥77,083");
    expect(screen.getByText("1kmあたり").nextElementSibling).toHaveTextContent("¥13.1");
    expect(screen.getByText("平均単価").nextElementSibling).toHaveTextContent("/L");
    expect(screen.getByText("給油回数").nextElementSibling).toHaveTextContent("13 回");
  });

  it("対象の記録が無ければ何も描画しない", () => {
    const { container } = render(<CostSummary summary={{ ...summary, count: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PeriodFilter", () => {
  it("3ヶ月 / 6ヶ月 / 1年 / 全期間 の順で並び、選択中は aria-pressed になる", () => {
    const onChange = vi.fn();
    render(<PeriodFilter period="1y" onChange={onChange} unknownDateCount={0} />);
    const group = screen.getByRole("group", { name: "期間" });
    expect(Array.from(group.querySelectorAll("button")).map(b => b.textContent)).toEqual(["3ヶ月", "6ヶ月", "1年", "全期間"]);
    expect(screen.getByRole("button", { name: "1年" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "6ヶ月" }));
    expect(onChange).toHaveBeenCalledWith("6m");
  });

  it("日付不明の記録があれば注記を出す", () => {
    render(<PeriodFilter period="all" onChange={() => {}} unknownDateCount={2} />);
    expect(screen.getByText(/日付不明 2件/)).toBeInTheDocument();
  });
});
