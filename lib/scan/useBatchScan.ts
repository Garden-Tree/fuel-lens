"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ANALYZE_TIMEOUT_MS, compressToDataUrl, requestAnalyze } from "./analyzeClient";
import { batchSummaryMessage } from "./batch";
import {
  createBatchController,
  type BatchController,
  type BatchDeps,
  type BatchEnd,
  type BatchItem,
  type BatchState,
} from "./batchController";

type ToastFn = (message: string, options?: { type?: "info" | "success" | "warning" | "error" }) => void;
type ConfirmFn = (message: string, options?: { confirmLabel?: string; danger?: boolean }) => Promise<boolean>;

export type UseBatchScanOptions = {
  /** ログイン中か（401 の案内文）。useAuth().isSignedIn */
  isSignedIn: boolean | undefined;
  /** useToast().toast / confirm。lib から components へ依存しないよう、呼び出し側から渡す */
  toast: ToastFn;
  confirm: ConfirmFn;
  /** テスト用: 圧縮・解析・時計の差し替え */
  deps?: Partial<BatchDeps>;
};

export type BatchScan = {
  /** 一括読み取りの最中か */
  active: boolean;
  /** 状態（一括読み取りをしていなければ null） */
  state: BatchState | null;
  /** 一括読み取りを始めるたびに増える番号（確認シートの key に使う） */
  runId: number;
  /** 確認中（または読み取り待ち）の写真。無ければ null */
  currentItem: BatchItem | null;
  /** 一括読み取りの最中か（ref で同期的に判定する。ドロップ・ペーストの再入防止） */
  isActive: () => boolean;
  /** 画像（2 枚以上、上限・ログイン・閲覧専用の確認は呼び出し側で済ませたもの）の一括読み取りを始める */
  start: (images: readonly File[]) => void;
  /** 確認中の写真を保存した（保存は呼び出し側が通常の経路で行う）。次の写真へ進む */
  markSaved: () => void;
  /** 確認中の写真をスキップして次へ */
  skip: () => void;
  /** 残りを中止する（確認中の読み取り結果や読み取り待ちの写真があれば確認する） */
  requestAbort: () => Promise<void>;
};

/** 「残りを中止」の確認文 */
export function abortConfirmMessage(state: BatchState): string {
  const remaining = state.items.length - state.current;
  return `残りの ${remaining} 枚の読み取りを中止しますか？表示中の読み取り結果は保存されません。`;
}

/**
 * 旧レシートの一括読み取り（lib/scan/batchController.ts）を React の状態にするフック。
 * 終わったら結果を toast で知らせる（「12 枚中 9 件を保存、3 件をスキップしました」）。アンマウント時は中断する。
 */
export function useBatchScan({ isSignedIn, toast, confirm, deps }: UseBatchScanOptions): BatchScan {
  const [state, setState] = useState<BatchState | null>(null);
  const [runId, setRunId] = useState(0);
  const controllerRef = useRef<BatchController | null>(null);
  // 最新の toast / isSignedIn / deps を、作成済みのコントローラーのコールバックから参照する
  const latest = useRef({ toast, isSignedIn, deps });
  useEffect(() => {
    latest.current = { toast, isSignedIn, deps };
  });

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const handleEnd = useCallback((controller: BatchController, end: BatchEnd) => {
    if (controllerRef.current !== controller) return;
    controllerRef.current = null;
    setState(null);
    const { toast: notify } = latest.current;
    if (end.reason === "unauthorized" && end.message) {
      notify(end.message, { type: "error" });
    }
    notify(batchSummaryMessage(end), { type: end.saved > 0 ? "success" : "info" });
  }, []);

  const start = useCallback(
    (images: readonly File[]) => {
      if (controllerRef.current || images.length === 0) return;
      const { isSignedIn: signedIn, deps: overrides } = latest.current;
      const controller: BatchController = createBatchController(
        images,
        {
          compress: (file) => compressToDataUrl(file),
          analyze: (dataUrl, signal) => requestAnalyze(dataUrl, { signal, timeoutMs: ANALYZE_TIMEOUT_MS }),
          isSignedIn: signedIn === true,
          ...overrides,
        },
        {
          onChange: (next) => {
            if (controllerRef.current === controller) setState(next);
          },
          onEnd: (end) => handleEnd(controller, end),
        }
      );
      controllerRef.current = controller;
      setRunId((n) => n + 1);
      setState(controller.getState());
      controller.start();
    },
    [handleEnd]
  );

  const markSaved = useCallback(() => controllerRef.current?.markSaved(), []);
  const skip = useCallback(() => controllerRef.current?.skip(), []);

  const requestAbort = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    const ok = await confirm(abortConfirmMessage(controller.getState()), { confirmLabel: "中止する", danger: true });
    if (!ok || controllerRef.current !== controller) return;
    controller.abort();
  }, [confirm]);

  const isActive = useCallback(() => controllerRef.current !== null, []);

  const currentItem = state && state.phase === "running" ? (state.items[state.current] ?? null) : null;

  return {
    active: state !== null,
    state,
    runId,
    currentItem,
    isActive,
    start,
    markSaved,
    skip,
    requestAbort,
  };
}
