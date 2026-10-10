"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

/**
 * ルートセグメントのエラー境界。
 * レンダリング中に例外が発生したときに表示され、「再試行」でセグメントを再描画する。
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-dvh bg-ground text-ink flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">問題が発生しました</h1>
          <p className="text-sm text-sub leading-relaxed">
            画面の表示中にエラーが発生しました。もう一度お試しいただくか、ホームに戻ってください。
          </p>
          {error.digest && (
            <p className="num text-[11px] text-faint">エラーID: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center justify-center gap-2 px-5 rounded-xl bg-accent text-ground hover:bg-accent/90 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> 再試行
          </button>
          <Link
            href="/app"
            className="inline-flex min-h-11 items-center justify-center gap-2 px-5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-sm font-bold text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Home className="w-4 h-4" aria-hidden="true" /> ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
