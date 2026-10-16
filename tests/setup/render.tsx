import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { AppShell } from "@/components/AppShell";

function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

/** アプリ共通のプロバイダ（ToastProvider）で包んで描画する */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">): RenderResult {
  return render(ui, { wrapper: Providers, ...options });
}

function ShellProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}

/**
 * アプリ画面のページを app/(app)/layout.tsx と同じく、画面の枠（AppShell: タブバー・サイドバー・スキャンメニュー）の中に描画する。
 * ナビゲーションやスキャンメニューを使うページのテスト用
 */
export function renderInAppShell(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">): RenderResult {
  return render(ui, { wrapper: ShellProviders, ...options });
}
