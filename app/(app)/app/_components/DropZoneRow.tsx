import { ImagePlus } from "lucide-react";

/**
 * PC の右カラムに置く細いドロップ先の案内（ドロップ・貼り付けはページ全体で受け付ける。useImageDropPaste）。
 * 押すとファイル選択（アルバム）を開く。ドラッグ中はアクセント色で強調する。スマホでは出さない。
 */
export default function DropZoneRow({
  isDragging,
  onClick,
  disabled,
  signedOut,
}: {
  isDragging: boolean;
  onClick: () => void;
  disabled: boolean;
  /** 未ログイン（AI スキャンは使えない旨を出して押せなくする） */
  signedOut: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || signedOut}
      className={`hidden min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 lg:flex ${
        isDragging ? "border-accent bg-accent-strong/30 text-accent" : "border-border text-sub hover:bg-surface hover:text-ink"
      }`}
    >
      <ImagePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
      {isDragging
        ? "ここに画像をドロップして解析"
        : signedOut
          ? "画像のドロップ・貼り付けによる読み取りはログイン後に使えます"
          : "ここに画像をドロップ、または Ctrl+V で貼り付け"}
    </button>
  );
}
