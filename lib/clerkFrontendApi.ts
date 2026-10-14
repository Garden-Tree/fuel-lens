/**
 * Clerk の Publishable Key（`pk_live_<base64>` / `pk_test_<base64>`）から Frontend API のオリジンを取り出す。
 * base64 の中身は `<FAPI のホスト>$`（本番は `clerk.fuel-lens.gadelog.com$`）。
 * 画面の `<link rel="preconnect">` に使うだけなので、形式が違うときは null を返して何もしない。
 */
export function clerkFrontendApiOrigin(publishableKey: string | undefined): string | null {
  const match = /^pk_(?:live|test)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey?.trim() ?? "");
  if (!match) return null;
  let decoded: string;
  try {
    decoded = atob(match[1].replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return null;
  }
  if (!decoded.endsWith("$")) return null;
  const host = decoded.slice(0, -1);
  // ホスト名（とポート）だけを許す。パスや空白が混ざっていれば使わない
  if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return null;
  return `https://${host}`;
}
