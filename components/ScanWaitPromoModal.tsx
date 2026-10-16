"use client";

import Modal from "@/components/Modal";
import { SCAN_WAIT_PROMO_DONE_TITLE, type ScanWaitPromo } from "@/lib/promo/scanWait";

/**
 * 解析待ちの間に出す提携先の紹介（PR）。広告であることを「PR」で明示する。
 * リンクは別タブで開くので、解析は止まらない。解析が終わっても自動では閉じず（done）、「結果を見る」で閉じると結果が見える。
 */
export default function ScanWaitPromoModal({
  promo,
  done = false,
  onClose,
  onLinkClick,
}: {
  promo: ScanWaitPromo | null;
  /** 解析が終わったか（見出しとボタンを切り替える） */
  done?: boolean;
  onClose: () => void;
  onLinkClick?: () => void;
}) {
  if (!promo || !promo.href) return null;
  return (
    <Modal
      open
      onClose={onClose}
      title={done ? SCAN_WAIT_PROMO_DONE_TITLE : promo.title}
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
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${done ? "border border-line text-ink hover:bg-surface-2" : "bg-accent text-white"}`}
          >
            {promo.cta}
          </a>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${done ? "bg-accent font-bold text-white" : "font-medium text-sub hover:bg-surface-2"}`}
          >
            {done ? "結果を見る" : "閉じる"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
