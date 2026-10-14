"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * アカウント削除の後（設定画面から `/?deleted=1` へ移る）に、ランディングで一度だけ出す通知。
 * 表示したら URL から `deleted` を消す（再読み込み・共有で出し直さない）。
 * useSearchParams は静的なランディングに Suspense 境界を要求するため使わず、マウント後に location を読む。
 */
export default function AccountDeletedNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("deleted") !== "1") return;
    url.searchParams.delete("deleted");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    // URL はマウント後にだけ読める（静的に生成するページなので初回描画はサーバーと一致させる）。一度だけ表示を切り替える
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div
        role="status"
        className="flex items-start gap-3 rounded-2xl border border-money-dim/60 bg-surface px-4 py-3 text-sm text-ink"
      >
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-money" aria-hidden="true" />
        <p className="flex-1 leading-relaxed">
          アカウントとクラウドのデータを削除しました。ご利用ありがとうございました。
        </p>
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="通知を閉じる"
          className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sub transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
