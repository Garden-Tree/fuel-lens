import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server Component / Route Handler / proxy.ts で未処理の例外を Sentry に送る。
// （DSN 未設定なら init されていないので何も起きない）
export const onRequestError = Sentry.captureRequestError;
