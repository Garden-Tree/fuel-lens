'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBackdropClose } from '@/lib/useBackdropClose';
import { useFocusTrap } from '@/lib/useFocusTrap';

/**
 * アプリ共通の通知（トースト）と確認ダイアログ。
 * `window.alert` / `window.confirm` の置き換え用。
 *
 * 使い方:
 *   const { toast, confirm } = useToast();
 *   toast('保存しました', { type: 'success' });
 *   if (await confirm('削除しますか？', { danger: true })) { ... }
 */

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  type?: ToastType;
  /** 自動で閉じるまでのミリ秒。0 で手動クローズのみ。既定: error/warning 8000, それ以外 4000 */
  durationMs?: number;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 破壊的操作（削除など）の場合は赤いボタンにする */
  danger?: boolean;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  /** 開くたびに増える ID（開いたままの確認を新しい確認で置き換えたことを検知する） */
  id: number;
  message: string;
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// 面はすべて surface。種類は左端の色帯（border-l）と枠線の色で示す（docs/design-system.md）
const TYPE_STYLES: Record<ToastType, string> = {
  info: 'border-border border-l-accent',
  success: 'border-money-dim/60 border-l-money',
  warning: 'border-warn/40 border-l-warn',
  error: 'border-red-500/50 border-l-red-500',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);
  const nextConfirmId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const type = options.type ?? 'info';
      const id = nextId.current++;
      const duration =
        options.durationMs ?? (type === 'error' || type === 'warning' ? 8000 : 4000);
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      const id = nextConfirmId.current++;
      setConfirmState((prev) => {
        // 既に開いているダイアログがあればキャンセル扱いで閉じる
        prev?.resolve(false);
        return { id, message, options, resolve };
      });
    });
  }, []);

  const closeConfirm = useCallback((ok: boolean) => {
    setConfirmState((prev) => {
      prev?.resolve(ok);
      return null;
    });
  }, []);

  // Escape で確認ダイアログをキャンセル
  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmState, closeConfirm]);

  // アンマウント時にタイマーを掃除
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // 背景クリックでキャンセル（パネル内から背景へドラッグして離した場合は閉じない）
  const confirmBackdropHandlers = useBackdropClose(() => closeConfirm(false));

  // 確認ダイアログのフォーカストラップ。開いたら初期フォーカスを置き、閉じたら呼び出し元へ戻す。
  // 破壊的操作ではキャンセル側に初期フォーカスを置く（Enter のキーリピートで危険な操作が承認されるのを防ぐため）
  const confirmPanelRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const okButtonRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(confirmPanelRef, {
    active: confirmState !== null,
    initialFocusRef: confirmState?.options.danger ? cancelButtonRef : okButtonRef,
  });

  // 開いている確認を新しい確認が置き換えたとき（トラップは開いたままなので初期フォーカスが再適用されない）、
  // 新しい確認の初期フォーカス（破壊的操作ならキャンセル側）を置き直す
  const confirmId = confirmState?.id ?? null;
  const confirmDanger = !!confirmState?.options.danger;
  useEffect(() => {
    if (confirmId === null) return;
    (confirmDanger ? cancelButtonRef : okButtonRef).current?.focus();
  }, [confirmId, confirmDanger]);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        トースト。
        スマホ幅（< sm）では画面上部に出す。下部だとボトムシート（スキャン確認シート等）の
        保存/破棄ボタンを最大 8 秒覆ってしまうため。sm 以上は画面下部
        （lg 未満は下部タブバー 56px＋スキャンボタンのはみ出し＋safe-area の上に出す）。
      */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-[100] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-[calc(env(safe-area-inset-bottom)+88px)] lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-l-4 bg-surface px-4 py-3 text-sm text-ink shadow-2xl shadow-black/50 ${TYPE_STYLES[t.type]}`}
          >
            <p className="flex-1 whitespace-pre-line break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="閉じる"
              className="rounded-full -m-2 p-2 sm:m-0 sm:p-0.5 text-sub hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 確認ダイアログ */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4"
          {...confirmBackdropHandlers}
        >
          <div
            ref={confirmPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-hero border border-line bg-surface p-5 shadow-2xl shadow-black/50"
          >
            <h2 id="confirm-dialog-title" className="text-base font-bold text-ink">
              {confirmState.options.title ?? '確認'}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-sub">{confirmState.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {/*
                破壊的操作ではキャンセル側に初期フォーカスを置く。
                フォーム送信の Enter のキーリピートで危険な操作が承認されるのを防ぐため。
              */}
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => closeConfirm(false)}
                className="flex-1 sm:flex-none min-h-11 rounded-xl px-4 text-sm font-medium text-ink bg-surface-2 hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {confirmState.options.cancelLabel ?? 'キャンセル'}
              </button>
              <button
                ref={okButtonRef}
                type="button"
                onClick={() => closeConfirm(true)}
                className={`flex-1 sm:flex-none min-h-11 rounded-xl px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                  confirmState.options.danger
                    ? 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-400'
                    : 'bg-accent text-ground hover:bg-[#5BB2FF] focus-visible:ring-accent'
                }`}
              >
                {confirmState.options.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast は <ToastProvider> の内側でのみ使用できます');
  }
  return ctx;
}
