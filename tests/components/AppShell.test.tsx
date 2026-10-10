import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppFrame, HookErrorLine, PageHeader, ReadOnlyCaption } from "@/components/AppShell";
import { APP_NAV_ITEMS, SCAN_BUTTON_LABEL, isNavItemActive } from "@/components/AppNav";
import { SIGNED_OUT_SCAN_NOTE } from "@/components/ScanActionMenu";
import VehicleSelector from "@/components/VehicleSelector";
import type { Vehicle } from "@/lib/types";
import { renderWithProviders } from "../setup/render";

// tests/setup/dom.ts のモックでは usePathname() は "/app"、未ログイン

describe("PageHeader", () => {
  it("見出し（h1）を表示し、戻るリンクは出さない", () => {
    renderWithProviders(<PageHeader title="統計" />);
    expect(screen.getByRole("heading", { level: 1, name: "統計" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ホームに戻る" })).not.toBeInTheDocument();
  });

  it("brand のときはロゴのワードマークを含む", () => {
    renderWithProviders(<PageHeader title="ホーム" brand />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("FuelLens");
  });

  it("rightSlot（車両チップ）の後にスマホ用のログインボタンが続く", () => {
    renderWithProviders(<PageHeader title="給油履歴" rightSlot={<span data-testid="slot">slot</span>} />);
    const header = screen.getByRole("banner");
    const slot = within(header).getByTestId("slot");
    const login = within(header).getByRole("button", { name: "ログイン" });
    expect(slot.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("AppFrame", () => {
  it("本文を main に描画し、ナビゲーションの 4 項目を並べる（今の画面に aria-current）", () => {
    renderWithProviders(
      <AppFrame>
        <p>本文</p>
      </AppFrame>
    );
    expect(within(screen.getByRole("main")).getByText("本文")).toBeInTheDocument();
    // スマホのタブバーと PC のサイドバー（CSS で出し分け）の 2 つ
    const navs = screen.getAllByRole("navigation", { name: "メイン" });
    expect(navs).toHaveLength(2);
    for (const nav of navs) {
      const links = within(nav).getAllByRole("link");
      expect(links.map(a => a.getAttribute("href"))).toEqual(APP_NAV_ITEMS.map(i => i.href));
      expect(within(nav).getByRole("link", { name: "ホーム" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "履歴" })).not.toHaveAttribute("aria-current");
    }
  });

  it("スキャンボタンでメニューを開き、未ログインでは手動入力だけ選べる", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppFrame>
        <p>本文</p>
      </AppFrame>
    );
    await user.click(screen.getByRole("button", { name: SCAN_BUTTON_LABEL }));
    const dialog = screen.getByRole("dialog", { name: "記録する" });
    expect(within(dialog).getByRole("button", { name: /撮影する/ })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /アルバムから選ぶ/ })).toBeDisabled();
    expect(within(dialog).getByRole("link", { name: /手動で入力/ })).toHaveAttribute("href", "/app?action=manual");
    expect(within(dialog).getByText(SIGNED_OUT_SCAN_NOTE)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("PC のサイドバーの「スキャンして記録」からも同じメニューを開く", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AppFrame>
        <p>本文</p>
      </AppFrame>
    );
    await user.click(screen.getByRole("button", { name: "スキャンして記録" }));
    const dialog = screen.getByRole("dialog", { name: "記録する" });
    // ポップオーバーは最初の選べる項目（未ログインでは手動入力）にフォーカスする
    expect(within(dialog).getByRole("link", { name: /手動で入力/ })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("isNavItemActive", () => {
  it("同じパスと配下のパスで true", () => {
    expect(isNavItemActive("/history", "/history")).toBe(true);
    expect(isNavItemActive("/history/123", "/history")).toBe(true);
    expect(isNavItemActive("/app", "/history")).toBe(false);
    expect(isNavItemActive("/apple", "/app")).toBe(false);
    expect(isNavItemActive(null, "/app")).toBe(false);
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

describe("VehicleSelector", () => {
  const vehicles: Vehicle[] = [
    { id: "v1", user_id: "local", name: "マイカー", type: "car", distance_mode: "trip", default_fuel_type: null },
    { id: "v2", user_id: "local", name: "カブ", type: "bike", distance_mode: "odometer", default_fuel_type: null },
  ];
  const noop = async () => {};
  const baseProps = {
    vehicles,
    selectedVehicleId: "v1",
    onAddVehicle: async () => vehicles[0],
    onDeleteVehicle: noop,
    onUpdateVehicle: noop,
  };

  it("読み込み中はチップの代わりにスケルトンを表示する", () => {
    const { rerender } = renderWithProviders(<VehicleSelector {...baseProps} onSelect={() => {}} loading />);
    expect(screen.queryByRole("button", { name: /マイカー/ })).not.toBeInTheDocument();
    rerender(<VehicleSelector {...baseProps} onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "車両: マイカー" })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("チップでメニューを開き、選択中の車両にチェックが付き、選ぶと onSelect して閉じる", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithProviders(<VehicleSelector {...baseProps} onSelect={onSelect} />);
    const chip = screen.getByRole("button", { name: "車両: マイカー" });
    await user.click(chip);
    const menu = screen.getByRole("menu", { name: "車両の切り替え" });
    const current = within(menu).getByRole("menuitemradio", { name: "マイカー" });
    expect(current).toHaveAttribute("aria-checked", "true");
    expect(current).toHaveFocus();
    expect(within(menu).getByRole("menuitemradio", { name: "カブ" })).toHaveAttribute("aria-checked", "false");

    await user.keyboard("{ArrowDown}");
    expect(within(menu).getByRole("menuitemradio", { name: "カブ" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("v2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(chip).toHaveFocus();
  });

  it("Escape でメニューを閉じる", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VehicleSelector {...baseProps} onSelect={() => {}} />);
    await user.click(screen.getByRole("button", { name: "車両: マイカー" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("「車両を管理」で車両の管理モーダルを開く", async () => {
    const user = userEvent.setup();
    renderWithProviders(<VehicleSelector {...baseProps} onSelect={() => {}} />);
    await user.click(screen.getByRole("button", { name: "車両: マイカー" }));
    await user.click(screen.getByRole("menuitem", { name: "車両を管理" }));
    expect(screen.getByRole("dialog", { name: /車両の管理/ })).toBeInTheDocument();
  });
});
