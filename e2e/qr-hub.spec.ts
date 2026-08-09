import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * /dashboard/qr-codes après son passage en HUB : la page ne liste plus les
 * seules affiches de campagnes (`qr_codes`), elle liste les QR et les liens
 * publics des huit modules, filtrables par TYPE DE JEU.
 *
 * Ce que la spec tient, et rien de plus :
 *   1. le sélecteur « Type de jeu » existe et porte les libellés du catalogue
 *      (`EXPERIENCE_CATALOG`) — pas les `kind` SQL : le commerçant lit
 *      « Jeux instantanés », jamais « campaign » ;
 *   2. un module du seed (le championnat de pronostics « Championnat E2E »)
 *      apparaît sous forme de carte, ce que l'ancienne page ne faisait pas ;
 *   3. `?type=pronostics` écarte réellement les cartes de campagne — le filtre
 *      est appliqué en base, pas décoratif ;
 *   4. la page reste sans violation a11y bloquante.
 *
 * Aucune assertion sur des compteurs : ils dépendent du seed et des runs
 * précédents. La carte de campagne est reconnue par « Personnaliser », son
 * bouton de studio QR — un geste qui n'existe que pour elle.
 */
test.describe("hub QR par type de jeu", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le hub filtre par type et montre les liens des modules", async ({
    page,
  }, testInfo) => {
    await page.goto("/dashboard/qr-codes");

    // 1. Le sélecteur de type, avec le vocabulaire commerçant.
    const selecteur = page.getByLabel("Type de jeu");
    await expect(selecteur).toBeVisible();
    for (const libelle of ["Tous les jeux", "Jeux instantanés", "Pronostics"]) {
      await expect(
        selecteur.locator("option", { hasText: libelle }),
      ).toHaveCount(1);
    }

    // 2. Un module actif du seed a sa carte, badgée de son type.
    const cartePronostic = page
      .locator("li", { hasText: "Championnat E2E" })
      .first();
    await expect(cartePronostic).toBeVisible();
    await expect(cartePronostic.getByText("Pronostics").first()).toBeVisible();

    await expectNoA11yViolations(page, testInfo);

    // 3. Filtré sur les pronostics, plus aucune carte de campagne — le bouton
    //    du studio QR, propre à `QrCodeCard`, disparaît de la page.
    await page.goto("/dashboard/qr-codes?type=pronostics");
    await expect(
      page.locator("li", { hasText: "Championnat E2E" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Personnaliser" }),
    ).toHaveCount(0);
  });
});
