import type { BrowserOptions, ErrorEvent } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * クライアント・サーバー（Node / Edge）共通の Sentry 初期化オプション。
 *
 * - `NEXT_PUBLIC_SENTRY_DSN` が未設定なら `enabled: false`（何も送らず、コンソールにも出さない）。
 * - エラーのみを集める（`tracesSampleRate: 0`、Session Replay なし）。無料枠のエラー数を節約するため。
 * - 環境名とリリースは next.config.ts が `env` で埋め込む（クライアントでも読めるようにするため）。
 *   process.env.X は静的に書かないとクライアントバンドルに埋め込まれない。
 */
export function getSentryOptions(): BrowserOptions {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
    // v11 で sendDefaultPii は dataCollection に置き換わった。自動収集する個人情報・リクエスト内容をすべて切る
    // （ユーザー ID は UserSync が setUser で手動設定する）
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend: (event: ErrorEvent) => scrubEvent(event),
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
