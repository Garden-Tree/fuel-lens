import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FuelioPage from "@/app/fuelio/page";
import { FUELIO_COLUMN_MAPPINGS, FUELIO_HELP_URL } from "@/lib/fuelioPage";
import { aiAvailabilityCopy } from "@/lib/landingPage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/fuelio", () => {
  it("列の対応表を lib/fuelioPage.ts から表示する", () => {
    render(<FuelioPage />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(FUELIO_COLUMN_MAPPINGS.length + 1);
    expect(within(table).getByRole("rowheader", { name: "Odo" })).toBeInTheDocument();
  });

  it("FAQ を 2 問表示し、Fuelio 公式ヘルプへの下線つきリンクと関連ページを出す", () => {
    render(<FuelioPage />);
    expect(screen.getAllByRole("term")).toHaveLength(2);
    const help = screen.getByRole("link", { name: "Fuelio の公式ヘルプ" });
    expect(help).toHaveAttribute("href", FUELIO_HELP_URL);
    expect(help.className).toContain("underline");
    const nav = screen.getByRole("navigation", { name: "関連ページ" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/calc", "/gas-cost", "/warikan", "/annual-gas-cost", "/fuel-convert", "/expense", "/privacy", "/terms"]);
  });

  it("アプリと設定への導線、無関係である旨の注記を出す", () => {
    render(<FuelioPage />);
    expect(screen.getByRole("link", { name: /アプリを使う/ })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "設定の「インポート」を開く" })).toHaveAttribute("href", "/settings");
    expect(screen.getByText(/Fuelio とは関係のない/)).toBeInTheDocument();
  });

  it("お試しの有無で AI の読み取りの案内を切り替える", () => {
    vi.stubEnv("TRIAL_COOKIE_SECRET", "");
    const { unmount } = render(<FuelioPage />);
    expect(screen.getByText(aiAvailabilityCopy(false).calcNote)).toBeInTheDocument();
    unmount();

    vi.stubEnv("TRIAL_COOKIE_SECRET", "test-secret");
    render(<FuelioPage />);
    expect(screen.getByText(aiAvailabilityCopy(true).calcNote)).toBeInTheDocument();
  });
});
