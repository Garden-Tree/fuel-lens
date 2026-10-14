import * as Sentry from "@sentry/nextjs";
import { getSentryOptions } from "@/lib/sentry/options";

// Edge ランタイムの初期化（現在 Edge を使うルートは無いが、将来のために置いている）。
Sentry.init(getSentryOptions());
