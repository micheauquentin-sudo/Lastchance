import { defineConfig, devices } from "@playwright/test";

/**
 * Tests E2E de fumée + accessibilité du SITE VITRINE (`site/`), un projet
 * Next indépendant de l'application commerçant (`src/`).
 *
 * Config séparée de `playwright.config.ts` racine, à dessein : le config
 * racine fixe `testDir: "./e2e"` et un `webServer` qui démarre l'APPLICATION
 * sur le port 3000 avec Supabase local. Les specs du site n'ont besoin d'aucun
 * des deux — les y ajouter aurait fait tourner ces pages contre la mauvaise
 * application. `webServer` ci-dessous construit puis démarre `site/` sur le
 * port 3001 (son script `start` dédié), sans toucher au port 3000.
 *
 * Aucune donnée serveur à seeder : le site est statique/marketing, aucun
 * compte, aucune session — juste `/`, `/tarifs`, `/faq`, `/contact`.
 */
export default defineConfig({
  testDir: "./e2e-site",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["json", { outputFile: "playwright-site-report.json" }]]
    : "list",
  webServer: {
    command: "npm run build && npm run start",
    cwd: "site",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "site-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "site-mobile",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
