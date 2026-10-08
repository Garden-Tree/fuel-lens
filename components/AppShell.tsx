"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { ArrowLeft, BarChart3, History, Settings, type LucideIcon } from "lucide-react";

/**
 * 画面共通のヘッダー・エラー行・閲覧専用の注記（/app・/history・/stats）。
 * 見た目は各画面の従来のマークアップをそのまま移したもの。
 */

/** ヘッダー右側のナビゲーションリンク */
export type HeaderLink = {
  href: string;
  /** aria-label。ラベル文字を表示する場合はその文字列にもなる */
  label: string;
  icon: LucideIcon;
  /** ラベル文字を表示し始める画面幅。省略時はアイコンのみ */
  showLabelFrom?: "sm" | "md";
  /**
   * 見た目。"pill" は /app の枠付きの丸ボタン、"solid" はサブページ（/history）の塗りの丸ボタン（アイコンは青）。
   * 省略時は "pill"
   */
  tone?: "pill" | "solid";
};

/** /app のヘッダーのリンク（グラフ / 給油履歴 / 設定） */
export const HOME_HEADER_LINKS: readonly HeaderLink[] = [
  { href: "/stats", label: "グラフ", icon: BarChart3, showLabelFrom: "md" },
  { href: "/history", label: "給油履歴", icon: History, showLabelFrom: "md" },
  { href: "/settings", label: "設定", icon: Settings },
];

/** Tailwind はクラス名を静的に検出するため、組み立てずに完全な文字列で持つ */
const LINK_CLASS: Record<NonNullable<HeaderLink["tone"]>, string> = {
  pill: "p-2 bg-gray-800/50 rounded-full border border-gray-700/50 text-gray-400 hover:text-white transition group flex items-center gap-2",
  solid: "p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition text-gray-300 group flex items-center gap-2",
};
const LABEL_CLASS: Record<NonNullable<HeaderLink["tone"]>, Record<NonNullable<HeaderLink["showLabelFrom"]>, string>> = {
  pill: {
    sm: "hidden sm:inline text-sm font-semibold pr-1",
    md: "hidden md:inline text-sm font-semibold pr-1",
  },
  solid: {
    sm: "hidden sm:inline text-sm font-bold pr-1",
    md: "hidden md:inline text-sm font-bold pr-1",
  },
};
const ICON_CLASS: Record<NonNullable<HeaderLink["tone"]>, string> = {
  pill: "w-5 h-5",
  solid: "w-5 h-5 text-blue-400",
};

function HeaderNavLink({ link }: { link: HeaderLink }) {
  const tone = link.tone ?? "pill";
  const Icon = link.icon;
  return (
    <Link href={link.href} aria-label={link.label} className={LINK_CLASS[tone]}>
      {link.showLabelFrom && <span className={LABEL_CLASS[tone][link.showLabelFrom]}>{link.label}</span>}
      <Icon className={ICON_CLASS[tone]} aria-hidden="true" />
    </Link>
  );
}

export type PageHeaderProps = {
  /** 見出し（h1） */
  title: string;
  /**
   * backHref なし（/app）: ロゴのアイコン（グラデーションの角丸の中に表示）。
   * backHref あり: 見出しの前に置くアイコン（青）。省略可
   */
  icon?: LucideIcon;
  /** 戻るリンクの行き先。指定するとサブページの見た目（戻るボタン・sticky ヘッダー）になる */
  backHref?: string;
  /** 戻るリンクの aria-label。既定は「ホームに戻る」 */
  backLabel?: string;
  /** ヘッダー右側のリンク（ログインボタンの前に並ぶ） */
  links?: readonly HeaderLink[];
  /** リンクとログインボタンの間に置く任意の要素 */
  rightSlot?: ReactNode;
};

/**
 * 画面上部のヘッダー。ロゴ（または戻るリンク）と見出し、ナビゲーションリンク、Clerk のログイン / ユーザーボタン。
 * ログイン後は今いる画面に戻る（`usePathname()` を forceRedirectUrl に使う）。
 */
export function PageHeader({
  title,
  icon: Icon,
  backHref,
  backLabel = "ホームに戻る",
  links = [],
  rightSlot,
}: PageHeaderProps) {
  const pathname = usePathname();
  const redirectUrl = pathname || "/app";
  const isSubPage = backHref !== undefined;

  return (
    <header
      className={
        isSubPage
          ? "flex items-center justify-between py-4 mb-2 sticky top-0 bg-black/80 backdrop-blur-md z-10 w-full"
          : "flex items-center justify-between py-4 mb-2 w-full"
      }
    >
      {isSubPage ? (
        <div className="flex items-center gap-4">
          <Link href={backHref} aria-label={backLabel} className="p-2 bg-gray-900 rounded-full hover:bg-gray-800 transition">
            <ArrowLeft className="w-5 h-5 text-gray-300" aria-hidden="true" />
          </Link>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            {Icon && <Icon className="w-6 h-6 text-blue-500" aria-hidden="true" />}
            {title}
          </h1>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Icon className="text-white w-6 h-6 fill-current" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>
      )}

      <div className="flex items-center gap-3">
        {links.map(link => (
          <HeaderNavLink key={link.href} link={link} />
        ))}
        {rightSlot}

        <SignedOut>
          <SignInButton forceRedirectUrl={redirectUrl}>
            <button className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-1.5 px-4 rounded-full transition shadow-lg">
              ログイン
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>
    </header>
  );
}

/** データ取得エラーの行（useVehicleScope の `error`）。error が無ければ何も描画しない */
export function HookErrorLine({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-xs text-red-400 mb-2 px-1">
      {error}
    </p>
  );
}

/** 閲覧専用（ログイン中かつクラウド障害中）の注記 */
export function ReadOnlyCaption({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="text-[11px] text-amber-400/90 mb-2 px-1">
      閲覧専用（クラウド接続待ち）
    </p>
  );
}
