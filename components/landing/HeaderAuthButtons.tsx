"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Clerk（@clerk/nextjs と clerk-js 本体）は、このチャンクを描画したときに初めて読み込まれる
const ClerkHeaderAuth = dynamic(() => import("./ClerkHeaderAuth"), { ssr: false });

/** ページの読み込み（load）が終わり、ブラウザが空いたら呼ぶ。返り値で取り消す */
function whenPageIdle(callback: () => void): () => void {
  let idleId: number | undefined;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(callback, { timeout: 2000 });
    } else {
      timerId = setTimeout(callback, 200);
    }
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    if (idleId !== undefined) window.cancelIdleCallback(idleId);
    if (timerId !== undefined) clearTimeout(timerId);
  };
}

/**
 * ランディングページ右上のログイン／ダッシュボードボタン。
 * 公開ページの初期表示を軽くするため、Clerk はページの読み込みが終わってから読み込む
 * （app/layout.tsx には ClerkProvider を置かない。アプリ画面は app/(app)/layout.tsx）。
 * 読み込むまでは何も出さない（ログイン状態が分かるまで出さないのは、Clerk を最初から読み込んでいたときと同じ）。
 */
export default function HeaderAuthButtons() {
  const [ready, setReady] = useState(false);

  useEffect(() => whenPageIdle(() => setReady(true)), []);

  return (
    <div className="flex items-center gap-1 sm:gap-3">
      {ready && <ClerkHeaderAuth />}
    </div>
  );
}
