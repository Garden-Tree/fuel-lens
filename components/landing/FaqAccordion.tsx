"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export type FaqItem = {
  q: string;
  a: string;
};

/**
 * FAQ のアコーディオン。開閉状態だけを持つ小さなクライアントコンポーネント。
 * 質問・回答の本文は Server Component 側（app/page.tsx）から props で渡す。
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="space-y-4">
      {items.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={faq.q}
            className="bg-surface border border-line rounded-2xl overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggle(idx)}
              aria-expanded={isOpen}
              className="w-full px-5 sm:px-6 py-5 flex items-center justify-between gap-3 text-left font-bold text-ink hover:bg-surface-2/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <span className="text-sm sm:text-base">{faq.q}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-sub transition-transform duration-300 ${isOpen ? "rotate-180 text-accent" : ""}`}
                aria-hidden="true"
              />
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                isOpen ? "max-h-[480px] border-t border-line opacity-100" : "max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className="px-5 sm:px-6 py-5 text-sm text-sub leading-relaxed">{faq.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
