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
  message: string;
  options: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_STYLES: Record<ToastType, string> = {
  info: 'bg-gray-800 border-gray-700 text-gray-100',
  success: 'bg-emerald-900/90 border-emerald-700 text-emerald-50',
  warning: 'bg-amber-900/90 border-amber-700 text-amber-50',
  error: 'bg-red-900/90 border-red-700 text-red-50',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);
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
      setConfirmState((prev) => {
        // 既に開いているダイアログがあればキャンセル扱いで閉じる
        prev?.resolve(false);
        return { message, options, resolve };
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

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        トースト。
        スマホ幅（< sm）では画面上部に出す。下部だとボトムシート（スキャン確認シート等）の
        保存/破棄ボタンを最大 8 秒覆ってしまうため。sm 以上は従来どおり画面下部。
      */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:top-auto sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${TYPE_STYLES[t.type]}`}
          >
            <p className="flex-1 whitespace-pre-line break-words">{t.message}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="閉じる"
              className="rounded p-0.5 text-current/70 hover:text-current focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* 確認ダイアログ */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4"
          {...confirmBackdropHandlers}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
          >
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-white">
              {confirmState.options.title ?? '確認'}
            </h2>
            <p className="mt-2 whitespace-pre-line text-sm text-gray-300">{confirmState.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              {/*
                破壊的操作ではキャンセル側に初期フォーカスを置く。
                フォーム送信の Enter のキーリピートで危険な操作が承認されるのを防ぐため。
              */}
              <button
                type="button"
                autoFocus={!!confirmState.options.danger}
                onClick={() => closeConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
              >
                {confirmState.options.cancelLabel ?? 'キャンセル'}
              </button>
              <button
                type="button"
                autoFocus={!confirmState.options.danger}
                onClick={() => closeConfirm(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 ${
                  confirmState.options.danger
                    ? 'bg-red-600 hover:bg-red-500 focus-visible:ring-red-400'
                    : 'bg-blue-600 hover:bg-blue-500 focus-visible:ring-blue-400'
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
