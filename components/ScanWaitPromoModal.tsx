"use client";

import Modal from "@/components/Modal";
import type { ScanWaitPromo } from "@/lib/promo/scanWait";

/**
 * 解析待ちの間に出す提携先の紹介（PR）。広告であることを「PR」で明示する。
 * リンクは別タブで開くので、解析は止まらない。解析が終わると呼び出し側が promo=null にして自動で閉じる。
 */
export default function ScanWaitPromoModal({
  promo,
  onClose,
  onLinkClick,
}: {
  promo: ScanWaitPromo | null;
  onClose: () => void;
  onLinkClick?: () => void;
}) {
  if (!promo) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={promo.title}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center bg-black/60 animate-in fade-in duration-200"
    >
      <div className="p-5">
        <p className="mb-2">
          <span className="inline-flex rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-xs font-bold text-sub">PR</span>
        </p>
        <Modal.Header className="mb-3" />
        <p className="text-sm text-ink">{promo.body}</p>
        <p className="mt-3 text-xs text-sub">{promo.disclosure}</p>
        <div className="mt-5 flex flex-col gap-2">
          <a
            href={promo.href}
            target="_blank"
            rel="sponsored noopener noreferrer"
            onClick={onLinkClick}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-bold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {promo.cta}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-sub hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
