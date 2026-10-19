import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ExpensePage from "@/app/expense/page";
import { RECORDS_CSV_HEADERS } from "@/lib/csv";
import { aiAvailabilityCopy } from "@/lib/landingPage";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/expense", () => {
  it("CSV の列名を lib/csv.ts の RECORDS_CSV_HEADERS から表示する", () => {
    render(<ExpensePage />);
    const list = screen.getByRole("list", { name: "全車両 CSV の列" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([...RECORDS_CSV_HEADERS]);
  });

  it("FAQ を 4 問表示し、国税庁へのリンクと関連ページを出す", () => {
    render(<ExpensePage />);
    expect(screen.getAllByRole("term")).toHaveLength(4);
    expect(screen.getByRole("link", { name: "国税庁" })).toHaveAttribute("href", "https://www.nta.go.jp/");
    const nav = screen.getByRole("navigation", { name: "関連ページ" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/calc", "/gas-cost", "/annual-gas-cost", "/fuel-convert", "/privacy", "/terms"]);
    expect(screen.getByRole("link", { name: /アプリを使う/ })).toHaveAttribute("href", "/app");
  });

  it("お試しの有無で AI の読み取りの案内を切り替える", () => {
    vi.stubEnv("TRIAL_COOKIE_SECRET", "");
    const { unmount } = render(<ExpensePage />);
    expect(screen.getByText(aiAvailabilityCopy(false).calcNote)).toBeInTheDocument();
    unmount();

    vi.stubEnv("TRIAL_COOKIE_SECRET", "test-secret");
    render(<ExpensePage />);
    expect(screen.getByText(aiAvailabilityCopy(true).calcNote)).toBeInTheDocument();
  });
});
