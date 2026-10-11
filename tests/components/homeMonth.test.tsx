import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useCurrentMonthKey } from "@/lib/home/useCurrentMonthKey";
import MonthSummarySection from "@/app/app/_components/MonthSummarySection";
import type { FuelRecord } from "@/lib/types";

function Probe() {
  return <p data-testid="month">{useCurrentMonthKey()}</p>;
}

const RECORD: FuelRecord = {
  id: "r1",
  date: "2026-10-20",
  total_distance: 400,
  fuel_amount: 30,
  total_cost: 4800,
  price_per_unit: 160,
  fuel_efficiency: 13.33,
  gas_station: null,
};

describe("useCurrentMonthKey / 今月（開いたまま月をまたぐ）", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 31, 23, 50));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("画面に戻ってきた（visibilitychange / focus）ときに新しい月へ切り替わる", () => {
    render(<Probe />);
    expect(screen.getByTestId("month")).toHaveTextContent("2026-10");

    vi.setSystemTime(new Date(2026, 10, 1, 7, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByTestId("month")).toHaveTextContent("2026-11");

    vi.setSystemTime(new Date(2026, 11, 1, 7, 0));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("month")).toHaveTextContent("2026-12");
  });

  it("MonthSummarySection の見出しと集計も新しい月になる", () => {
    render(<MonthSummarySection records={[RECORD]} />);
    expect(screen.getByRole("heading", { name: "10月" })).toBeInTheDocument();
    expect(screen.getByText("¥4,800")).toBeInTheDocument();

    vi.setSystemTime(new Date(2026, 10, 1, 7, 0));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByRole("heading", { name: "11月" })).toBeInTheDocument();
    expect(screen.getByText("この月の給油記録はまだありません")).toBeInTheDocument();
  });
});
