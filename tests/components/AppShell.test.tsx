import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { Fuel, TrendingUp } from "lucide-react";
import { HOME_HEADER_LINKS, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import VehicleSelector from "@/components/VehicleSelector";
import type { Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

describe("PageHeader", () => {
  it("見出しと戻るリンク（aria-label）を表示する", () => {
    renderWithProviders(<PageHeader title="統計・推移" icon={TrendingUp} backHref="/app" />);
    expect(screen.getByRole("heading", { level: 1, name: "統計・推移" })).toBeInTheDocument();
    const back = screen.getByRole("link", { name: "ホームに戻る" });
    expect(back).toHaveAttribute("href", "/app");
  });

  it("戻るリンクの aria-label を変えられる", () => {
    renderWithProviders(<PageHeader title="給油履歴" backHref="/app" backLabel="戻る" />);
    expect(screen.getByRole("link", { name: "戻る" })).toHaveAttribute("href", "/app");
  });

  it("backHref が無ければ戻るリンクを出さず、ロゴ付きの見出しとナビゲーションリンクを表示する", () => {
    renderWithProviders(<PageHeader title="FuelLens" icon={Fuel} links={HOME_HEADER_LINKS} />);
    expect(screen.getByRole("heading", { level: 1, name: "FuelLens" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ホームに戻る" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "グラフ" })).toHaveAttribute("href", "/stats");
    expect(screen.getByRole("link", { name: "給油履歴" })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings");
  });

  it("リンクは links の順に並び、その後に rightSlot とログインボタンが続く", () => {
    renderWithProviders(
      <PageHeader title="FuelLens" links={HOME_HEADER_LINKS} rightSlot={<span data-testid="slot">slot</span>} />
    );
    const header = screen.getByRole("banner");
    const links = within(header).getAllByRole("link").map(a => a.getAttribute("aria-label"));
    expect(links).toEqual(["グラフ", "給油履歴", "設定"]);
    const slot = screen.getByTestId("slot");
    const login = screen.getByRole("button", { name: "ログイン" });
    expect(slot.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("HookErrorLine", () => {
  it("エラーがあれば role=alert で表示する", () => {
    renderWithProviders(<HookErrorLine error="クラウドからの読み込みに失敗しました" />);
    expect(screen.getByRole("alert")).toHaveTextContent("クラウドからの読み込みに失敗しました");
  });

  it("エラーが無ければ何も表示しない", () => {
    renderWithProviders(<HookErrorLine error={null} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ReadOnlyCaption", () => {
  it("show のときだけ「閲覧専用（クラウド接続待ち）」を表示する", () => {
    const { rerender } = renderWithProviders(<ReadOnlyCaption show />);
    expect(screen.getByRole("status")).toHaveTextContent("閲覧専用（クラウド接続待ち）");
    rerender(<ReadOnlyCaption show={false} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("VehicleSelector loading", () => {
  const vehicles: Vehicle[] = [
    { id: "v1", user_id: "local", name: "マイカー", type: "car", distance_mode: "trip", default_fuel_type: null },
  ];
  const noop = async () => {};
  const props = {
    vehicles,
    selectedVehicleId: "v1",
    onSelect: () => {},
    onAddVehicle: async () => vehicles[0],
    onDeleteVehicle: noop,
    onUpdateVehicle: noop,
  };

  it("読み込み中はタブの代わりにスケルトンを表示する", () => {
    const { rerender } = renderWithProviders(<VehicleSelector {...props} loading />);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    rerender(<VehicleSelector {...props} />);
    expect(screen.getByRole("tab", { name: "マイカー" })).toBeInTheDocument();
  });
});
