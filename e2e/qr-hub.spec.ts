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

  /**
   * Le filtre par ÉTAT, ajouté avec `p_etat` (migration 20260923120000).
   *
   * Il est vérifié sur le seul état dont le seed garantit à la fois un présent
   * ET un absent : `en_pause` ne contient QUE « E2E En pause », et les
   * campagnes actives (« E2E Gagnante » et les autres) doivent en disparaître.
   * `brouillon` est vérifié en négatif seulement — le seed n'a pas de campagne
   * brouillon, et en inventer une pour la spec ferait porter au seed le poids
   * d'un test plutôt que d'un parcours.
   *
   * Le vocabulaire du `<select>` est celui des PASTILLES (`status-badge.tsx`),
   * pas celui de la colonne SQL : le commerçant lit « Ouverte aux joueurs »,
   * jamais « actif ».
   */
  test("le hub filtre par état, avec le vocabulaire des pastilles", async ({
    page,
  }) => {
    await page.goto("/dashboard/qr-codes");

    const etats = page.getByLabel("État");
    await expect(etats).toBeVisible();
    for (const libelle of [
      "Tous les états",
      "Brouillon",
      "Ouverte aux joueurs",
      "En pause",
      "Clôturée",
    ]) {
      await expect(etats.locator("option", { hasText: libelle })).toHaveCount(1);
    }

    // Sans filtre, les deux campagnes du seed sont là.
    await expect(
      page.locator("li", { hasText: "E2E En pause" }).first(),
    ).toBeVisible();

    // `en_pause` garde la campagne en pause et écarte les actives.
    await page.goto("/dashboard/qr-codes?etat=en_pause");
    await expect(
      page.locator("li", { hasText: "E2E En pause" }).first(),
    ).toBeVisible();
    await expect(page.locator("li", { hasText: "E2E Gagnante" })).toHaveCount(0);

    // `brouillon` n'en rend aucune : le seed n'a pas de campagne brouillon.
    await page.goto("/dashboard/qr-codes?etat=brouillon");
    await expect(page.locator("li", { hasText: "E2E En pause" })).toHaveCount(0);
    await expect(page.locator("li", { hasText: "E2E Gagnante" })).toHaveCount(0);
  });

  /**
   * « Jamais scannés » : la case n'a de sens que pour les affiches de campagne —
   * les sept autres modules n'ont pas de compteur de scans. Elle disparaît donc
   * dès qu'un autre type est sélectionné, au lieu d'offrir une commande qui
   * viderait la liste sans dire pourquoi.
   */
  test("la case « Jamais scannés » ne s'offre que là où elle veut dire quelque chose", async ({
    page,
  }) => {
    await page.goto("/dashboard/qr-codes");
    await expect(page.getByLabel("Jamais scannés")).toBeVisible();

    await page.goto("/dashboard/qr-codes?type=campaign&scans=jamais");
    await expect(page.getByLabel("Jamais scannés")).toBeChecked();

    await page.goto("/dashboard/qr-codes?type=pronostics");
    await expect(page.getByLabel("Jamais scannés")).toHaveCount(0);
  });
});
