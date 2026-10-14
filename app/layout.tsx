import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/siteUrl";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import WebAnalytics from "@/components/WebAnalytics";

// 本文は Noto Sans JP、数字（`num` ユーティリティ）は JetBrains Mono（docs/design-system.md）。
// 日本語フォントは unicode-range で約 120 個に分割配信されるため preload しない。
// weight を列挙せず可変フォントで読み込む。列挙しても配信されるのは同じ可変フォントのファイルで、
// @font-face だけがウェイトの数だけ増えていた（描画をブロックする CSS が 283KB → 97KB、gzip 後 100KB → 34KB）。
// 600（font-semibold）は使わない（静的 3 ウェイトのときは 700 で描画されていたため、font-bold を使う）
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  preload: false,
  display: "swap",
});

// 可変フォントとして読み込む（weight を列挙すると Turbopack の next/font が URL を解決できないため。500 / 700 を使う）
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_NAME = "FuelLens";
const APP_DESCRIPTION =
  "レシートとトリップメーターが写った写真1枚をAIが読み取り、満タン法で燃費を自動計算・記録する燃費管理アプリ。";

/** metadataBase（OG 画像等の相対 URL の解決用）。NEXT_PUBLIC_APP_URL が無ければ本番 URL にフォールバック */
function resolveMetadataBase(): URL {
  return new URL(getSiteUrl());
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

// Next.js 16 では themeColor / viewport は metadata ではなく独立した viewport エクスポートに書く
export const viewport: Viewport = {
  themeColor: "#0B0F14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ClerkProvider・ToastProvider・UserSync・SupabaseStatusBanner はアプリ画面のレイアウト（app/(app)/layout.tsx）に置く。
  // 公開ページ（ランディング・燃費計算・規約）で Clerk と Supabase の JS を読み込まないため
  return (
    // フォントの CSS 変数は html に付ける（:root の --font-sans / --font-mono から参照するため）
    <html lang="ja" className={`${notoSansJp.variable} ${jetBrainsMono.variable}`}>
      <body className="antialiased bg-ground text-ink min-h-screen">
        <ServiceWorkerRegister />
        {children}
        <WebAnalytics />
      </body>
    </html>
  );
}
