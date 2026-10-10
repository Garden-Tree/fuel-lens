"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveShortcutAction, type ShortcutAction, type ShortcutReadiness } from "./shortcuts";

export type UseShortcutActionsOptions = {
  /** 各アクションの実行条件（shortcutReadinessOf） */
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
};

/**
 * PWA ショートカット（manifest の `/app?action=scan` / `/app?action=manual`）、
 * アプリのスキャンメニュー（components/ScanActionMenu.tsx の `/app?action=scan|album|manual`）と
 * Web Share Target（Service Worker からの `/app?action=shared&t=<token>`、
 * SW 未準備時・画像なしの `/app?action=share-unavailable`）を処理する。
 *
 * useSearchParams を使うため、呼び出すコンポーネントを <Suspense> で囲み /app の静的プリレンダーを保つこと。
 * `action` が付くたびに 1 回だけ実行し、実行後に `action` / `t` パラメータを URL から消す
 * （`router.replace("/app")` でクエリごと置き換える）。/app を開いたまま（再マウントなしで）スキャンメニューから
 * 遷移した場合も、検索パラメータの変化で実行する。URL から `action` が消えたら次のアクションを受け付ける。
 * 対応していない `action` は何もしない（URL も変えない）。
 * コールバックは useEffectEvent 経由で呼ぶので、毎レンダー新しい関数を渡してよい（常に最新の値で実行される）。
 */
export function useShortcutActions({
  readiness,
  onScan,
  onAlbum,
  onManual,
  onShared,
  onShareUnavailable,
}: UseShortcutActionsOptions): void {
  const router = useRouter();
  const searchParams = useSearchParams();
  const action = searchParams.get("action");
  // SW が付けるワンタイムトークン。IndexedDB の保留画像と一致したときだけ取り出す
  const shareToken = searchParams.get("t");
  const handled = useRef(false);
  const { scan, manual, shared, notice } = readiness;

  const run = useEffectEvent((resolved: ShortcutAction, token: string | null) => {
    if (resolved === "scan") onScan();
    else if (resolved === "album") onAlbum();
    else if (resolved === "manual") onManual();
    else if (resolved === "shared") onShared(token);
    else onShareUnavailable();
    router.replace("/app");
  });

  useEffect(() => {
    // 実行後に URL から action が消えたら、次のアクション（同じ画面でのメニュー操作）を受け付ける
    if (action === null) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    const resolved = resolveShortcutAction(action, { scan, manual, shared, notice });
    if (resolved === null || resolved === "wait") return;
    handled.current = true;
    run(resolved, shareToken);
  }, [action, shareToken, scan, manual, shared, notice]);
}
