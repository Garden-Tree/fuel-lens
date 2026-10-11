"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * スキャンメニュー（components/ScanActionMenu.tsx）から /app の処理を直接呼ぶための登録口。
 *
 * ファイル選択（`<input type="file">` の click）はユーザーのタップの中で呼ばないとブラウザに黙って無視されるため、
 * /app を表示中はメニューの項目のクリックハンドラから、ホームが登録した openCamera / openAlbum を同期的に呼ぶ。
 * 登録が無い画面（/history など）では、メニューは従来どおり `/app?action=…` へ遷移する。
 *
 * - `ScanActionsProvider`: AppFrame が描画する
 * - `useRegisterScanActions(handlers)` / `<RegisterScanActions {...handlers} />`: ホームがマウント中だけ登録する（アンマウントで解除）
 * - `useScanActions()`: ScanActionMenu が読む（未登録なら null）
 */

export type ScanActionHandlers = {
  /** カメラを開く（タップの中で同期的に呼ぶこと） */
  openCamera: () => void;
  /** ファイル選択（アルバム）を開く（タップの中で同期的に呼ぶこと） */
  openAlbum: () => void;
  /** 手動入力を開く（入力中のフォームがあれば破棄の確認をする） */
  openManual: () => void;
  /** 撮影・アルバムを始められるか（解析中・確認中・読み込み中は false） */
  canScan: boolean;
  /** 手動入力を始められるか（解析中・確認中・閲覧専用・読み込み中は false） */
  canManual: boolean;
  /** 押せない項目があるときの短い説明（日本語）。無ければ null */
  disabledReason: string | null;
};

type ScanActionsContextValue = {
  handlers: ScanActionHandlers | null;
  setHandlers: (handlers: ScanActionHandlers | null) => void;
};

const ScanActionsContext = createContext<ScanActionsContextValue | null>(null);

export function ScanActionsProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<ScanActionHandlers | null>(null);
  const value = useMemo(() => ({ handlers, setHandlers }), [handlers]);
  return <ScanActionsContext.Provider value={value}>{children}</ScanActionsContext.Provider>;
}

/** 登録されている処理（/app 以外・Provider の外では null） */
export function useScanActions(): ScanActionHandlers | null {
  return useContext(ScanActionsContext)?.handlers ?? null;
}

/**
 * マウント中だけ処理を登録する。関数は毎レンダー新しくてよい（呼ばれたときに最新のものを実行する）。
 * 登録し直すのは canScan / canManual / disabledReason が変わったときだけ。
 */
export function useRegisterScanActions(handlers: ScanActionHandlers): void {
  const setHandlers = useContext(ScanActionsContext)?.setHandlers;
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  const { canScan, canManual, disabledReason } = handlers;
  useEffect(() => {
    if (!setHandlers) return;
    setHandlers({
      openCamera: () => latest.current.openCamera(),
      openAlbum: () => latest.current.openAlbum(),
      openManual: () => latest.current.openManual(),
      canScan,
      canManual,
      disabledReason,
    });
  }, [setHandlers, canScan, canManual, disabledReason]);

  // アンマウントで解除する
  useEffect(() => {
    if (!setHandlers) return;
    return () => setHandlers(null);
  }, [setHandlers]);
}

/** useRegisterScanActions を AppFrame の内側（Provider の内側）で呼ぶための描画なしコンポーネント */
export function RegisterScanActions(props: ScanActionHandlers) {
  useRegisterScanActions(props);
  return null;
}
