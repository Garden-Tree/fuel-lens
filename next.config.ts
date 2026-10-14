import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Next.js 16.3 は `next dev` が AI コーディングエージェントを検知すると AGENTS.md / CLAUDE.md を
  // 自動生成する。本リポジトリは独自の CLAUDE.md を管理しているため無効化する。
  agentRules: false,

  // Sentry の環境名とリリースをクライアントにも埋め込む（VERCEL_ENV / VERCEL_GIT_COMMIT_SHA はビルド時のみ読める）。
  // 使い方は lib/sentry/options.ts。Vercel 以外（ローカル・CI）では空になり、環境名は NODE_ENV にフォールバックする。
  env: {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.VERCEL_ENV ?? "",
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },

  // Web Share Target（manifest の share_target: POST /share）のフォールバック。
  // 通常は Service Worker（public/sw.js）が横取りするのでここには届かない。SW がまだ無いときだけ
  // ブラウザがサーバーへ POST してくるので、本文（画像）を読まずに 303 で /app へ戻す。
  // redirects() はルーティングの最初に評価され、メソッドを問わず /share をここで処理する（app/share のルートは置かない）。
  // /share は proxy.ts（Clerk）の matcher からも除外している。
  async redirects() {
    return [
      {
        source: "/share",
        has: [{ type: "header", key: "content-type", value: "multipart/form-data.*" }],
        destination: "/app?action=share-unavailable",
        statusCode: 303 as const,
      },
      {
        source: "/share",
        destination: "/app",
        statusCode: 303 as const,
      },
    ];
  },
};

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

// 全て環境変数で制御する。SENTRY_AUTH_TOKEN が無いときはソースマップのアップロードとリリース作成を行わず、
// ビルドは警告なしで通る（CI・ローカル・DSN 未設定の環境）。ソースマップ無しでもエラー自体は届く。
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  // ビルドの内部情報を Sentry に送らない
  telemetry: false,
  silent: !process.env.CI,
  sourcemaps: { disable: !sentryAuthToken },
  release: { create: Boolean(sentryAuthToken), finalize: Boolean(sentryAuthToken) },
});
