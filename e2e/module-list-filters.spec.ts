import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * LES SEPT LISTES DE MODULES, VÉRIFIÉES SUR UNE SEULE.
 *
 * Quiz, calendriers, chasses, pronostics, jackpots, passeports et événements
 * reçoivent le MÊME formulaire (`components/dashboard/module-list-filters.tsx`)
 * et le même trio recherche / état / pagination. Sept specs jumelles
 * prouveraient sept fois la même chose et coûteraient sept fois leur durée sur
 * trois navigateurs ; ce qu'elles attraperaient de plus — une page qui aurait
 * oublié de câbler le composant — se voit au typecheck, pas au runtime.
 *
 * Les quiz font l'échantillon parce que le seed leur donne un cas non
 * dégénéré : « Quiz du Comptoir E2E », ACTIF, donc à la fois trouvable par
 * recherche et exclu par un filtre d'état sur « brouillon ».
 *
 * Ce que la spec tient :
 *   1. le formulaire existe, avec ses deux commandes et le vocabulaire des
 *      pastilles (« Ouverte aux joueurs », jamais « active ») ;
 *   2. une recherche qui ne correspond à rien RÉDUIT réellement la liste, et
 *      le dit sans proposer d'en créer un — le module n'est pas vide, il est
 *      masqué, et « Créez le premier ! » y ferait naître un doublon ;
 *   3. une recherche qui correspond garde la ligne ;
 *   4. le filtre d'état écarte sur un autre axe que la recherche ;
 *   5. « Réinitialiser » ramène la liste entière ;
 *   6. la page filtrée reste sans violation a11y bloquante.
 */
test.describe("listes de modules — recherche, état, remise à zéro", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  const QUIZ_SEED = "Quiz du Comptoir E2E";

  test("la liste des quiz se filtre par nom et par état", async ({
    page,
  }, testInfo) => {
    await page.goto("/dashboard/quiz");

    // 1. Les deux commandes, et les mots que portent les pastilles.
    const recherche = page.getByLabel("Rechercher");
    const etat = page.getByLabel("État");
    await expect(recherche).toBeVisible();
    for (const libelle of [
      "Tous les états",
      "Brouillon",
      "Ouverte aux joueurs",
      "Clôturée",
    ]) {
      await expect(etat.locator("option", { hasText: libelle })).toHaveCount(1);
    }
    await expect(page.getByText(QUIZ_SEED)).toBeVisible();

    // 2. Une recherche sans correspondance vide la liste — et l'écran ne
    //    propose PAS d'en créer un : ce serait un doublon de ce que le filtre
    //    cache.
    await recherche.fill("zzz-aucun-quiz-ne-porte-ce-nom");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page.getByText(QUIZ_SEED)).toHaveCount(0);
    await expect(
      page.getByText("Aucun quiz ne correspond à ce filtre."),
    ).toBeVisible();
    await expect(page.getByText("Créez le premier !")).toHaveCount(0);

    await expectNoA11yViolations(page, testInfo);

    // 3. Une recherche qui correspond garde la ligne — la réduction du point 2
    //    vient bien du terme, pas d'une liste cassée.
    await page.goto("/dashboard/quiz?q=Comptoir");
    await expect(page.getByText(QUIZ_SEED)).toBeVisible();

    // 4. Un autre axe : le quiz du seed est ACTIF, « brouillon » l'écarte.
    await page.goto("/dashboard/quiz?statut=draft");
    await expect(page.getByText(QUIZ_SEED)).toHaveCount(0);
    await expect(page.getByLabel("État")).toHaveValue("draft");

    // 5. « Réinitialiser » ramène tout, y compris le champ de recherche.
    await page.getByRole("link", { name: "Réinitialiser" }).click();
    await expect(page.getByText(QUIZ_SEED)).toBeVisible();
    await expect(page.getByLabel("État")).toHaveValue("");
    await expect(page.getByLabel("Rechercher")).toHaveValue("");
  });
});
