"use client";

import { useEffect } from "react";
import { trackEvent, type CtaPage } from "@/lib/analytics/events";
import { fuelDiscountSavings, savingsText, type ToolPagePromo } from "@/lib/promo/toolPage";

/**
 * 公開ツールページの計算結果の下に出す提携先の紹介（PR）。広告であることを「PR」と開示文で明示する。
 * リンク（href）が無ければ何も出さない。表示とクリックを GA4 に送る（promo_impression / promo_click）。
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

  useEffect(() => {
    if (href && promoId) trackEvent("promo_impression", { promo_id: promoId, page });
  }, [href, promoId, page]);

  if (!promo || !href) return null;
  const savings = savingsText(fuelDiscountSavings(liters, promo));
  return (
    <aside aria-label="PR" className="mt-3 rounded-2xl border border-line bg-ground px-4 py-3">
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
