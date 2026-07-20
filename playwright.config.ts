import { join } from "node:path";
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
  // Génère la « caméra » y4m (QR du code seedé) pour le spec scanner.
  globalSetup: "./e2e/global-setup.ts",
  // WebKit sous contention CI (2 navigateurs / 4 vCPU) est lent :
  // marge large pour les parcours à plusieurs spins.
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-report.json" }]]
    : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    // En CI, l'app est servie via un proxy TLS auto-signé (cookies
    // Secure : WebKit les refuse sur http://localhost, contrairement à
    // Chromium — sans HTTPS, aucune session ne tient sur Safari).
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      // Connexions uniques par rôle → sessions réutilisées partout
      // (rate-limit authLogin : 10 / 5 min / IP).
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        // Caméra réelle simulée : Chromium « filme » le QR seedé — le
        // scanner est testé sur son vrai pipeline, sans patch JS.
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-video-capture=${join(__dirname, "e2e/.artifacts/qr.y4m")}`,
          ],
        },
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
      dependencies: ["setup"],
    },
    {
      name: "desktop-smoke",
      use: { ...devices["Desktop Chrome"] },
      grep: /@smoke/,
      dependencies: ["setup"],
    },
  ],
});
