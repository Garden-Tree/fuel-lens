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
            className="bg-gray-900/50 border border-gray-800 rounded-2xl overflow-hidden transition-all duration-300"
          >
            <button
              type="button"
              onClick={() => toggle(idx)}
              aria-expanded={isOpen}
              className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-white hover:bg-gray-800/40 transition"
            >
              <span className="text-sm sm:text-base">{faq.q}</span>
              <ChevronDown
                className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${isOpen ? "rotate-180 text-blue-400" : ""}`}
              />
            </button>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${
                isOpen ? "max-h-[240px] border-t border-white/5 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
              }`}
            >
              <div className="px-6 py-5 text-xs sm:text-sm text-gray-400 leading-relaxed bg-black/10">{faq.a}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
