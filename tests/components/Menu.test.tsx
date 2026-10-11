import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Menu, MenuItem, menuVerticalPlacementOf } from "@/components/ui/Menu";

describe("menuVerticalPlacementOf", () => {
  // 余白は間隔 8px + 端 8px
  it("下に入りきれば下に開く", () => {
    expect(menuVerticalPlacementOf({ triggerTop: 100, triggerBottom: 140, menuHeight: 200, bottomLimit: 800 })).toEqual({
      side: "down",
      maxHeight: null,
    });
  });

  it("下部タブバーに重なるなら上に開く", () => {
    // ビューポート 800px、タブバーの上端 744px。トリガーの下 140px の余白に 200px のメニューは入らない
    expect(menuVerticalPlacementOf({ triggerTop: 560, triggerBottom: 600, menuHeight: 200, bottomLimit: 744 })).toEqual({
      side: "up",
      maxHeight: null,
    });
  });

  it("どちらにも入りきらなければ広い側に開いて高さを抑える", () => {
    expect(menuVerticalPlacementOf({ triggerTop: 300, triggerBottom: 340, menuHeight: 600, bottomLimit: 744 })).toEqual({
      side: "down",
      maxHeight: 744 - 340 - 16,
    });
    expect(menuVerticalPlacementOf({ triggerTop: 500, triggerBottom: 540, menuHeight: 600, bottomLimit: 744 })).toEqual({
      side: "up",
      maxHeight: 500 - 16,
    });
  });
});

function rect(top: number, height: number, left = 16, width = 120): DOMRect {
  return { top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("Menu（上下の向き）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderMenu(triggerTop: number) {
    // タブバー（data-app-tabbar）の上端 744px、メニューの高さ 200px
    const tabBar = document.createElement("nav");
    tabBar.setAttribute("data-app-tabbar", "");
    document.body.appendChild(tabBar);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === tabBar) return rect(744, 56, 0, 400);
      if (this.getAttribute("aria-haspopup") === "menu") return rect(triggerTop, 40);
      return rect(triggerTop + 48, 200);
    });
    render(
      <Menu label="並び順" trigger="給油日">
        <MenuItem checked onSelect={() => {}}>
          給油日
        </MenuItem>
        <MenuItem checked={false} onSelect={() => {}}>
          登録順
        </MenuItem>
      </Menu>
    );
    return { tabBar };
  }

  it("下に余裕があれば下に開く", async () => {
    const { tabBar } = renderMenu(100);
    await userEvent.setup().click(screen.getByRole("button", { name: "給油日" }));
    const menu = screen.getByRole("menu", { name: "並び順" });
    expect(menu).not.toHaveAttribute("data-side");
    expect(menu.className).toContain("z-[45]");
    // 開いたら選択中の項目にフォーカス（キーボード操作は従来どおり）
    expect(screen.getByRole("menuitemradio", { name: "給油日" })).toHaveFocus();
    tabBar.remove();
  });

  it("タブバーの近くでは上に開く", async () => {
    const { tabBar } = renderMenu(600);
    await userEvent.setup().click(screen.getByRole("button", { name: "給油日" }));
    expect(screen.getByRole("menu", { name: "並び順" })).toHaveAttribute("data-side", "up");
    tabBar.remove();
  });
});
