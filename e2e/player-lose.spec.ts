import { expect, test } from "@playwright/test";

/**
 * Campagne garantie perdante (seed : un seul lot, perdant, limite
 * hebdomadaire) : le joueur perd, puis la rejoue est bloquée avec un
 * délai — le vrai comportement de la limite de jeu, jamais couvert par
 * l'ancien scénario qui s'arrêtait au premier résultat.
 */
const SLUG = "E2ELOSE1";

test.describe("parcours joueur — perte et délai de rejeu", () => {
  test("perdre puis être bloqué jusqu'à la prochaine fenêtre", async ({ page }) => {
    await page.goto(`/play/${SLUG}`);
    await page.getByRole("button", { name: "Lancer la roue" }).click();

    // Fin d'animation (~4,4 s) : campagne 100 % perdante. Au retry CI,
    // l'empreinte joueur est identique : la fenêtre hebdomadaire est
    // déjà consommée et le blocage arrive dès le premier lancer.
    const lost = page.getByText("Pas cette fois…");
    const blocked = page.getByText("Impossible de jouer");
    await expect(lost.or(blocked)).toBeVisible({ timeout: 30_000 });

    if (await lost.isVisible().catch(() => false)) {
      // Rejouer dans la même fenêtre : refus attendu.
      await page.goto(`/play/${SLUG}`);
      await page.getByRole("button", { name: "Lancer la roue" }).click();
      await expect(blocked).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByText(/Revenez dans/)).toBeVisible();
  });

  test("un slug inexistant affiche un message clair @smoke", async ({ page }) => {
    await page.goto("/play/slug-inexistant-e2e");
    await expect(page.getByText("Ce lien de jeu n'existe pas.")).toBeVisible();
  });
});
