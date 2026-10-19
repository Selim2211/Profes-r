import { defineConfig } from "vitest/config";
import path from "node:path";

// `npm run eval`: quality checks against the real database and models (slow, uses model quota).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/eval/**/*.eval.ts"],
    globalSetup: ["tests/eval/global-setup.ts"],
    setupFiles: ["tests/eval/setup.ts"],
    fileParallelism: false, // both files write to one report file
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
