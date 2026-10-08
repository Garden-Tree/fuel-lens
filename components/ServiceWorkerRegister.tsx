"use client";

import { useEffect } from "react";

/**
 * Service Worker（`public/sw.js`）を登録する。UI は持たない。
 * SW は Web Share Target の受け取り専用で、キャッシュはしない。
 * 開発中（next dev）は既定で登録しない。試すときは NEXT_PUBLIC_ENABLE_SW=1 を設定する。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const enabled =
      process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
    if (!enabled) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("Service Worker の登録に失敗しました", err);
    });
  }, []);

  return null;
}
