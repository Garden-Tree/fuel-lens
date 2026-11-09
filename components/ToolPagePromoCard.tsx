"use client";

import { useEffect, useRef } from "react";
import { trackEvent, type CtaPage } from "@/lib/analytics/events";
import { fuelDiscountSavings, savingsText, type ToolPagePromo } from "@/lib/promo/toolPage";

/**
 * 公開ツールページの計算結果の下に出す提携先の紹介（PR）。広告であることを「PR」と開示文で明示する。
 * リンク（href）が無ければ何も出さない。表示とクリックを GA4 に送る（promo_impression / promo_click）。
 * promo_impression は、カードが半分以上見えたときに、マウント中は提携先ごとに 1 回だけ送る
 * （結果の出し直しや提携先の切り替えで何度も送らない。画面の下の方で見られていないカードは数えない）。
 * IntersectionObserver が無い環境では表示したときに送る。
 */
export default function ToolPagePromoCard({
  promo,
  page,
  liters,
}: {
  promo: ToolPagePromo | null;
  page: CtaPage;
  /** 計算した給油量（L）。出ていなければ null（値引き額の文は出さない） */
  liters: number | null;
}) {
  const href = promo?.href ?? null;
  const promoId = promo?.id ?? null;

  const cardRef = useRef<HTMLElement>(null);
  const sentIds = useRef(new Set<string>());

  useEffect(() => {
    if (!href || !promoId || sentIds.current.has(promoId)) return;
    const send = () => {
      if (sentIds.current.has(promoId)) return;
      sentIds.current.add(promoId);
      trackEvent("promo_impression", { promo_id: promoId, page });
    };
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      send();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)) {
          send();
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [href, promoId, page]);

  if (!promo || !href) return null;
  const savings = savingsText(fuelDiscountSavings(liters, promo));
  return (
    <aside ref={cardRef} aria-label="PR" className="mt-3 rounded-2xl border border-line bg-ground px-4 py-3">
      <p className="text-sm leading-6 text-ink">
        <span className="mr-2 inline-flex rounded-md border border-line bg-surface-2 px-1.5 py-0.5 align-middle text-xs font-bold text-sub">
          PR
        </span>
        {promo.body}
        {savings && <span className="font-bold text-money">{savings}</span>}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <a
          href={href}
          target="_blank"
          rel="sponsored noopener"
          onClick={() => trackEvent("promo_click", { promo_id: promo.id, page })}
          className="inline-flex min-h-11 items-center text-sm font-bold text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {promo.cta}
        </a>
        <p className="text-xs text-sub">{promo.disclosure}</p>
      </div>
    </aside>
  );
}
