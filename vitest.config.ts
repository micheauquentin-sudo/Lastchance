import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    env: {
      SPIN_TOKEN_SECRET: "test-secret-not-for-production",
      PLAYER_KEY_SALT: "test-salt",
    },
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
