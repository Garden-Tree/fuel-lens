"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { TRIAL_DISABLED, TRIAL_MAX_SCANS, type TrialState } from "@/lib/trial";

export type TrialContextValue = TrialState & {
  /** サーバーが返した残り回数（X-Trial-Remaining）で表示を更新する */
  setRemaining: (remaining: number) => void;
};

const TrialContext = createContext<TrialContextValue | null>(null);

/**
 * 未ログインのお試し読み取りの状態（表示用の写し）。
 * 初期値はアプリ画面のレイアウト（app/(app)/layout.tsx）がサーバーで HttpOnly の Cookie から読んだもの。
 * その後は /api/analyze の X-Trial-Remaining で更新する。画面間の移動ではレイアウトと一緒に保たれる。
 * ここの値は案内とボタンの有効・無効にだけ使い、回数の判定はサーバー（lib/server/analyze/handler.ts）が行う。
 */
export function TrialProvider({ initial, children }: { initial: TrialState; children: ReactNode }) {
  const [remaining, setRemainingState] = useState(initial.remaining);
  const value = useMemo<TrialContextValue>(
    () => ({
      enabled: initial.enabled,
      remaining,
      setRemaining: (next: number) => {
        if (Number.isInteger(next)) setRemainingState(Math.min(Math.max(next, 0), TRIAL_MAX_SCANS));
      },
    }),
    [initial.enabled, remaining]
  );
  return <TrialContext.Provider value={value}>{children}</TrialContext.Provider>;
}

const noop = () => {};
const DISABLED_VALUE: TrialContextValue = { ...TRIAL_DISABLED, setRemaining: noop };

/** お試しの状態。プロバイダの外（テスト・公開ページ）ではお試しは無効として扱う */
export function useTrial(): TrialContextValue {
  return useContext(TrialContext) ?? DISABLED_VALUE;
}
