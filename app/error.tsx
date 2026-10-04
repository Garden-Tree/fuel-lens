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
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">問題が発生しました</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            画面の表示中にエラーが発生しました。もう一度お試しいただくか、ホームに戻ってください。
          </p>
          {error.digest && (
            <p className="text-[11px] text-gray-600 font-mono">エラーID: {error.digest}</p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> 再試行
          </button>
          <Link
            href="/app"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-sm font-bold text-gray-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
          >
            <Home className="w-4 h-4" aria-hidden="true" /> ホームに戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
