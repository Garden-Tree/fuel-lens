"use client";

import { useSyncExternalStore } from "react";
import {
  A2HS_DISMISSED_STORAGE_KEY,
  a2hsGuideOf,
  detectA2hsPlatform,
  isStandaloneDisplay,
  shouldShowAddToHomeScreen,
  type A2hsGuide,
  type A2hsPlatform,
} from "@/lib/addToHomeScreen";

/** Chrome 系の beforeinstallprompt（標準の型定義に無い） */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type A2hsSnapshot = {
  platform: A2hsPlatform;
  standalone: boolean;
  coarsePointer: boolean;
  dismissed: boolean;
  /** 捕まえた beforeinstallprompt（prompt() は 1 回しか呼べないので、使ったら null に戻す） */
  deferred: BeforeInstallPromptEvent | null;
};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(A2HS_DISMISSED_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(A2HS_DISMISSED_STORAGE_KEY, String(Date.now()));
  } catch {
    // 保存できなくても、この表示中は消える
  }
}

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

// ブラウザでだけ使う、端末ごとの状態（useSyncExternalStore の外部ストア）
let snapshot: A2hsSnapshot | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): A2hsSnapshot {
  if (!snapshot) {
    snapshot = {
      platform: detectA2hsPlatform({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      }),
      standalone: isStandaloneDisplay({
        displayModeStandalone: matches("(display-mode: standalone)"),
        navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
      }),
      coarsePointer: matches("(pointer: coarse)"),
      dismissed: readDismissed(),
      deferred: null,
    };
  }
  return snapshot;
}

function update(next: Partial<A2hsSnapshot>): void {
  snapshot = { ...getSnapshot(), ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getServerSnapshot = (): A2hsSnapshot | null => null;

// beforeinstallprompt はページの読み込み直後に 1 回だけ来ることがあるので、カードのマウントを待たずにモジュールの読み込み時から待ち受ける。
// 以前に閉じた端末では横取りせず、ブラウザの既定の表示に任せる
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    if (getSnapshot().dismissed) return;
    event.preventDefault();
    update({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    writeDismissed();
    update({ dismissed: true, deferred: null });
  });
}

export type AddToHomeScreenState = {
  visible: boolean;
  guide: A2hsGuide | null;
  /** ブラウザのインストール画面を開く（guide.mode === "prompt" のとき。ボタンのタップの中で呼ぶ） */
  install: () => Promise<void>;
  /** 「あとで」/「閉じる」。以後この端末では出さない */
  dismiss: () => void;
};

/**
 * ホーム画面の「ホーム画面に追加」の案内カードの状態。判定は lib/addToHomeScreen.ts。
 * サーバー描画とハイドレーション中は出さない（端末の値はブラウザでしか読めない）。
 */
export function useAddToHomeScreen(hasRecords: boolean): AddToHomeScreenState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const visible =
    state !== null &&
    shouldShowAddToHomeScreen({
      hasRecords,
      platform: state.platform,
      standalone: state.standalone,
      dismissed: state.dismissed,
      coarsePointer: state.coarsePointer,
    });
  const guide = state ? a2hsGuideOf(state.platform, state.deferred !== null) : null;

  const dismiss = () => {
    writeDismissed();
    update({ dismissed: true });
  };

  const install = async () => {
    const deferred = getSnapshot().deferred;
    if (!deferred) return;
    // prompt() は 1 回しか使えない。断られたら手順の文に切り替える（カードは残す）
    update({ deferred: null });
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") dismiss();
    } catch (err) {
      console.error("ホーム画面に追加の画面を開けませんでした", err);
    }
  };

  return { visible: visible && guide !== null, guide, install, dismiss };
}
