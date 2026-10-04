import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 16.3 は `next dev` が AI コーディングエージェントを検知すると AGENTS.md / CLAUDE.md を
  // 自動生成する。本リポジトリは独自の CLAUDE.md を管理しているため無効化する。
  agentRules: false,
};

export default nextConfig;
