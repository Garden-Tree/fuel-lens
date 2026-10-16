"use client";

import { useEffect } from "react";

/**
 * モーダル・シートが開いている間、背面のページ（下部タブバーを含む）がスクロール・ドラッグされないようにする。
 *
 * - 文書のスクロール（PC・公開ページ）: iOS Safari は `overflow: hidden` だけでは背面のスクロールを止められないため、
 *   body を `position: fixed` にして現在のスクロール位置を `top` で保つ方式にする。解除時に元の位置へ戻す。
 * - スマホのアプリ画面: 文書はスクロールせず、AppFrame の本文の器（`[data-app-scroll]`）がスクロールする
 *   （components/AppShell.tsx）。器が実際にスクロールする設定（overflow-y: auto / scroll）のときは `overflow: hidden` にする。
 *   overflow: hidden は scrollTop を保つので、解除後も同じ位置のまま。PC では器は overflow: visible なので触らない。
 * 複数のオーバーレイが同時に開いても早く解除しないよう、参照カウントで管理する。
 */

const LOCKED_PROPS = ["position", "top", "left", "right", "width", "overflow"] as const;

/** AppFrame の本文の器（スマホではこれがスクロールする） */
export const APP_SCROLL_SELECTOR = "[data-app-scroll]";

let lockCount = 0;
let savedY = 0;
let savedStyles: Record<(typeof LOCKED_PROPS)[number], string> | null = null;
let lockedContainer: { el: HTMLElement; overflow: string } | null = null;

function isScrollContainer(el: HTMLElement): boolean {
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount > 1) return;
  const body = document.body;
  savedY = window.scrollY;
  savedStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${savedY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";

  const container = document.querySelector<HTMLElement>(APP_SCROLL_SELECTOR);
  if (container && isScrollContainer(container)) {
    lockedContainer = { el: container, overflow: container.style.overflow };
    container.style.overflow = "hidden";
  }
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined" || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  const body = document.body;
  for (const prop of LOCKED_PROPS) body.style[prop] = savedStyles?.[prop] ?? "";
  savedStyles = null;
  if (lockedContainer) {
    lockedContainer.el.style.overflow = lockedContainer.overflow;
    lockedContainer = null;
  }
  window.scrollTo(0, savedY);
}

/** `active` の間 body（とスマホのアプリ画面では本文の器）のスクロールをロックする */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
