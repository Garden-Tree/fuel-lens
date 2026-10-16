"use client";

import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from "react";

type ToastFn = (message: string, options?: { type?: "info" | "success" | "warning" | "error" }) => void;

export type DropZoneProps = {
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnter: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
};

export type UseImageDropPasteOptions = {
  /** 画像ファイルを受け取ったとき（ドロップ・ペースト） */
  onImage: (file: File) => void | Promise<void>;
  /**
   * ちょうど 2 枚の画像がドロップされたとき（レシートとメーターを別々に撮った写真）。
   * ドロップされた順（1 枚目をレシート候補）で呼ぶ。省略時は従来どおり 1 枚目だけを onImage に渡す
   */
  onImagePair?: (first: File, second: File) => void;
  /** スキャン中か（同期的に判定する。true の間は受け取った画像を無視する） */
  isBusy: () => boolean;
  /** useToast().toast。lib から components へ依存しないよう、呼び出し側から渡す */
  toast: ToastFn;
};

/**
 * 画像のドラッグ＆ドロップ（ドロップ先の要素に dropZoneProps を付ける。ちょうど 2 枚の画像なら onImagePair）と、
 * クリップボードからのペースト（window 全体。入力欄にフォーカスがあるときは無視）を受け付ける。
 * 画像以外は警告の toast を出す。スキャン中の再入は黙って無視する。
 */
export function useImageDropPaste({ onImage, onImagePair, isBusy, toast }: UseImageDropPasteOptions): {
  isDragging: boolean;
  dropZoneProps: DropZoneProps;
} {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // paste リスナーは一度しか登録しないため、最新の onImage / isBusy / toast を Effect Event で参照する
  const handlePaste = useEffectEvent((e: ClipboardEvent) => {
    // 入力フォーム等にフォーカスがある場合は無視する
    if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
      return;
    }
    const file = e.clipboardData?.files?.[0];
    if (!file) return;
    // スキャン中の再入は無視する
    if (isBusy()) return;
    if (!file.type.startsWith("image/")) {
      toast("画像ファイルのみペースト可能です。", { type: "warning" });
      return;
    }
    e.preventDefault();
    void onImage(file);
  });

  useEffect(() => {
    const listener = (e: ClipboardEvent) => handlePaste(e);
    window.addEventListener("paste", listener);
    return () => window.removeEventListener("paste", listener);
  }, []);

  const dropZoneProps: DropZoneProps = {
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current++;
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragging(false);
      }
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      const file = files?.[0];
      if (!file) return;
      // スキャン中の再入は無視する
      if (isBusy()) return;
      // ちょうど 2 枚の画像: レシートとメーターを別々に撮った写真として扱う（役割はシートで確認・入れ替えできる）
      if (onImagePair && files.length === 2 && files[0].type.startsWith("image/") && files[1].type.startsWith("image/")) {
        onImagePair(files[0], files[1]);
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast("画像ファイルのみアップロード可能です。", { type: "warning" });
        return;
      }
      void onImage(file);
    },
  };

  return { isDragging, dropZoneProps };
}
