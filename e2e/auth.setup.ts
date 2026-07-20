import { test as setup } from "@playwright/test";
import { E2E_USERS, login } from "./helpers";

/**
 * Connexion unique par rôle, sessions partagées ensuite via storageState :
 * les specs n'ouvrent plus de session — indispensable face au rate-limit
 * authLogin (10 / 5 min / IP) que les projets parallèles épuisaient.
 * (roles.spec.ts continue de tester le VRAI parcours de connexion.)
 */
for (const [role, email] of Object.entries(E2E_USERS)) {
  setup(`session ${role}`, async ({ page }) => {
    await login(page, email);
    await page.context().storageState({ path: `e2e/.auth/${role}.json` });
  });
}
