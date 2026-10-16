"use client";

import { Images, Layers } from "lucide-react";
import Modal from "@/components/Modal";

export const TWO_IMAGE_CHOICE_TITLE = "2枚の写真をどう読み取りますか？";
export const TWO_IMAGE_CHOICE_PAIR_LABEL = "レシートとメーターの組として読む";
export const TWO_IMAGE_CHOICE_BATCH_LABEL = "2件の給油として一括で読む";

const OPTION_CLASS =
  "flex w-full min-h-14 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-left text-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * ちょうど 2 枚の写真が選ばれた・ドロップ・貼り付けされたときに、読み取り方を選ぶ小さなダイアログ。
 * - 「レシートとメーターの組として読む」: 1 件の給油（TwoPhotoScanSheet を 1 枚目 = レシート、2 枚目 = メーターで開く）
 * - 「2件の給油として一括で読む」: 一括読み取り（1 枚ずつ確認シート）
 * - 「キャンセル」・Escape・背景クリック: 何もしない
 * （3 枚以上は一括読み取り、1 枚は従来の読み取り。振り分けはホーム（app/(app)/app/page.tsx）の processFiles）
 */
export default function TwoImageChoiceDialog({
  onPair,
  onBatch,
  onCancel,
}: {
  onPair: () => void;
  onBatch: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open onClose={onCancel} title={TWO_IMAGE_CHOICE_TITLE} lockBodyScroll>
      <div className="p-5">
        <Modal.Header className="mb-4" />
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onPair} className={OPTION_CLASS}>
            <Images className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">{TWO_IMAGE_CHOICE_PAIR_LABEL}</span>
              <span className="text-xs text-sub">1件の給油（1枚目をレシート、2枚目をメーターとして確認します）</span>
            </span>
          </button>
          <button type="button" onClick={onBatch} className={OPTION_CLASS}>
            <Layers className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium">{TWO_IMAGE_CHOICE_BATCH_LABEL}</span>
              <span className="text-xs text-sub">それぞれの写真を別の給油として1枚ずつ確認します</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-sub hover:bg-surface-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            キャンセル
          </button>
        </div>
      </div>
    </Modal>
  );
}
