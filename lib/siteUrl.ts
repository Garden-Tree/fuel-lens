/** 本番の公開 URL（NEXT_PUBLIC_APP_URL が未設定・不正なときのフォールバック） */
export const DEFAULT_SITE_URL = "https://fuel-lens.gadelog.com";

/** robots.txt / sitemap.xml 用のサイト URL（末尾スラッシュなし）。有効な NEXT_PUBLIC_APP_URL を優先する */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // 不正な値はフォールバックへ
    }
  }
  return DEFAULT_SITE_URL;
}
