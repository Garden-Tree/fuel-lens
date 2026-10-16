"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { AppSidebar, AppTabBar } from "./AppNav";
import ScanActionMenu, { type ScanMenuAnchor } from "./ScanActionMenu";
import { ScanActionsProvider } from "./ScanActions";
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
 *
 * スマホ（< lg）は「アプリシェル」: 枠全体を画面に固定（fixed inset-0 の縦 flex）し、文書（html/body）はスクロールさせない。
 * 本文の器（`data-app-scroll`）だけがスクロールし、下部タブバーは position: fixed ではなく flex の最後の子として下端に置く。
 * iOS の WebKit はカメラ・写真の選択から戻った直後などにレイアウト用ビューポートの高さがずれ、
 * fixed のタブバーがページと一緒にスクロールしたり下に空白ができたりするため（docs/design-system.md「ナビゲーション」）。
 * PC（≥ lg）は従来どおり左サイドバー＋文書のスクロール。
 *
 * 本文の器は文書ではないので、画面の切り替え（pathname の変化）で先頭に戻す（`#record-<id>` などのハッシュ付きは各画面に任せる）。
 * スキャンメニューの開閉もここで持つ。本文とスキャンメニューを ScanActionsProvider で包む
 * （/app のホームが撮影・アルバム・手動入力の処理を登録し、メニューがタップの中で直接呼ぶ。components/ScanActions.tsx）。
 */
export function AppFrame({ width = "default", children }: AppFrameProps) {
  // null: 閉じている。anchor: null はスマホのボトムシート、値ありは PC のポップオーバー
  const [menu, setMenu] = useState<{ anchor: ScanMenuAnchor | null } | null>(null);
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || window.location.hash) return;
    el.scrollTop = 0;
  }, [pathname]);

  return (
    <ScanActionsProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-ground text-ink lg:static lg:min-h-dvh lg:flex-row lg:overflow-visible">
        <AppSidebar onScan={anchor => setMenu({ anchor })} />
        <div
          ref={scrollRef}
          // lib/useBodyScrollLock.ts がモーダル表示中にこの器のスクロールも止める
          data-app-scroll=""
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain lg:min-h-0 lg:overflow-visible"
        >
          <main
            className={`mx-auto w-full min-w-0 px-4 pb-8 lg:px-8 lg:pt-8 lg:pb-12 ${
              width === "narrow" ? "max-w-3xl" : "max-w-[1040px]"
            }`}
          >
            {children}
          </main>
        </div>
        <AppTabBar onScan={() => setMenu({ anchor: null })} />
        <ScanActionMenu open={menu !== null} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} />
      </div>
    </ScanActionsProvider>
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
 * 画面上部のヘッダー。左に見出し（20px・太字。縮めない）、右に車両チップ（rightSlot。狭いときはチップの車両名を省略する）。
 * スマホでは右端にログイン / ユーザーボタンも置く（PC はサイドバーの下部にある）。
 * ログイン後は今いる画面に戻る（`usePathname()` を forceRedirectUrl に使う）。
 */
export function PageHeader({ title, brand = false, rightSlot }: PageHeaderProps) {
  const pathname = usePathname();
  const redirectUrl = pathname || "/app";

  // 上の余白に safe-area-inset-top を足す（ホーム画面から開いた PWA は black-translucent のステータスバーの下まで描画されるため）
  return (
    <header className="flex min-h-10 items-center justify-between gap-3 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] lg:pb-5 lg:pt-0">
      <h1 className="shrink-0 text-xl font-bold">
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
            <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
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
