import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from '@clerk/nextjs';
import "./globals.css";
import UserSync from "@/components/UserSync";
import SupabaseStatusBanner from "@/components/SupabaseStatusBanner";
import { ToastProvider } from "@/components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = "FuelLens";
const APP_DESCRIPTION =
  "レシートとトリップメーターが写った写真1枚をAIが読み取り、満タン法で燃費を自動計算・記録する燃費管理アプリ。";

/** NEXT_PUBLIC_APP_URL が有効な URL のときだけ metadataBase に使う（OG 画像等の相対 URL 解決用） */
function resolveMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
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
    card: "summary",
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

// Next.js 16 では themeColor / viewport は metadata ではなく独立した viewport エクスポートに書く
export const viewport: Viewport = {
  themeColor: "#030712",
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
    <ClerkProvider>
      <html lang="ja">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-950 text-white min-h-screen`}
        >
          <ToastProvider>
            <UserSync />
            <SupabaseStatusBanner />
            {children}
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
