import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "server/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["server/**/*.ts"],
      exclude: ["server/index.ts", "node_modules/**"],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
});
