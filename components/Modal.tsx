"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { X } from "lucide-react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { useFocusTrap } from "@/lib/useFocusTrap";

/**
 * アプリ共通のモーダルダイアログ。
 * フォーカストラップ（useFocusTrap）・背景クリック（useBackdropClose）・Escape・本文スクロールのロックを 1 か所にまとめる。
 *
 * - `disableClose` が true の間（保存中など）は、Escape・背景クリック・ヘッダーの × を無視する。
 * - Escape だけ別の挙動にしたいときは `onEscape` を渡す（省略時は `onClose`）。
 *   例: 車両の管理は、行の編集中の Escape で編集だけを取り消す。
 * - `Modal.Header` は見出し（`title`）と × ボタンを描画する。× は初期フォーカスの既定の置き場所。
 *
 * 使い方:
 *   <Modal open={open} onClose={close} title="見出し" disableClose={saving}>
 *     <Modal.Header icon={<Icon />} />
 *     <Modal.Body>...</Modal.Body>
 *     <Modal.Footer>...</Modal.Footer>
 *   </Modal>
 */

interface ModalContextValue {
  titleId: string;
  title: ReactNode;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  disableClose: boolean;
  requestClose: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

function useModalContext(part: string): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error(`${part} は <Modal> の内側でのみ使用できます`);
  return ctx;
}

const DEFAULT_BACKDROP_CLASS =
  "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200";
const DEFAULT_PANEL_CLASS = "relative w-full max-w-md bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl";

export interface ModalProps {
  open: boolean;
  /** × ボタン・背景クリック・Escape（`onEscape` 未指定時）で呼ばれる */
  onClose: () => void;
  /** 見出し。`Modal.Header` が描画し、aria-labelledby の参照先になる */
  title: ReactNode;
  /** 見出し要素の id を固定したいとき（省略時は自動生成） */
  labelledBy?: string;
  /** 開いたときに最初にフォーカスする要素。省略時は `Modal.Header` の × ボタン（無ければ最初のフォーカス可能要素） */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** 背景クリックで閉じる（既定 true） */
  closeOnBackdrop?: boolean;
  /** Escape で閉じる（既定 true） */
  closeOnEscape?: boolean;
  /** Escape 専用のハンドラ。省略時は `onClose` */
  onEscape?: () => void;
  /** true の間は Escape・背景クリック・× を無視する（保存中など） */
  disableClose?: boolean;
  /** 開いている間 document.body のスクロールを止める（既定 false） */
  lockBodyScroll?: boolean;
  /** 背景（オーバーレイ）の className。既定は中央寄せの暗い背景 */
  backdropClassName?: string;
  /** パネルの className。既定は最大幅 md の角丸パネル */
  panelClassName?: string;
  children: ReactNode;
}

function ModalRoot({
  open,
  onClose,
  title,
  labelledBy,
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  onEscape,
  disableClose = false,
  lockBodyScroll = false,
  backdropClassName = DEFAULT_BACKDROP_CLASS,
  panelClassName = DEFAULT_PANEL_CLASS,
  children,
}: ModalProps) {
  const generatedId = useId();
  const titleId = labelledBy ?? `modal-title-${generatedId}`;
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Escape（処理中は無視）
  useEffect(() => {
    if (!open || !closeOnEscape || disableClose) return;
    const handleEscape = onEscape ?? onClose;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, disableClose, onEscape, onClose]);

  // 開いたら初期フォーカスを置き、モーダル内でフォーカスを循環させる。閉じたら開いた要素へ戻す
  useFocusTrap(panelRef, { active: open, initialFocusRef: initialFocusRef ?? closeButtonRef });

  // 本文スクロールのロック
  useEffect(() => {
    if (!open || !lockBodyScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, lockBodyScroll]);

  // 背景クリックで閉じる（パネル内から背景へドラッグして離した場合は閉じない）
  const backdropHandlers = useBackdropClose(onClose, closeOnBackdrop && !disableClose);

  if (!open) return null;

  return (
    <ModalContext.Provider value={{ titleId, title, closeButtonRef, disableClose, requestClose: onClose }}>
      <div className={backdropClassName} {...backdropHandlers}>
        <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={panelClassName}>
          {children}
        </div>
      </div>
    </ModalContext.Provider>
  );
}

/** 見出しと × ボタン。見出しの前に `icon` を置ける */
function ModalHeader({ icon, className = "mb-6" }: { icon?: ReactNode; className?: string }) {
  const { titleId, title, closeButtonRef, disableClose, requestClose } = useModalContext("Modal.Header");
  return (
    <div className={`flex items-center justify-between flex-shrink-0 ${className}`}>
      <h3 id={titleId} className="text-lg font-bold text-white flex items-center gap-2">
        {icon} {title}
      </h3>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={requestClose}
        disabled={disableClose}
        aria-label="閉じる"
        className="p-2.5 -m-1 sm:m-0 sm:p-1.5 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
      >
        <X className="w-5 h-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** スクロールする本文領域 */
function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto ${className}`}>{children}</div>;
}

/** 下部に固定する領域（ボタン行・フォームなど） */
function ModalFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex-shrink-0 ${className}`}>{children}</div>;
}

const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
});

export default Modal;
