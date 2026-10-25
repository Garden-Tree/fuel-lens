"use client";

import { useId } from "react";
import { Smartphone, X } from "lucide-react";

import { primaryButtonClass, secondaryButtonClass } from "@/components/settingsUi";
import { IconButton } from "@/components/ui";
import { A2HS_HEADING, type A2hsGuide } from "@/lib/addToHomeScreen";

export type AddToHomeScreenCardProps = {
  guide: A2hsGuide;
  /** ブラウザのインストール画面を開く（guide.mode === "prompt" のとき） */
  onInstall: () => void;
  /** 「あとで」/「閉じる」 */
  onDismiss: () => void;
};

/**
 * 記録が 1 件以上あるスマホのブラウザで、ホームに一度だけ出す「ホーム画面に追加」の案内。
 * Android で beforeinstallprompt を捕まえていればボタン、無ければ（iOS など）手順の文。
 * 表示の判定と閉じた状態の保存は lib/useAddToHomeScreen.ts（純粋関数は lib/addToHomeScreen.ts）。
 */
export default function AddToHomeScreenCard({ guide, onInstall, onDismiss }: AddToHomeScreenCardProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <Smartphone className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" aria-hidden="true" />
          <h2 id={headingId} className="text-sm font-bold leading-relaxed text-ink">
            {A2HS_HEADING}
          </h2>
        </div>
        <IconButton aria-label="閉じる" variant="ghost" onClick={onDismiss}>
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </IconButton>
      </div>
      {guide.mode === "prompt" ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={onInstall} className={primaryButtonClass}>
            ホーム画面に追加
          </button>
          <button type="button" onClick={onDismiss} className={secondaryButtonClass}>
            あとで
          </button>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-sub">{guide.steps}</p>
      )}
    </section>
  );
}
