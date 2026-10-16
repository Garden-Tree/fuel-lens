"use client";

import { useEffect } from "react";

/**
 * モーダル・シートが開いている間、背面のページ（固定の下部タブバーを含む）がスクロール・ドラッグされないようにする。
 *
 * iOS Safari は `overflow: hidden` だけでは背面のスクロールを止められないため、
 * body を `position: fixed` にして現在のスクロール位置を `top` で保つ方式にする。解除時に元の位置へ戻す。
 * 複数のオーバーレイが同時に開いても早く解除しないよう、参照カウントで管理する。
 */

const LOCKED_PROPS = ["position", "top", "left", "right", "width", "overflow"] as const;

let lockCount = 0;
let savedY = 0;
let savedStyles: Record<(typeof LOCKED_PROPS)[number], string> | null = null;

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
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined" || lockCount === 0) return;
  lockCount -= 1;
  if (lockCount > 0) return;
  const body = document.body;
  for (const prop of LOCKED_PROPS) body.style[prop] = savedStyles?.[prop] ?? "";
  savedStyles = null;
  window.scrollTo(0, savedY);
}

/** `active` の間 body のスクロールをロックする */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
