import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tsconfig.json の `paths: { "@/*": ["./*"] }` と同じ解決にする
const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir.replace(/[\\/]+$/, ""),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
