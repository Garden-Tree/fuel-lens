"use client";

import { useShortcutActions, type UseShortcutActionsOptions } from "@/lib/scan/useShortcutActions";

/**
 * `?action=`（PWA ショートカット・Web Share Target）を処理するだけの描画なしコンポーネント。
 * useSearchParams を使うため、呼び出し側で <Suspense> で囲む（/app はレイアウトの auth() で動的描画だが、
 * 検索パラメータを読む部分だけを Suspense の内側に閉じ込めておく）。
 */
export default function ShortcutActionHandler(props: UseShortcutActionsOptions) {
  useShortcutActions(props);
  return null;
}
