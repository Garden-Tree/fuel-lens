import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry/options";

// ブラウザ側の Sentry 初期化。DSN が無ければ無効（lib/sentry/options.ts）。
Sentry.init(getSentryOptions());

// App Router のページ遷移を Sentry に伝える（トレース無効でもパンくずに使われる）
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
