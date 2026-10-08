"use client";

import { useShortcutActions, type UseShortcutActionsOptions } from "@/lib/scan/useShortcutActions";

/**
 * `?action=`（PWA ショートカット・Web Share Target）を処理するだけの描画なしコンポーネント。
 * useSearchParams を使うため、呼び出し側で <Suspense> で囲み /app の静的プリレンダーを保つ。
 */
export default function ShortcutActionHandler(props: UseShortcutActionsOptions) {
  useShortcutActions(props);
  return null;
}
