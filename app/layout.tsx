import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Noto_Sans_JP } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import { clerkLocalization } from "@/lib/clerkLocalization";
import "./globals.css";
import { getSiteUrl } from "@/lib/siteUrl";
import UserSync from "@/components/UserSync";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import SupabaseStatusBanner from "@/components/SupabaseStatusBanner";
import { ToastProvider } from "@/components/Toast";
import WebAnalytics from "@/components/WebAnalytics";

// 本文は Noto Sans JP、数字（`num` ユーティリティ）は JetBrains Mono（docs/design-system.md）。
// 日本語フォントは unicode-range で分割配信されるため preload しない
const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700"],
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
  return (
    <ClerkProvider localization={clerkLocalization}>
      {/* フォントの CSS 変数は html に付ける（:root の --font-sans / --font-mono から参照するため） */}
      <html lang="ja" className={`${notoSansJp.variable} ${jetBrainsMono.variable}`}>
        <body className="antialiased bg-ground text-ink min-h-screen">
          <ToastProvider>
            <UserSync />
            <ServiceWorkerRegister />
            <SupabaseStatusBanner />
            {children}
          </ToastProvider>
          <WebAnalytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
