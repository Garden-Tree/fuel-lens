import Link from "next/link";
import { Fuel, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto w-14 h-14 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-900/20">
          <Fuel className="w-7 h-7 text-white fill-current" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-mono text-gray-500">404</p>
          <h1 className="text-xl font-bold">ページが見つかりません</h1>
          <p className="text-sm text-gray-400 leading-relaxed">
            お探しのページは移動または削除された可能性があります。
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <Home className="w-4 h-4" aria-hidden="true" /> トップページへ
        </Link>
      </div>
    </main>
  );
}
