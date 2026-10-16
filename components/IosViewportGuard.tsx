"use client";

import { useEffect } from "react";
import { nextViewportContent } from "@/lib/iosViewport";

/**
 * iOS だけ `<meta name="viewport">` に maximum-scale=1 を足し、入力欄フォーカス時の自動ズームを止める。
 * 理由と安全性は lib/iosViewport.ts。画面には何も描画しない。
 */
export default function IosViewportGuard() {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;
    const next = nextViewportContent(meta.content, {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    if (next !== null && next !== meta.content) meta.content = next;
  }, []);
  return null;
}
