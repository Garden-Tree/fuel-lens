"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { CTA_ATTRIBUTE, ctaClickParamsOf, trackEvent } from "@/lib/analytics/events";
import { gaMeasurementId, initGtag, trackPageView } from "@/lib/analytics/ga";

/**
 * Google Analytics 4（行動イベントの計測。docs/operations.md「Google Analytics 4」）。
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` の無いビルドでは何も描画せず、gtag.js も読み込まない。
 * - ページビューはパス（usePathname）が変わるたびに自前で送る（lib/analytics/ga.ts。クエリとハッシュは送らない）
 * - 公開ページの CTA（`data-ga-cta` 属性付きのリンク）のクリックは、ここの 1 か所の listener で cta_click にする
 *   （公開ページは Server Component のまま。属性を足すだけで静的ビルドに影響しない）
 */
export default function GoogleAnalytics() {
  const id = gaMeasurementId();
  if (!id) return null;
  return <GoogleAnalyticsTag id={id} />;
}

function GoogleAnalyticsTag({ id }: { id: string }) {
  const pathname = usePathname();

  // 初期化はページビューより前に（同じコンポーネントのエフェクトは宣言順に実行される）
  useEffect(() => {
    initGtag(id, window, window.location.href, document.referrer);
  }, [id]);

  useEffect(() => {
    trackPageView(window, window.location.href, document.referrer);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest(`a[${CTA_ATTRIBUTE}]`);
      if (!link) return;
      const params = ctaClickParamsOf(window.location.pathname, link.getAttribute(CTA_ATTRIBUTE));
      if (params) trackEvent("cta_click", params);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`} strategy="afterInteractive" />;
}
