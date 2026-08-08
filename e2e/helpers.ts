import { expect, type Page } from "@playwright/test";

/** Comptes seedés (supabase/seed.sql) — mot de passe commun. */
export const E2E_PASSWORD = "Password123!";
export const E2E_USERS = {
  owner: "owner@e2e.local",
  editor: "editor@e2e.local",
  cashier: "cashier@e2e.local",
  // Org Stripe dédiée (l'index « un owner par utilisateur » impose un
  // compte séparé de owner@).
  stripeOwner: "stripe-owner@e2e.local",
} as const;

/** Connexion au dashboard avec un compte seedé. */
export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Ouvre une tuile CarteRepliable repliée par défaut (chantier
 * tuiles-checklist) si elle l'est encore. Le bouton de repli porte
 * l'aria-label « Développer « N. Titre — … » » ; certaines tuiles
 * (#statut, portes d'atelier, GuidedJourney) restent ouvertes et n'ont
 * pas ce bouton — dans ce cas on ne fait rien, la tuile est déjà là.
 */
export async function ouvrirTuile(page: Page, motifTitre: RegExp) {
  const bouton = page.getByRole("button", { name: motifTitre });
  if (await bouton.isVisible().catch(() => false)) {
    await bouton.click();
  }
}
