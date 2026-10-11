"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Chip } from "./Controls";

/**
 * チップから開くドロップダウンメニュー（車両の切り替え、履歴の年・並び順など）。
 * - トリガーは Chip（▾ 付き）。`aria-haspopup="menu"` / `aria-expanded`。
 * - 開くと選択中（`checked`）の項目、無ければ先頭の項目にフォーカスする。↑↓ / Home / End で移動、Escape で閉じてトリガーへ戻す。
 * - メニューの外を押す・Tab でフォーカスが外れると閉じる。
 * - 項目を選ぶと閉じる（`MenuItem` の onSelect の後）。
 * - 画面の端からはみ出すときは、左右 16px の余白に収まるように横にずらす（狭い画面でヘッダーの中ほどにあるチップなど）。
 * - 下に入りきらないとき（スマホの下部タブバー＋safe-area に重なるときを含む）は上に開く。どちらにも入りきらなければ
 *   広い側に開き、高さを抑えてスクロールさせる（menuVerticalPlacementOf）。重なり順はタブバー（z-40）より上、モーダル（z-50）より下。
 *
 * 使い方:
 *   <Menu label="車両の切り替え" trigger="マイカー" align="end">
 *     <MenuItem checked onSelect={() => select("v1")}>マイカー</MenuItem>
 *     <MenuItem onSelect={openManage} separated>車両を管理</MenuItem>
 *   </Menu>
 */
export type MenuProps = {
  /** メニューの読み上げ名 */
  label: string;
  /** トリガー（チップ）の中身 */
  trigger: ReactNode;
  /** トリガーの読み上げ名（中身だけでは足りないとき） */
  triggerAriaLabel?: string;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  /** メニューをトリガーの左端（start）/ 右端（end）に揃える。既定 start */
  align?: "start" | "end";
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

const ITEM_SELECTOR = '[role^="menuitem"]:not(:disabled)';

/** トリガーとメニューの間隔（mt-2 / mb-2）と、画面の上下に残す余白（px） */
const MENU_GAP = 8;
const MENU_EDGE_MARGIN = 8;

export type MenuVerticalPlacement = {
  /** down: トリガーの下に開く / up: 上に開く */
  side: "down" | "up";
  /** 入りきらないときの最大の高さ（px）。入りきるなら null */
  maxHeight: number | null;
};

/**
 * メニューを上下どちらに開くか（純粋関数）。下に入りきれば下、入りきらず上に入りきれば上、
 * どちらにも入りきらなければ広い側に開いて高さを抑える。
 * @param bottomLimit 画面の下端のうちメニューを置ける限界の y（下部タブバーがあればその上端。無ければビューポートの高さ）
 */
export function menuVerticalPlacementOf({
  triggerTop,
  triggerBottom,
  menuHeight,
  bottomLimit,
}: {
  triggerTop: number;
  triggerBottom: number;
  menuHeight: number;
  bottomLimit: number;
}): MenuVerticalPlacement {
  const below = bottomLimit - triggerBottom - MENU_GAP - MENU_EDGE_MARGIN;
  const above = triggerTop - MENU_GAP - MENU_EDGE_MARGIN;
  if (menuHeight <= below) return { side: "down", maxHeight: null };
  if (menuHeight <= above) return { side: "up", maxHeight: null };
  return below >= above ? { side: "down", maxHeight: Math.max(below, 0) } : { side: "up", maxHeight: Math.max(above, 0) };
}

/** メニューを置ける下端の y。スマホの下部タブバー（data-app-tabbar。safe-area を含む）が見えていればその上端 */
function menuBottomLimit(): number {
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  const tabBar = document.querySelector<HTMLElement>("[data-app-tabbar]");
  if (!tabBar || getComputedStyle(tabBar).display === "none") return viewport;
  const top = tabBar.getBoundingClientRect().top;
  return top > 0 ? Math.min(viewport, top) : viewport;
}

function menuItemsOf(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
}

export function Menu({
  label,
  trigger,
  triggerAriaLabel,
  triggerIcon,
  triggerClassName = "",
  align = "start",
  disabled = false,
  className = "",
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // 無効になったら閉じる（レンダー中に state を調整する React 推奨パターン）
  if (disabled && open) setOpen(false);

  // 描画前に位置を整える: 下に入りきらなければ上に開き（タブバーと重ねない）、左右にはみ出すなら横にずらす（16px の余白）
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const triggerEl = triggerRef.current;
    if (!open || !menu) return;
    menu.style.translate = "";
    menu.style.maxHeight = "";
    delete menu.dataset.side;
    if (triggerEl) {
      const t = triggerEl.getBoundingClientRect();
      const placement = menuVerticalPlacementOf({
        triggerTop: t.top,
        triggerBottom: t.bottom,
        menuHeight: menu.scrollHeight,
        bottomLimit: menuBottomLimit(),
      });
      if (placement.side === "up") menu.dataset.side = "up";
      if (placement.maxHeight !== null) menu.style.maxHeight = `${placement.maxHeight}px`;
    }
    const rect = menu.getBoundingClientRect();
    const margin = 16;
    const viewport = document.documentElement.clientWidth;
    let shift = 0;
    if (rect.right > viewport - margin) shift = viewport - margin - rect.right;
    if (rect.left + shift < margin) shift = margin - rect.left;
    if (shift !== 0) menu.style.translate = `${shift}px 0`;
  }, [open]);

  // 開いたら選択中の項目（無ければ先頭）へフォーカス
  useEffect(() => {
    if (!open) return;
    const list = menuItemsOf(menuRef.current);
    const checked = list.find(el => el.getAttribute("aria-checked") === "true");
    (checked ?? list[0])?.focus();
  }, [open]);

  // 外側のクリック・タップで閉じる
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = menuItemsOf(menuRef.current);
    if (list.length === 0) return;
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(index + 1) % list.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <Chip
        ref={triggerRef}
        showChevron
        icon={triggerIcon}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerAriaLabel}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </Chip>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          onClick={e => {
            // 項目を押したら閉じる（onSelect の後）
            if ((e.target as HTMLElement).closest(ITEM_SELECTOR)) close(true);
          }}
          className={`absolute top-full z-[45] mt-2 w-max min-w-[208px] max-w-[min(320px,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface py-1 shadow-2xl shadow-black/50 data-[side=up]:top-auto data-[side=up]:bottom-full data-[side=up]:mt-0 data-[side=up]:mb-2 ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export type MenuItemProps = {
  onSelect: () => void;
  /** 単一選択の項目（menuitemradio）にする。true のとき右端にチェックを出す */
  checked?: boolean;
  icon?: ReactNode;
  /** 上に区切り線を引く（「車両を管理」など、選択肢と性質の違う項目） */
  separated?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

/** Menu の項目（高さ 44px）。`checked` を渡すと menuitemradio になる */
export function MenuItem({ onSelect, checked, icon, separated = false, disabled = false, children }: MenuItemProps) {
  const isRadio = checked !== undefined;
  return (
    <button
      type="button"
      role={isRadio ? "menuitemradio" : "menuitem"}
      aria-checked={isRadio ? checked : undefined}
      disabled={disabled}
      tabIndex={-1}
      onClick={onSelect}
      className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[15px] text-ink transition-colors hover:bg-surface-2/60 focus:bg-surface-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
        separated ? "mt-1 border-t border-line pt-1" : ""
      }`}
    >
      {icon && <span className="flex shrink-0 items-center text-sub">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {isRadio && (
        <Check className={`h-4 w-4 shrink-0 text-accent ${checked ? "" : "invisible"}`} aria-hidden="true" />
      )}
    </button>
  );
}
