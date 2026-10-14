import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Sentry に送る前に個人情報・秘匿情報を落とす純粋関数群（instrumentation-client.ts / sentry.*.config.ts から使う）。
 *
 * - URL のクエリ文字列とハッシュは常に除去する（`?action=shared&t=<共有トークン>`、`#record-<記録ID>`）。
 * - `/api/analyze` のリクエスト本文（レシート/メーターの画像）とヘッダーは送らない。
 * - Cookie は常に送らない。ユーザーは ID だけを残し、メールアドレス・IP・ユーザー名は消す。
 */

const ANALYZE_PATH = "/api/analyze";

/** クエリ文字列とハッシュを落とした URL を返す（相対パスや不正な URL でも動く） */
export function stripUrlQueryAndHash(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

function isAnalyzeUrl(url: string | undefined): boolean {
  if (!url) return false;
  return stripUrlQueryAndHash(url).replace(/\/+$/, "").endsWith(ANALYZE_PATH);
}

function scrubString(value: unknown): unknown {
  return typeof value === "string" ? stripUrlQueryAndHash(value) : value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  const next = { ...data };
  // fetch / xhr は url、navigation は from / to に URL が入る
  for (const key of ["url", "from", "to"] as const) {
    if (key in next) next[key] = scrubString(next[key]);
  }
  return { ...breadcrumb, data: next };
}

export function scrubEvent<T extends ErrorEvent>(event: T): T {
  const request = event.request;
  if (request) {
    const analyze = isAnalyzeUrl(request.url);
    const next = { ...request };
    if (next.url) next.url = stripUrlQueryAndHash(next.url);
    delete next.query_string;
    delete next.cookies;
    if (analyze) {
      delete next.data;
      delete next.headers;
    }
    event.request = next;
  }

  if (event.user) {
    // ID 以外（email / ip_address / username など）は送らない
    event.user = event.user.id !== undefined ? { id: event.user.id } : undefined;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }
  return event;
}
