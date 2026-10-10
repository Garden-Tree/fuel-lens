"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Camera, ChevronRight, Edit2, Image as ImageIcon, type LucideIcon } from "lucide-react";
import Modal from "./Modal";

/**
 * スキャンボタン（タブバー中央 / サイドバー）から開く操作メニュー: 撮影する / アルバムから選ぶ / 手動で入力。
 * 各項目は `/app?action=scan|album|manual` へ遷移し、/app の useShortcutActions が実行する（実行後に URL から消える）。
 *
 * - `anchor` なし（スマホ）: 画面下からのボトムシート
 * - `anchor` あり（PC）: ボタンの真下に出すポップオーバー（アンカーの左端・幅に合わせる）
 *
 * 未ログイン時は AI スキャン（撮影・アルバム）を無効にし、手動入力だけ選べるようにする（/api/analyze はログイン必須）。
 */

/** ボタンの位置（getBoundingClientRect の一部） */
export type ScanMenuAnchor = { left: number; bottom: number; width: number };

type ScanAction = {
  action: "scan" | "album" | "manual";
  label: string;
  description: string;
  icon: LucideIcon;
  /** AI スキャン（ログイン必須） */
  requiresSignIn: boolean;
};

const ACTIONS: readonly ScanAction[] = [
  { action: "scan", label: "撮影する", description: "レシートとメーターを1枚に収めて撮影", icon: Camera, requiresSignIn: true },
  { action: "album", label: "アルバムから選ぶ", description: "撮影済みの写真を読み取る", icon: ImageIcon, requiresSignIn: true },
  { action: "manual", label: "手動で入力", description: "金額・給油量・距離を入力", icon: Edit2, requiresSignIn: false },
];

export const SIGNED_OUT_SCAN_NOTE = "AIスキャンはログイン後に使えます。手動入力はログインなしでも使えます。";

export type ScanActionMenuProps = {
  open: boolean;
  onClose: () => void;
  anchor?: ScanMenuAnchor | null;
};

const ROW_CLASS =
  "flex w-full min-h-14 items-center gap-3 px-4 py-2.5 text-left text-ink transition-colors hover:bg-surface-2/60 active:bg-surface-2 focus:outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

export default function ScanActionMenu({ open, onClose, anchor = null }: ScanActionMenuProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const signedOut = isLoaded && !isSignedIn;
  const popover = anchor !== null;
  const popoverTitleId = useId();
  // ポップオーバーは最初の選べる項目にフォーカスする（シートは既定どおり × ボタン）
  const firstActionRef = useRef<HTMLAnchorElement>(null);
  const firstEnabled = ACTIONS.find(item => !(item.requiresSignIn && signedOut))?.action;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="記録する"
      labelledBy={popover ? popoverTitleId : undefined}
      initialFocusRef={popover ? firstActionRef : undefined}
      lockBodyScroll={!popover}
      backdropClassName={
        popover
          ? "fixed inset-0 z-50 bg-black/30"
          : "fixed inset-0 z-50 flex items-end justify-center bg-black/60 animate-in fade-in duration-200"
      }
      panelClassName={
        popover
          ? "fixed overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-2xl shadow-black/60"
          : "w-full max-w-lg rounded-t-hero border-t border-line bg-surface text-ink px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl shadow-black/60"
      }
      panelStyle={popover ? { left: anchor.left, top: anchor.bottom + 8, width: Math.max(anchor.width, 280) } : undefined}
    >
      {popover ? (
        // ポップオーバーは見出しを視覚的に隠す（aria-labelledby の参照先としては残す）。閉じるのは Escape・外側のクリック
        <h2 id={popoverTitleId} className="sr-only">
          記録する
        </h2>
      ) : (
        <Modal.Header className="mb-3 px-1" />
      )}
      <div className={popover ? "divide-y divide-line" : "overflow-hidden rounded-2xl bg-surface-2/50 divide-y divide-line"}>
        {ACTIONS.map(item => {
          const Icon = item.icon;
          const disabled = item.requiresSignIn && signedOut;
          const content = (
            <>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  disabled ? "bg-surface-2 text-faint" : "bg-accent-strong text-accent"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium">{item.label}</span>
                <span className="truncate text-xs text-sub">{item.description}</span>
              </span>
              {!disabled && <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />}
            </>
          );
          return disabled ? (
            <button key={item.action} type="button" disabled className={`${ROW_CLASS} cursor-not-allowed opacity-50`}>
              {content}
            </button>
          ) : (
            <Link
              key={item.action}
              ref={item.action === firstEnabled ? firstActionRef : undefined}
              href={`/app?action=${item.action}`}
              onClick={onClose}
              className={ROW_CLASS}
            >
              {content}
            </Link>
          );
        })}
      </div>
      {signedOut && (
        <p className={`text-xs text-warn ${popover ? "border-t border-line px-4 py-3" : "mt-3 px-1"}`}>
          {SIGNED_OUT_SCAN_NOTE}
        </p>
      )}
    </Modal>
  );
}
