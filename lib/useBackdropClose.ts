"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/**
 * モーダルの背景（backdrop）クリックで閉じるためのハンドラを返す。
 *
 * パネル内で押下 → 背景上で離す（入力欄のテキスト選択のドラッグなど）と、ブラウザは
 * 共通祖先である背景に `click` を発火するため、単純な `onClick` だと誤って閉じてしまう。
 * ここでは「pointerdown も click も背景要素そのものだった」場合のみ閉じる。
 *
 * 使い方: `<div className="fixed inset-0 ..." {...useBackdropClose(onClose, !busy)}>`
 *
 * @param onClose 閉じる処理
 * @param enabled false の間は背景クリックを無視する（保存中など）
 */
export function useBackdropClose(onClose: () => void, enabled = true) {
  const pressedOnBackdrop = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    pressedOnBackdrop.current = e.target === e.currentTarget;
  };

  const onClick = (e: MouseEvent<HTMLElement>) => {
    const startedOnBackdrop = pressedOnBackdrop.current;
    pressedOnBackdrop.current = false;
    if (!enabled || !startedOnBackdrop || e.target !== e.currentTarget) return;
    onClose();
  };

  return { onPointerDown, onClick };
}
