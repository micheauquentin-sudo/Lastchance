import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Vue d'ensemble du dashboard (/dashboard), après la refonte clarté : UNE
 * histoire au lieu de quatre systèmes de guidage empilés.
 *
 * Ce que la spec tient :
 *   1. le hero « Votre prochaine action » existe et porte un vrai bouton — la
 *      page n'en avait aucun ;
 *   2. la section « Où en sont vos animations » garde son nom accessible et ses
 *      6 tuiles `<li>` (le tableau d'équipe y est fondu, il n'a plus de carte
 *      ni de landmark à lui) ;
 *   3. le filet anti « clic mort » : sur un chemin réservé au propriétaire,
 *      c'est le LIEN qui tombe, pas la tuile ;
 *   4. « Vos résultats » est affiché en permanence — la page ne change plus de
 *      forme au premier événement mesuré.
 *
 * Volontairement sobre : aucune assertion sur les chiffres (dépendants du
 * seed). Les tests editor/cashier ne tournent que sur mobile : ils prouvent une
 * discipline de liens, pas un rendu, et trois navigateurs pour cela coûtent
 * sans rien apprendre de plus.
 */
test.describe("dashboard — vue d'ensemble", () => {
  test.describe("avec session owner", () => {
    test.use({ storageState: "e2e/.auth/owner.json" });

    test("owner : hero, section d'animations (6 tuiles) et résultats @smoke", async ({
      page,
    }, testInfo) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);

      // 1. UNE seule réponse en haut d'écran, avec un vrai bouton.
      const hero = page
        .locator("section", { hasText: "Votre prochaine action" })
        .first();
      await expect(hero.getByText("Votre prochaine action")).toBeVisible();
      await expect(hero.getByRole("link").first()).toBeVisible();

      // 2. La section fusionnée garde son nom accessible et ses six tuiles.
      const centre = page.getByRole("region", {
        name: "Où en sont vos animations",
      });
      await expect(centre).toBeVisible();
      // Les six tuiles ont leur propre liste nommée, distincte de celle des
      // coups de main : les deux sont des <li> dans le même landmark.
      const tuiles = centre.getByRole("list", { name: "Repères d'animation" });
      for (const label of [
        "Brouillons",
        "QR jamais scannés",
        "En cours",
        "Stocks faibles (roue)",
        "Gains à remettre",
        "Tâches d'équipe",
      ]) {
        await expect(centre.getByText(label, { exact: true })).toBeVisible();
      }
      // Les coups de main sont DANS cette section, plus dans une carte à part.
      await expect(
        centre.getByText("Les prochains coups de main"),
      ).toBeVisible();
      await expect(page.getByText("Tableau d'équipe")).toHaveCount(0);

      // 3. Le propriétaire a le droit d'ouvrir « Gains à remettre » : la tuile
      //    reste un lien. On scope à la liste des tuiles — la liste des coups
      //    de main, dans le même landmark, peut porter un <li> qui mentionne
      //    les mêmes mots (« Tester les QR jamais scannés »).
      await expect(
        tuiles.locator("li", { hasText: "Gains à remettre" }).locator("a"),
      ).toHaveCount(1);

      // 4. Les repères ne disparaissent plus au premier événement mesuré.
      const resultats = page.getByRole("region", { name: "Vos résultats" });
      await expect(resultats).toBeVisible();
      for (const label of ["Scans QR", "Tours joués", "Lots gagnés", "Participations"]) {
        await expect(resultats.getByText(label, { exact: true })).toBeVisible();
      }
      // La tuile doublon a disparu (même fait, autre calcul, autre nombre).
      await expect(page.getByText("Gains à valider")).toHaveCount(0);

      // Le vocabulaire d'analyste ne s'affiche plus à l'écran.
      for (const interdit of [
        "Vues qualifiées",
        "Rédemption",
        "Marge attribuable",
        "consentement marketing",
      ]) {
        await expect(page.getByText(interdit)).toHaveCount(0);
      }

      await expectNoA11yViolations(page, testInfo);
    });
  });

  test.describe("avec session editor", () => {
    test.use({ storageState: "e2e/.auth/editor.json" });

    test("editor : la tuile Gains à remettre reste lisible, sans lien", async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith("mobile"),
        "Discipline de liens : un seul contexte suffit",
      );

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard$/);

      const centre = page.getByRole("region", {
        name: "Où en sont vos animations",
      });
      await expect(centre).toBeVisible();
      const tuiles = centre.getByRole("list", { name: "Repères d'animation" });

      // /dashboard/participations est réservé au propriétaire
      // (liens-proprietaire.ts) : la tuile reste affichée, avec sa
      // description, mais sans href — le filet anti « clic mort ».
      const tile = tuiles.locator("li", { hasText: "Gains à remettre" });
      await expect(tile).toBeVisible();
      await expect(tile).toContainText("retraits en attente en boutique");
      await expect(tile.locator("a")).toHaveCount(0);

      // « Brouillons » n'est plus un lien NON PLUS, et pour une autre raison :
      // sa seule destination était « Découvrir », un catalogue de modules qui
      // ne contient aucun brouillon. Sans destination honnête, elle redevient
      // un repère chiffré — et le dit.
      const brouillons = tuiles.locator("li", { hasText: "Brouillons" });
      await expect(brouillons).toContainText("dans la page de chaque module");
      await expect(brouillons.locator("a")).toHaveCount(0);

      // Une tuile ni réservée ni sans destination reste un lien pour
      // l'éditeur : preuve que les absences ci-dessus sont ciblées.
      await expect(
        tuiles.locator("li", { hasText: "QR jamais scannés" }).locator("a"),
      ).toHaveCount(1);
    });
  });

  test.describe("avec session cashier", () => {
    test.use({ storageState: "e2e/.auth/cashier.json" });

    test("cashier : /dashboard redirige vers la caisse (comportement préexistant)", async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith("mobile"),
        "Redirection : un seul contexte suffit",
      );

      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/dashboard\/redeem/);
    });
  });
});
