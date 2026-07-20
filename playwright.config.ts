import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E des parcours réels (joueur, caisse, pronostics, rôles),
 * exécutés contre l'app démarrée sur un Supabase local seedé
 * (supabase/seed.sql — données déterministes : campagnes garantie
 * gagnante / garantie perdante / grattage, comptes owner/editor/
 * cashier, participation à retirer, championnat de pronostics).
 *
 * En CI : le job « e2e » démarre la stack et échoue si aucun test ne
 * s'exécute. En local : nécessite Docker (supabase start + seed) puis
 * `npm run build && npm start` et `npm run test:e2e`.
 * Contre un autre environnement : E2E_BASE_URL=https://…
 *
 * Trois projets : les parcours joueur sont mobile-first (Chrome
 * Android + Safari iOS simulés), plus un smoke desktop (@smoke).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-report.json" }]]
    : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "desktop-smoke",
      use: { ...devices["Desktop Chrome"] },
      grep: /@smoke/,
    },
  ],
});
