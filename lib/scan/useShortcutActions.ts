"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveShortcutAction, type ShortcutAction, type ShortcutReadiness } from "./shortcuts";

export type UseShortcutActionsOptions = {
  /** 各アクションの判定・実行条件（shortcutReadinessOf） */
  readiness: ShortcutReadiness;
  /** `?action=scan`: カメラを開く */
  onScan: () => void;
  /** `?action=album`: ファイル選択（アルバム）を開く */
  onAlbum: () => void;
  /** `?action=manual`: 手動入力を開く */
  onManual: () => void;
  /** `?action=shared&t=<token>`: 共有画像を取り出す（token は SW が付けたワンタイムトークン。無ければ null） */
  onShared: (token: string | null) => void;
  /** `?action=share-unavailable`: 共有を受け取れなかったことを伝える */
  onShareUnavailable: () => void;
  /** 撮影・アルバム・手動入力を今は始められず取り下げたとき（message は日本語の理由。toast で伝える） */
  onBlocked: (message: string) => void;
};

/**
 * PWA ショートカット（manifest の `/app?action=scan` / `/app?action=manual`）、
 * 他の画面のスキャンメニュー（components/ScanActionMenu.tsx の `/app?action=scan|album|manual`）と
 * Web Share Target（Service Worker からの `/app?action=shared&t=<token>`、
 * SW 未準備時・画像なしの `/app?action=share-unavailable`）を処理する。
 *
 * useSearchParams を使うため、呼び出すコンポーネントを <Suspense> で囲み /app の静的プリレンダーを保つこと。
 * `action` が付くたびに 1 回だけ処理し、`action` / `t` パラメータを URL から消す
 * （`router.replace("/app")` でクエリごと置き換える）。URL から `action` が消えたら次のアクションを受け付ける。
 * - 撮影・アルバム・手動入力は判定できる（マウント済み・読み込み完了）まで待ち、そのとき解析中・確認中・閲覧専用なら
 *   実行せずに取り下げて onBlocked で理由を伝える（条件がそろった後で勝手に実行しない）
 * - 共有画像は条件がそろうまで待つ。対応していない `action` は何もしない（URL も変えない）
 * コールバックは useEffectEvent 経由で呼ぶので、毎レンダー新しい関数を渡してよい（常に最新の値で実行される）。
 */
export function useShortcutActions({
  readiness,
  onScan,
  onAlbum,
  onManual,
  onShared,
  onShareUnavailable,
  onBlocked,
}: UseShortcutActionsOptions): void {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  // SW が付けるワンタイムトークン。IndexedDB の保留画像と一致したときだけ取り出す
  const shareToken = searchParams.get("t");
  const handled = useRef(false);
  const { evaluable, scanBlock, manualBlock, shared, notice } = readiness;

  const run = useEffectEvent((resolved: ShortcutAction, token: string | null) => {
    if (resolved === "scan") onScan();
    else if (resolved === "album") onAlbum();
    else if (resolved === "manual") onManual();
    else if (resolved === "shared") onShared(token);
    else onShareUnavailable();
    router.replace("/app");
  });

  const drop = useEffectEvent((message: string) => {
    onBlocked(message);
    router.replace("/app");
  });

  useEffect(() => {
    // URL から action が消えたら、次のアクションを受け付ける
    if (action === null) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    const resolved = resolveShortcutAction(action, { evaluable, scanBlock, manualBlock, shared, notice });
    if (resolved === null || resolved.type === "wait") return;
    handled.current = true;
    if (resolved.type === "drop") drop(resolved.message);
    else run(resolved.action, shareToken);
  }, [action, shareToken, evaluable, scanBlock, manualBlock, shared, notice]);
}
