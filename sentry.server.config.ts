import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry/options";

// Node.js ランタイム（Route Handler / Server Component / proxy.ts）の初期化。instrumentation.ts から読み込まれる。
Sentry.init(getSentryOptions());
