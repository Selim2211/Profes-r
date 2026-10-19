import { defineConfig } from "vitest/config";
import path from "node:path";

// `npm run reembed` and other maintenance tools: they run against the real database and models.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/tools/**/*.tool.ts"],
    setupFiles: ["tests/eval/setup.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
