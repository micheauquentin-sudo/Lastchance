import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS, login } from "./helpers";

/**
 * Contrôle d'accès par rôle sur les comptes seedés (owner / editor /
 * cashier de la même organisation) : chacun se connecte, accède à son
 * poste de travail, et le dashboard reste inaccessible sans session.
 */
test.describe("rôles — accès au dashboard", () => {
  test("le parcours de connexion réel fonctionne (owner)", async ({ page }) => {
    // Un seul rôle en UI : editor et cashier sont déjà prouvés par le
    // projet setup — et le rate-limit authLogin (10 / 5 min / IP) rend
    // chaque connexion superflue coûteuse pour l'ensemble de la suite.
    await login(page, E2E_USERS.owner);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test.describe("avec session cashier partagée", () => {
    test.use({ storageState: "e2e/.auth/cashier.json" });

    test("le cashier accède à la caisse (son poste de travail)", async ({ page }) => {
      await page.goto("/dashboard/redeem");
      await expect(page.locator('input[name="code"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Vérifier" })).toBeVisible();
    });
  });

  test("sans session, le dashboard redirige vers la connexion @smoke", async ({
    page,
  }) => {
    await page.goto("/dashboard/redeem");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
  });

  test("un mauvais mot de passe est refusé @smoke", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_USERS.owner);
    await page.getByLabel("Mot de passe").fill(`${E2E_PASSWORD}-faux`);
    await page.getByRole("button", { name: "Se connecter" }).click();
    // Les deux refus sont légitimes : mauvais identifiants, ou le
    // rate-limit par IP déjà entamé par le reste de la suite.
    await expect(
      page.getByText(/Email ou mot de passe incorrect|Trop de tentatives/),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
