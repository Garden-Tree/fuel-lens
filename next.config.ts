import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16.3 は `next dev` が AI コーディングエージェントを検知すると AGENTS.md / CLAUDE.md を
  // 自動生成する。本リポジトリは独自の CLAUDE.md を管理しているため無効化する。
  agentRules: false,

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

export default nextConfig;
