import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { BrandMark } from "@/components/ui";

export const ISSUES_URL = "https://github.com/Garden-Tree/fuel-lens/issues";
export const ENACTED_ON = "2026年10月12日";

/** ログイン不要の公開ページ（規約・燃費計算）の共通ヘッダー。ロゴ → トップ、右に「トップへ戻る」 */
export function PublicPageHeader() {
  return (
    <header className="border-b border-line pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-[720px] items-center justify-between px-4">
        <Link href="/" aria-label="FuelLens のトップへ" className="rounded-lg">
          <BrandMark className="text-base" />
        </Link>
        <Link href="/" className="inline-flex min-h-10 items-center gap-1 text-sm text-sub hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          トップへ戻る
        </Link>
      </div>
    </header>
  );
}

/** プライバシーポリシー・利用規約の共通レイアウト（ログイン不要、タブバーなし） */
export function LegalPage({ title, enactedOn, children }: { title: string; enactedOn: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ground font-sans text-ink">
      <PublicPageHeader />
      <main className="mx-auto max-w-[720px] px-4 pb-16 pt-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-xs text-sub">制定日: {enactedOn}</p>
        <div className="mt-6 space-y-8 text-[15px] leading-7 text-ink/90 [&_a]:break-all [&_a]:text-accent [&_a]:underline [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_p+p]:mt-2 [&_p+ul]:mt-2">
          {children}
        </div>
        <nav aria-label="関連ページ" className="mt-12 flex gap-6 border-t border-line pt-6 text-sm text-sub">
          <Link href="/privacy" className="hover:text-ink">プライバシーポリシー</Link>
          <Link href="/terms" className="hover:text-ink">利用規約</Link>
        </nav>
      </main>
    </div>
  );
}
