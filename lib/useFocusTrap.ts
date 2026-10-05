"use client";

import { useEffect, type RefObject } from "react";

/**
 * モーダルダイアログ用のフォーカストラップ。
 *
 * - `active` が true になったとき、直前にフォーカスされていた要素を覚え、
 *   `initialFocusRef`（なければコンテナ内の最初のフォーカス可能要素、それも無ければコンテナ自身）へフォーカスする。
 * - active の間、Tab / Shift+Tab をコンテナ内で循環させる（背面のページへフォーカスを漏らさない）。
 * - `active` が false になったとき・アンマウント時に、覚えておいた要素へフォーカスを戻す（`returnFocus`）。
 *
 * ダイアログが重なる場合（車両管理モーダルの上の確認ダイアログなど）は、最後に開いたものだけが Tab を処理する。
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Tab / Shift+Tab 時にフォーカスを強制移動すべき位置を返す（純粋関数）。
 *
 * @param currentIndex 現在フォーカス中の要素の、フォーカス可能要素リスト内の位置（リスト外なら -1）
 * @param count フォーカス可能要素の数
 * @param shift Shift+Tab か
 * @returns 移動先のインデックス。ブラウザの既定動作に任せてよい（コンテナ内の途中）なら null。
 *          要素が 0 個のときも null（呼び出し側でコンテナ自身にフォーカスさせる）。
 */
export function nextTrapIndex(currentIndex: number, count: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (currentIndex < 0) return shift ? count - 1 : 0;
  if (shift && currentIndex === 0) return count - 1;
  if (!shift && currentIndex === count - 1) return 0;
  return null;
}

function isVisible(el: HTMLElement): boolean {
  // offsetParent が null なのは display:none、または position:fixed の要素。fixed は表示されているので除外しない
  if (el.offsetParent !== null) return true;
  return getComputedStyle(el).position === "fixed";
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

interface TrapEntry {
  container: HTMLElement;
}

/** 開いているトラップのスタック。末尾（最後に開いたもの）だけが Tab を処理する */
const trapStack: TrapEntry[] = [];

function focusFirstIn(container: HTMLElement) {
  const items = getFocusable(container);
  (items[0] ?? container).focus();
}

export interface UseFocusTrapOptions {
  /** true の間だけトラップが有効 */
  active: boolean;
  /** 開いたときに最初にフォーカスする要素。省略時はコンテナ内の最初のフォーカス可能要素 */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 閉じたときに、開く前にフォーカスされていた要素へ戻す（既定 true） */
  returnFocus?: boolean;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, initialFocusRef, returnFocus = true }: UseFocusTrapOptions,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // 初期フォーカス
    const initial = initialFocusRef?.current;
    if (initial && container.contains(initial)) {
      initial.focus();
    } else {
      if (!container.hasAttribute("tabindex")) container.tabIndex = -1;
      focusFirstIn(container);
    }

    const entry: TrapEntry = { container };
    trapStack.push(entry);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.defaultPrevented) return;
      if (trapStack[trapStack.length - 1] !== entry) return;

      const items = getFocusable(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const activeEl = document.activeElement;
      const currentIndex = activeEl instanceof HTMLElement ? items.indexOf(activeEl) : -1;
      const target = nextTrapIndex(currentIndex, items.length, e.shiftKey);
      if (target !== null) {
        e.preventDefault();
        items[target].focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = trapStack.indexOf(entry);
      if (i >= 0) trapStack.splice(i, 1);

      if (!returnFocus || !previouslyFocused) return;
      const restore = () => {
        if (!previouslyFocused.isConnected) return false;
        previouslyFocused.focus();
        return document.activeElement === previouslyFocused;
      };
      if (restore()) return;
      // 呼び出し元のボタンが処理中で一時的に disabled だった場合など。描画が落ち着いてから 1 度だけ再試行する
      requestAnimationFrame(() => {
        const cur = document.activeElement;
        if (cur && cur !== document.body) return; // 既に別の場所へフォーカスが移っている
        if (restore()) return;
        // 戻し先が消えた場合（削除した行のボタンなど）は、下に残っているダイアログがあればその中へ戻す
        const below = trapStack[trapStack.length - 1];
        if (below && below.container.isConnected) focusFirstIn(below.container);
      });
    };
    // containerRef / initialFocusRef は ref オブジェクト（安定）なので依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, returnFocus]);
}
