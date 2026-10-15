"use client";

import { CircleStop, Hourglass, Loader2, SkipForward } from "lucide-react";
import { batchPositionLabel, rateLimitWaitMessage, waitSeconds } from "@/lib/scan/batch";
import type { BatchItem, BatchState } from "@/lib/scan/batchController";

export type BatchScanCardProps = {
  state: BatchState;
  /** この写真をスキップ */
  onSkip: () => void;
  /** 残りを中止（確認は呼び出し側） */
  onAbort: () => void;
};

const BUTTON =
  "inline-flex min-h-11 grow basis-40 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** 状態の 1 行（表示用。待ち時間の秒数を含む） */
export function batchItemStatusText(item: BatchItem): string {
  switch (item.status) {
    case "pending":
      return "順番を待っています...";
    case "compressing":
      return "画像を圧縮中...";
    case "waiting":
      return rateLimitWaitMessage(waitSeconds(item.waitMs));
    case "analyzing":
      return "AIが解析中...";
    case "ready":
      return "読み取り結果を確認してください";
    case "failed":
      return "読み取れませんでした。手入力するかスキップしてください";
    case "saved":
      return "保存しました";
    case "skipped":
      return "スキップしました";
  }
}

/**
 * 読み上げ用の状態（秒数は含めない。1 秒ごとに読み上げないため）。
 * 「3 / 12 枚目: 読み取り中」のように、写真が進んだときと段階が変わったときだけ変わる
 */
export function batchAnnouncement(state: BatchState): string {
  const item = state.items[state.current];
  if (!item) return "";
  const position = batchPositionLabel(state.current, state.items.length);
  const what =
    item.status === "waiting"
      ? "読み取りの回数制限のため待っています"
      : item.status === "ready"
        ? "読み取り結果の確認"
        : item.status === "failed"
          ? "読み取れませんでした"
          : "読み取り中";
  return `${position}: ${what}`;
}

/**
 * ホームに出す、写真の一括読み取りの状態カード。確認シートを開いていない間（読み取り中・回数制限の待ち）に見える。
 * 進み具合（「3 / 12 枚目」とバー）・いまの段階・「この写真をスキップ」「残りを中止」。
 * 読み上げは aria-live="polite" の非表示の行で、写真が進んだとき・段階が変わったときだけ行う（待ちの秒数は読み上げない）。
 */
export default function BatchScanCard({ state, onSkip, onAbort }: BatchScanCardProps) {
  const total = state.items.length;
  const item = state.items[state.current];
  if (!item) return null;
  const saved = state.items.filter((i) => i.status === "saved").length;
  const skipped = state.items.filter((i) => i.status === "skipped").length;
  const busy = item.status === "pending" || item.status === "compressing" || item.status === "analyzing";

  return (
    <section
      aria-label="写真の一括読み取り"
      className="flex w-full flex-col gap-3 rounded-hero border border-line bg-surface p-3 lg:p-4"
    >
      <p role="status" aria-live="polite" className="sr-only">
        {batchAnnouncement(state)}
      </p>
      <div className="flex items-center gap-3">
        {item.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.dataUrl}
            alt="読み取り中の写真"
            className="h-14 w-14 shrink-0 rounded-xl bg-surface-2 object-cover"
            draggable="false"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2" aria-hidden="true">
            <Loader2 className="h-5 w-5 animate-spin text-faint" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-accent">写真の一括読み取り</span>
            <span className="num shrink-0 font-bold text-ink">{batchPositionLabel(state.current, total)}</span>
          </p>
          <p className="flex items-start gap-1.5 text-sm font-bold text-ink">
            {item.status === "waiting" ? (
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
            ) : busy ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
            ) : null}
            <span className="min-w-0">{batchItemStatusText(item)}</span>
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${((state.current + 1) / total) * 100}%` }} />
          </div>
          {(saved > 0 || skipped > 0) && (
            <p className="text-[11px] text-sub">
              保存 {saved} 件・スキップ {skipped} 件
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSkip} className={`${BUTTON} border border-border bg-surface text-ink hover:bg-surface-2`}>
          <SkipForward className="h-4 w-4" aria-hidden="true" /> この写真をスキップ
        </button>
        <button type="button" onClick={onAbort} className={`${BUTTON} text-sub hover:bg-surface-2 hover:text-ink`}>
          <CircleStop className="h-4 w-4" aria-hidden="true" /> 残りを中止
        </button>
      </div>
    </section>
  );
}
