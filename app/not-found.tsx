import Link from "next/link";
import { Home } from "lucide-react";
import { BrandMark } from "@/components/ui/BrandMark";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-ground text-ink flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center text-xl">
          <BrandMark />
        </div>
        <div className="space-y-2">
          <p className="num text-xs text-sub">404</p>
          <h1 className="text-xl font-bold">ページが見つかりません</h1>
          <p className="text-sm text-sub leading-relaxed">
            お探しのページは移動または削除された可能性があります。
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 px-5 rounded-xl bg-accent text-ground hover:bg-accent/90 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ground"
        >
          <Home className="w-4 h-4" aria-hidden="true" /> トップページへ
        </Link>
      </div>
    </main>
  );
}
