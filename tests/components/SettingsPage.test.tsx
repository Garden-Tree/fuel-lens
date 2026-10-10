import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Vehicle } from "@/lib/types";
import type { VehicleScope } from "@/lib/useVehicleScope";
import { renderWithProviders } from "../setup/render";

const scopeMock = vi.hoisted(() => ({ useVehicleScope: vi.fn() }));
vi.mock("@/lib/useVehicleScope", () => scopeMock);

import SettingsPage from "@/app/settings/page";

const vehicle = { id: "v1", name: "マイカー" } as Vehicle;

function scope(overrides: Partial<VehicleScope> = {}, fetchAllRecords = vi.fn(async () => [{}, {}, {}])) {
  return {
    vehicles: [vehicle],
    loading: false,
    error: null,
    readOnly: false,
    vehicleActions: { addVehicles: vi.fn() },
    recordActions: { fetchAllRecords, addRecords: vi.fn() },
    ...overrides,
  };
}

describe("SettingsPage", () => {
  beforeEach(() => {
    scopeMock.useVehicleScope.mockReset();
  });

  it("一覧を読まない設定でフックを呼び、見出しとホームへのナビゲーションを表示する", () => {
    scopeMock.useVehicleScope.mockReturnValue(scope());
    renderWithProviders(<SettingsPage />);
    expect(scopeMock.useVehicleScope).toHaveBeenCalledWith({ list: false });
    expect(screen.getByRole("heading", { level: 1, name: "設定" })).toBeInTheDocument();
    // 戻るリンクの代わりにタブバー / サイドバーの「ホーム」
    for (const link of screen.getAllByRole("link", { name: "ホーム" })) {
      expect(link).toHaveAttribute("href", "/app");
    }
  });

  it("データ概要の記録数は fetchAllRecords の件数、車両数は vehicles の数になる", async () => {
    const fetchAllRecords = vi.fn(async () => [{}, {}, {}]);
    scopeMock.useVehicleScope.mockReturnValue(scope({}, fetchAllRecords));
    renderWithProviders(<SettingsPage />);
    await waitFor(() => expect(screen.getByText("記録数（全車両）").nextElementSibling).toHaveTextContent("3"));
    expect(fetchAllRecords).toHaveBeenCalled();
    expect(screen.getByText("車両数").nextElementSibling).toHaveTextContent("1");
  });

  it("読み込みエラーと閲覧専用の注記を表示する", () => {
    scopeMock.useVehicleScope.mockReturnValue(scope({ error: "車両を読み込めませんでした。", readOnly: true }));
    renderWithProviders(<SettingsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("車両を読み込めませんでした。");
    expect(screen.getByText("閲覧専用（クラウド接続待ち）")).toBeInTheDocument();
  });
});
