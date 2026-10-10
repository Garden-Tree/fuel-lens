"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { AppSidebar, AppTabBar } from "./AppNav";
import ScanActionMenu, { type ScanMenuAnchor } from "./ScanActionMenu";
import { BrandMark } from "./ui/BrandMark";

/**
 * アプリ画面（/app・/history・/stats・/settings）の共通の枠と部品（docs/design-system.md「ナビゲーション」）。
 * - AppFrame: ナビゲーション（スマホは下部タブバー、PC は左サイドバー）と本文の器
 * - PageHeader: 見出しと右側の車両チップ
 * - HookErrorLine / ReadOnlyCaption: 読み込みエラーの行・閲覧専用の注記
 */

export type AppFrameProps = {
  /** 本文の最大幅。default = 1040px、narrow = 768px（設定画面など 1 カラムの画面） */
  width?: "default" | "narrow";
  children: ReactNode;
};

/**
 * 画面の枠。各ページの最上位で `<AppFrame>{ページの中身}</AppFrame>` のように使う（`<main>` は AppFrame が描画する）。
 * スマホでは本文の下にタブバーの高さ＋safe-area 分の余白を空ける。スキャンメニューの開閉もここで持つ。
 */
export function AppFrame({ width = "default", children }: AppFrameProps) {
  // null: 閉じている。anchor: null はスマホのボトムシート、値ありは PC のポップオーバー
  const [menu, setMenu] = useState<{ anchor: ScanMenuAnchor | null } | null>(null);
  return (
    <div className="min-h-dvh bg-ground text-ink lg:flex">
      <AppSidebar onScan={anchor => setMenu({ anchor })} />
      <div className="min-w-0 flex-1">
        <main
          className={`mx-auto w-full min-w-0 px-4 pb-[calc(env(safe-area-inset-bottom)+56px+32px)] lg:px-8 lg:pt-8 lg:pb-12 ${
            width === "narrow" ? "max-w-3xl" : "max-w-[1040px]"
          }`}
        >
          {children}
        </main>
      </div>
      <AppTabBar onScan={() => setMenu({ anchor: null })} />
      <ScanActionMenu open={menu !== null} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} />
    </div>
  );
}

export type PageHeaderProps = {
  /** 見出し（h1） */
  title: string;
  /** スマホでは見出しの代わりに FuelLens のロゴとワードマークを出す（/app）。PC では title を出す */
  brand?: boolean;
  /** 右側に置く要素（車両チップなど） */
  rightSlot?: ReactNode;
};

/**
 * 画面上部のヘッダー。左に見出し（20px・太字）、右に車両チップ（rightSlot）。
 * スマホでは右端にログイン / ユーザーボタンも置く（PC はサイドバーの下部にある）。
 * ログイン後は今いる画面に戻る（`usePathname()` を forceRedirectUrl に使う）。
 */
export function PageHeader({ title, brand = false, rightSlot }: PageHeaderProps) {
  const pathname = usePathname();
  const redirectUrl = pathname || "/app";

  // 上の余白に safe-area-inset-top を足す（ホーム画面から開いた PWA は black-translucent のステータスバーの下まで描画されるため）
  return (
    <header className="flex min-h-10 items-center justify-between gap-3 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] lg:pb-5 lg:pt-0">
      <h1 className="min-w-0 truncate text-xl font-bold">
        {brand ? (
          <>
            <span className="lg:hidden">
              <BrandMark className="text-lg" />
            </span>
            <span className="hidden lg:inline">{title}</span>
          </>
        ) : (
          title
        )}
      </h1>

      <div className="flex min-w-0 shrink items-center justify-end gap-2">
        {rightSlot}
        <div className="flex shrink-0 items-center lg:hidden">
          <SignedOut>
            <SignInButton forceRedirectUrl={redirectUrl}>
              <button
                type="button"
                className="h-10 whitespace-nowrap rounded-xl px-2.5 text-sm font-bold text-accent transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ログイン
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <span className="flex h-10 w-10 items-center justify-center">
              <UserButton />
            </span>
          </SignedIn>
        </div>
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
    <p role="status" className="text-[11px] text-warn mb-2 px-1">
      閲覧専用（クラウド接続待ち）
    </p>
  );
}
