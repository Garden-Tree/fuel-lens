"use client";

import { useEffect } from "react";

/**
 * ルートレイアウト自体が失敗したときのフォールバック。
 * layout.tsx を置き換えるため、<html> と <body> を自前で描画する必要がある。
 * ここでは Toast などのプロバイダーも使えないので依存を最小限にする。
 */
export default function GlobalError({
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
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#030712",
          color: "#ffffff",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>問題が発生しました</h1>
          <p style={{ fontSize: 14, color: "#9ca3af", lineHeight: 1.7, margin: "0 0 8px" }}>
            アプリの読み込み中にエラーが発生しました。もう一度お試しいただくか、ホームに戻ってください。
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace", margin: "0 0 20px" }}>
              エラーID: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              再試行
            </button>
            <a
              href="/app"
              style={{
                padding: "12px 20px",
                borderRadius: 12,
                background: "#1f2937",
                color: "#e5e7eb",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              ホームに戻る
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
