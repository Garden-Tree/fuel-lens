import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FuelLogPage from "@/app/fuel-log/page";
import FuelLogExcelPage from "@/app/fuel-log-excel/page";
import { FUEL_LOG_ITEMS } from "@/lib/fuelLogPage";
import { IFERROR_HELP_URL } from "@/lib/fuelLogExcelPage";
import { RECORDS_CSV_BASE_HEADERS } from "@/lib/csv";
import { aiAvailabilityCopy } from "@/lib/landingPage";

afterEach(() => {
  vi.unstubAllEnvs();
});

const TOOL_HREFS = ["/calc", "/gas-cost", "/warikan", "/route-gas-cost", "/annual-gas-cost", "/fuel-convert", "/expense", "/fuelio"];

/** 本文と枠の /app へのリンクの data-ga-cta を集める */
function ctaPositions(): string[] {
  return screen
    .getAllByRole("link")
    .map((a) => a.getAttribute("data-ga-cta"))
    .filter((v): v is string => v !== null);
}

describe("/fuel-log", () => {
  it("記録する項目の表・FAQ 3 問・関連ページを出す", () => {
    render(<FuelLogPage />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(FUEL_LOG_ITEMS.length + 1);
    expect(screen.getAllByRole("term")).toHaveLength(3);
    const nav = screen.getByRole("navigation", { name: "関連ページ" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/fuel-log-excel", ...TOOL_HREFS, "/privacy", "/terms"]);
  });

  it("例の燃費を出し、本文から燃費計算とエクセルのページにリンクする", () => {
    render(<FuelLogPage />);
    expect(screen.getByText("14.0")).toBeInTheDocument();
    expect(screen.getByText("12.86")).toBeInTheDocument();
    const underlined = screen.getAllByRole("link").filter((a) => a.className.includes("underline"));
    expect(underlined.find((a) => a.textContent === "燃費計算")).toHaveAttribute("href", "/calc");
    expect(underlined.find((a) => a.textContent === "燃費管理をエクセルで")).toHaveAttribute("href", "/fuel-log-excel");
  });

  it("アプリへの導線の位置を data-ga-cta で区別する", () => {
    render(<FuelLogPage />);
    expect(ctaPositions()).toEqual(["guide_top", "guide_inline", "cta_box"]);
    expect(screen.getByRole("link", { name: /アプリを使う/ })).toHaveAttribute("href", "/app");
  });

  it("お試しの有無で AI の読み取りの案内を切り替える", () => {
    vi.stubEnv("TRIAL_COOKIE_SECRET", "");
    const { unmount } = render(<FuelLogPage />);
    expect(screen.getByText(aiAvailabilityCopy(false).calcNote)).toBeInTheDocument();
    unmount();
    vi.stubEnv("TRIAL_COOKIE_SECRET", "test-secret");
    render(<FuelLogPage />);
    expect(screen.getByText(aiAvailabilityCopy(true).calcNote)).toBeInTheDocument();
  });
});

describe("/fuel-log-excel", () => {
  it("列の表を FuelLens の CSV の列名から出し、IFERROR のヘルプにリンクする", () => {
    render(<FuelLogExcelPage />);
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("rowheader").map((th) => th.textContent);
    expect(headers).toEqual([...RECORDS_CSV_BASE_HEADERS]);
    expect(screen.getByRole("link", { name: "IFERROR" })).toHaveAttribute("href", IFERROR_HELP_URL);
  });

  it("FAQ 3 問・関連ページ・記録のつけ方へのリンク", () => {
    render(<FuelLogExcelPage />);
    expect(screen.getAllByRole("term")).toHaveLength(3);
    const nav = screen.getByRole("navigation", { name: "関連ページ" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/fuel-log", ...TOOL_HREFS, "/privacy", "/terms"]);
    const underlined = screen.getAllByRole("link").filter((a) => a.className.includes("underline"));
    expect(underlined.find((a) => a.textContent === "燃費記録のつけ方")).toHaveAttribute("href", "/fuel-log");
  });

  it("導線の位置を data-ga-cta で区別し、取り込みは設定画面へ", () => {
    render(<FuelLogExcelPage />);
    expect(ctaPositions()).toEqual(["guide_top", "excel_import", "cta_box"]);
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");
  });
});
