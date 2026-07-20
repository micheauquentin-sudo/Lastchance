import { expect, type Page } from "@playwright/test";

/** Comptes seedés (supabase/seed.sql) — mot de passe commun. */
export const E2E_PASSWORD = "Password123!";
export const E2E_USERS = {
  owner: "owner@e2e.local",
  editor: "editor@e2e.local",
  cashier: "cashier@e2e.local",
} as const;

/** Connexion au dashboard avec un compte seedé. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
