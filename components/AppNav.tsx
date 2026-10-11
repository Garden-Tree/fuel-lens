"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { BarChart3, Camera, History, House, Settings, type LucideIcon } from "lucide-react";
import type { ScanMenuAnchor } from "./ScanActionMenu";
import { BrandMark } from "./ui/BrandMark";

/**
 * アプリ画面（/app・/history・/stats・/settings）のナビゲーション。ランディング（/）では使わない。
 * - スマホ（< lg）: 画面下の固定タブバー（ホーム / 履歴 / 中央のスキャンボタン / 統計 / 設定）
 * - PC（≥ lg）: 左のサイドバー（ロゴ・4 項目・「スキャンして記録」・ログイン / ユーザーボタン）
 * スキャンボタンは ScanActionMenu（撮影する / アルバムから選ぶ / 手動で入力）を開く（開閉の状態は AppFrame が持つ）。
 */

export type AppNavItem = { href: string; label: string; icon: LucideIcon };

export const APP_NAV_ITEMS: readonly AppNavItem[] = [
  { href: "/app", label: "ホーム", icon: House },
  { href: "/history", label: "履歴", icon: History },
  { href: "/stats", label: "統計", icon: BarChart3 },
  { href: "/settings", label: "設定", icon: Settings },
];

export const SCAN_BUTTON_LABEL = "レシートとメーターを撮影";

/** いまの画面がナビ項目に当たるか */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TabLink({ item, active }: { item: AppNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        active ? "font-bold text-accent" : "text-sub hover:text-ink"
      }`}
    >
      <Icon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** スマホの下部タブバー（lg 未満で表示） */
export function AppTabBar({ onScan }: { onScan: () => void }) {
  const pathname = usePathname();
  const [home, history, stats, settings] = APP_NAV_ITEMS;
  return (
    <nav
      aria-label="メイン"
      // components/ui/Menu.tsx がこの上端を下限にしてメニューを上下どちらに開くか決める
      data-app-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[rgba(11,15,20,0.96)] pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid h-14 max-w-lg grid-cols-5 items-stretch px-2">
        <TabLink item={home} active={isNavItemActive(pathname, home.href)} />
        <TabLink item={history} active={isNavItemActive(pathname, history.href)} />
        <div className="flex items-start justify-center">
          <button
            type="button"
            onClick={onScan}
            aria-label={SCAN_BUTTON_LABEL}
            aria-haspopup="dialog"
            className="-mt-[22px] flex h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-ground bg-scan-gradient text-white shadow-[0_0_20px_rgba(58,160,255,0.45)] transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
          >
            <Camera className="h-[26px] w-[26px]" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <TabLink item={stats} active={isNavItemActive(pathname, stats.href)} />
        <TabLink item={settings} active={isNavItemActive(pathname, settings.href)} />
      </div>
    </nav>
  );
}

/** PC の左サイドバー（lg 以上で表示） */
export function AppSidebar({ onScan }: { onScan: (anchor: ScanMenuAnchor) => void }) {
  const pathname = usePathname();
  const redirectUrl = pathname || "/app";
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-ground px-3 py-6 lg:flex">
      <Link
        href="/app"
        aria-label="FuelLens ホーム"
        className="mx-1 flex min-h-11 items-center rounded-xl px-2 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <BrandMark />
      </Link>

      <nav aria-label="メイン" className="mt-6 flex flex-col gap-1">
        {APP_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                active ? "bg-surface-2 font-bold text-accent" : "text-sub hover:bg-surface hover:text-ink"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect();
          onScan({ left: rect.left, bottom: rect.bottom, width: rect.width });
        }}
        aria-haspopup="dialog"
        className="mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-scan-gradient px-4 text-[15px] font-bold text-white shadow-[0_0_20px_rgba(58,160,255,0.3)] [text-shadow:0_1px_1px_rgba(0,0,0,0.3)] transition-transform active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
      >
        <Camera className="h-5 w-5" aria-hidden="true" />
        スキャンして記録
      </button>

      <div className="mt-auto border-t border-line px-1 pt-4">
        <SignedOut>
          <SignInButton forceRedirectUrl={redirectUrl}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              ログイン
            </button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <div className="flex min-h-11 items-center gap-3 px-2">
            <UserButton />
            <span className="text-sm text-sub">アカウント</span>
          </div>
        </SignedIn>
      </div>
    </aside>
  );
}
