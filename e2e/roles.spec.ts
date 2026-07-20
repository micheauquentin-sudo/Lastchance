import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS, login } from "./helpers";

/**
 * Contrôle d'accès par rôle sur les comptes seedés (owner / editor /
 * cashier de la même organisation) : chacun se connecte, accède à son
 * poste de travail, et le dashboard reste inaccessible sans session.
 */
test.describe("rôles — accès au dashboard", () => {
  test("owner, editor et cashier se connectent et voient le dashboard", async ({
    page,
  }) => {
    for (const email of [E2E_USERS.owner, E2E_USERS.editor, E2E_USERS.cashier]) {
      await login(page, email);
      await expect(page).toHaveURL(/\/dashboard/);
      // Déconnexion par purge de session (nouvelle identité au tour suivant).
      await page.context().clearCookies();
    }
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
    await expect(page.getByText("Email ou mot de passe incorrect")).toBeVisible({
      timeout: 10_000,
    });
  });
});
