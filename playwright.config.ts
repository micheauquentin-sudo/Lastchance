import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E du parcours joueur, exécutés contre un environnement réel
 * (staging ou local avec Supabase configuré) :
 *
 *   E2E_BASE_URL=https://staging.exemple.fr \
 *   E2E_PLAY_SLUG=<slug d'un QR code actif> \
 *   npm run test:e2e
 *
 * Sans ces variables, les tests sont ignorés proprement (skip).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // Le parcours joueur est mobile-first : on teste comme un client.
    ...devices["iPhone 13"],
  },
});
