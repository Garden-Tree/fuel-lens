"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { AppSidebar, AppTabBar } from "./AppNav";
import ScanActionMenu, { type ScanMenuAnchor } from "./ScanActionMenu";
import { ScanActionsProvider } from "./ScanActions";
import { BrandMark } from "./ui/BrandMark";

/**
 * アプリ画面（/app・/history・/stats・/settings）の共通の枠と部品（docs/design-system.md「ナビゲーション」）。
 * - AppShell: ナビゲーション（スマホは下部タブバー、PC は左サイドバー）と本文の器。app/(app)/layout.tsx が描画する
 * - AppPage: 各ページ（と loading.tsx）の最上位。ページごとの本文の幅
 * - PageHeader: 見出しと右側の車両チップ
 * - HookErrorLine / ReadOnlyCaption: 読み込みエラーの行・閲覧専用の注記
 */

/**
 * アプリ画面の枠（シェル）。`app/(app)/layout.tsx` が 1 回だけ描画し、画面の切り替え（/app ⇔ /history など）では作り直さない。
 * 切り替わるのは `<main>` の中の各ページ（とその loading.tsx）だけで、サイドバー・タブバー・スキャンメニュー・本文の器は保たれる。
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
 *
 * ナビの項目をタップしたら、遷移（サーバーへの往復）の完了を待たずにその項目を選択中として表示する（useOptimisticNavPath）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  // null: 閉じている。anchor: null はスマホのボトムシート、値ありは PC のポップオーバー
  const [menu, setMenu] = useState<{ anchor: ScanMenuAnchor | null } | null>(null);
  const pathname = usePathname();
  const { activePath, onNavigate } = useOptimisticNavPath(pathname);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || window.location.hash) return;
    el.scrollTop = 0;
  }, [pathname]);

  return (
    <ScanActionsProvider>
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-ground text-ink lg:static lg:min-h-dvh lg:flex-row lg:overflow-visible">
        <AppSidebar activePath={activePath} onNavigate={onNavigate} onScan={anchor => setMenu({ anchor })} />
        <div
          ref={scrollRef}
          // lib/useBodyScrollLock.ts がモーダル表示中にこの器のスクロールも止める
          data-app-scroll=""
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain lg:min-h-0 lg:overflow-visible"
        >
          <main className="mx-auto w-full min-w-0 max-w-[1040px] px-4 pb-8 lg:px-8 lg:pt-8 lg:pb-12">{children}</main>
        </div>
        <AppTabBar activePath={activePath} onNavigate={onNavigate} onScan={() => setMenu({ anchor: null })} />
        <ScanActionMenu open={menu !== null} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} />
      </div>
    </ScanActionsProvider>
  );
}

/**
 * ナビの選択表示に使うパス。項目をタップした（Link の onNavigate）時点で、その項目を選択中として返す（楽観的な表示）。
 * 実際の pathname が変わったら（遷移の完了・別の経路での遷移）楽観的な値を捨て、pathname に従う。
 */
export function useOptimisticNavPath(pathname: string | null): {
  activePath: string | null;
  onNavigate: (href: string) => void;
} {
  const [pending, setPending] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    // 描画中に前回の pathname と比べて捨てる（React の「前回の描画の値で state を調整する」パターン）
    setSeenPath(pathname);
    setPending(null);
  }
  const onNavigate = useCallback(
    (href: string) => {
      setPending(href === pathname ? null : href);
    },
    [pathname]
  );
  return { activePath: pending ?? pathname, onNavigate };
}

export type AppPageProps = {
  /** 本文の最大幅。default = 1040px（シェルの `<main>` のまま）、narrow = 768px（設定画面など 1 カラムの画面） */
  width?: "default" | "narrow";
  children: ReactNode;
};

/**
 * ページの中身の器（各ページと loading.tsx の最上位）。シェル（AppShell）はレイアウトにあるので、ページごとに違う幅だけをここで決める。
 * narrow は従来の `max-w-3xl`（768px）の `<main>` と同じ本文幅（左右の余白を除いて 736px、PC は 704px）にする。
 */
export function AppPage({ width = "default", children }: AppPageProps) {
  if (width === "default") return <>{children}</>;
  return <div className="mx-auto w-full min-w-0 max-w-[736px] lg:max-w-[704px]">{children}</div>;
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

/** 車両チップの読み込み中の形（VehicleSelector の loading と loading.tsx で共有） */
export function VehicleChipSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`flex min-w-0 justify-end ${className}`}>
      <div className="h-10 w-28 rounded-xl border border-border bg-surface animate-pulse" aria-hidden="true" />
    </div>
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
