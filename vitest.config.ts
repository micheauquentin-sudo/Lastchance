import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // `.tsx` accepté depuis 2026-08-04 : sans lui, un test de composant
    // n'est pas « rouge », il n'est pas COLLECTÉ — le pire des silences.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // `node` reste le défaut : les ~2860 tests de logique n'ont aucun besoin
    // d'un DOM, et le leur imposer coûterait du temps à chaque exécution. Un
    // fichier qui rend un composant demande le sien par la directive
    // `// @vitest-environment happy-dom` en tête, donc le coût est payé par
    // ceux qui en profitent et par personne d'autre.
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
