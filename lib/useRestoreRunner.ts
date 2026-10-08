"use client";

import { useState } from "react";

import type { FuelLensBackup } from "@/lib/backup";
import {
  executeRestore,
  RestoreError,
  restoreFailureText,
  restoreProgressText,
  restoreSuccessText,
  type RestoreDeps,
  type RestoreKind,
  type RestoreResult,
} from "@/lib/restore";

type ToastFn = (message: string, options?: { type?: "info" | "success" | "warning" | "error" }) => void;

export interface UseRestoreRunnerOptions extends RestoreDeps {
  /** 設定画面で共有する処理中フラグの setter。実行中は kind（"restore" / "import"）、終わったら null にする */
  setBusy: (busy: RestoreKind | null) => void;
  /** useToast().toast。lib から components へ依存しないよう、呼び出し側から渡す */
  toast: ToastFn;
  /**
   * 実行が終わったら（成功・失敗とも）呼ぶ。changed = 書き込みを 1 回でも行った（失敗時は途中まで追加済みの可能性がある）。
   * 設定画面はこれでデータ概要（記録数）を読み込み直す
   */
  onDone?: (changed: boolean) => void;
}

export interface RestoreRunArgs {
  backup: FuelLensBackup;
  kind: RestoreKind;
  /**
   * 結果の通知（toast）の直前に、成功・失敗とも呼ぶ。プレビュー（古い計画）を破棄する用。
   * 失敗時も途中まで追加済みの可能性があり、古い件数表示・確認文言は使えないため
   */
  onSettled?: () => void;
}

/**
 * executeRestore を設定画面の UI（処理中フラグ・進捗の文言・toast）につなぐフック。
 * BackupPanel（復元）と ImportPanel（取り込み）で共有する。確認ダイアログは呼び出し側で出してから run する。
 *
 * @returns run: 実行する（成功なら結果、失敗なら null。エラーは toast 済みで投げない）、progress: 進捗の文言（実行中以外は null）
 */
export function useRestoreRunner({
  vehicles,
  fetchAllRecords,
  addVehicles,
  addRecords,
  setBusy,
  toast,
  onDone,
}: UseRestoreRunnerOptions): {
  run: (args: RestoreRunArgs) => Promise<RestoreResult | null>;
  progress: string | null;
} {
  const [progress, setProgress] = useState<string | null>(null);

  const run = async ({ backup, kind, onSettled }: RestoreRunArgs): Promise<RestoreResult | null> => {
    setBusy(kind);
    setProgress(restoreProgressText({ phase: "prepare" }));
    let changed = false;
    try {
      const result = await executeRestore(
        backup,
        { vehicles, fetchAllRecords, addVehicles, addRecords },
        p => setProgress(restoreProgressText(p))
      );
      changed = result.changed;
      onSettled?.();
      toast(restoreSuccessText(kind, result), { type: "success" });
      return result;
    } catch (e) {
      console.error(e);
      changed = e instanceof RestoreError && e.changed;
      onSettled?.();
      toast(restoreFailureText(kind, e), { type: "error" });
      return null;
    } finally {
      setBusy(null);
      setProgress(null);
      onDone?.(changed);
    }
  };

  return { run, progress };
}
