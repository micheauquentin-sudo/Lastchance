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
  // UN SEUL worker en CI. Diagnostic du 2026-07-28, établi sur les traces
  // Playwright d'un run rouge : quatre specs sans rapport (newsletter,
  // progression, pronostics ×2) sont tombés ensemble, et leurs captures
  // montrent toutes la MÊME signature — l'action serveur encore EN VOL au
  // moment de l'expiration : bouton « Envoi en cours… » [disabled], bouton
  // « Clôture… » [disabled] dialogue encore ouvert, saison toujours
  // « En cours » avec son bouton « Clore la saison » intact.
  //
  // Ce ne sont pas des défauts applicatifs : le même commit passe à la
  // relance, et le serveur est prouvé par pgTAP. C'est de la famine de
  // ressources — 4 vCPU portaient simultanément le serveur Next de
  // production, la pile Supabase Docker et DEUX navigateurs (le défaut de
  // Playwright est `cpus/2`). Signe que ce n'est pas un aléa ponctuel :
  // `retries: 1` était déjà actif, ces tests ont donc échoué DEUX fois de
  // suite.
  //
  // Rendre les délais plus longs n'aurait traité que le symptôme, et pas
  // pour les assertions déjà à 15–30 s. On enlève la cause : le serveur ne
  // partage plus le processeur qu'avec un seul navigateur. Coût assumé —
  // le job E2E s'allonge ; un job plus lent qui dit la vérité vaut mieux
  // qu'un job rapide qui échoue une fois sur deux sur du code intact.
  workers: process.env.CI ? 1 : undefined,
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
