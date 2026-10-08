import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig.json の `paths: { "@/*": ["./*"] }` と同じ解決にする
const rootDir = fileURLToPath(new URL(".", import.meta.url));
const alias = { "@": rootDir.replace(/[\/]+$/, "") };

// Vitest 4 では workspace ファイルが廃止され、`test.projects` でプロジェクトを分ける。
// - node: lib/ の純粋ロジックの単体テスト（tests/**/*.test.ts）
// - dom : コンポーネントテスト（tests/components/**/*.test.tsx、jsdom + Testing Library）
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      reporter: ["text", "lcov"],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/components/**", "**/node_modules/**"],
        },
      },
      {
        // JSX は tsconfig の jsx: "react-jsx" に従い、自動ランタイムで変換される（import React 不要）
        resolve: { alias },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.ts"],
          css: false,
        },
      },
    ],
  },
});
