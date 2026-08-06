import { expect, test } from "@playwright/test";

/**
 * Vue d'ensemble du dashboard (/dashboard) : le Centre d'animation (6
 * tuiles) et le Tableau d'équipe, montés pour tout rôle non-caissier — et le
 * filet anti « clic mort » qui retire le lien (pas la tuile) sur les chemins
 * réservés au propriétaire.
 *
 * Volontairement sobre : pas d'assertion sur les chiffres des tuiles
 * (dépendants du seed), seulement la présence des deux sections et la
 * discipline des liens par rôle.
 */
test.describe("dashboard — vue d'ensemble", () => {
  test.describe("avec session owner", () => {
    test.use({ storageState: "e2e/.auth/owner.json" });

    test("owner : Centre d'animation (6 tuiles) et Tableau d'équipe @smoke", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);

      await expect(page.getByText("Centre d'animation")).toBeVisible();
      for (const label of [
        "Brouillons",
        "QR jamais scannés",
        "En cours",
        "Stocks faibles (roue)",
        "Gains à remettre",
        "Tâches d'équipe",
      ]) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
      }

      await expect(page.getByText("Tableau d'équipe")).toBeVisible();

      // Le propriétaire a le droit d'ouvrir la tuile « Gains à remettre »
      // (/dashboard/participations) : elle reste un lien.
      await expect(
        page.locator("li", { hasText: "Gains à remettre" }).locator("a"),
      ).toHaveCount(1);
    });
  });

  test.describe("avec session editor", () => {
    test.use({ storageState: "e2e/.auth/editor.json" });

    test("editor : les deux sections sont rendues, mais Gains à remettre n'offre pas de lien", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);

      await expect(page.getByText("Centre d'animation")).toBeVisible();
      await expect(page.getByText("Tableau d'équipe")).toBeVisible();

      // /dashboard/participations est réservé au propriétaire
      // (liens-proprietaire.ts) : la tuile reste affichée, avec sa
      // description, mais sans href — le filet anti « clic mort ».
      const tile = page.locator("li", { hasText: "Gains à remettre" });
      await expect(tile).toBeVisible();
      await expect(tile).toContainText("retraits en attente en boutique");
      await expect(tile.locator("a")).toHaveCount(0);

      // Une tuile qui n'est PAS réservée au propriétaire reste un lien pour
      // l'éditeur : preuve que l'absence ci-dessus est ciblée, pas globale.
      await expect(
        page.locator("li", { hasText: "Brouillons" }).locator("a"),
      ).toHaveCount(1);
    });
  });

  test.describe("avec session cashier", () => {
    test.use({ storageState: "e2e/.auth/cashier.json" });

    test("cashier : /dashboard redirige vers la caisse (comportement préexistant)", async ({
      page,
    }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard\/redeem/);
    });
  });
});
