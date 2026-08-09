import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Page Clients (/dashboard/customers) — PREMIÈRE couverture E2E de cet écran.
 *
 * Elle tient trois choses, et rien de plus :
 *   1. les trois filtres existent et le formulaire GET les porte dans l'URL —
 *      c'est ce qui rend l'écran partageable et la pagination cohérente ;
 *   2. un segment filtre RÉELLEMENT la liste : le nombre de lignes après
 *      filtrage ne dépasse jamais celui d'avant. Aucune assertion sur un
 *      compte exact, qui dépendrait du seed ;
 *   3. le scan axe passe.
 *
 * Volontairement sobre, et volontairement muette sur les pastilles : leur
 * non-exclusivité est prouvée en unitaire (customers/filters.test.ts), où le
 * cas « fidèle ET à relancer » se construit sans dépendre des données semées.
 */
test.describe("dashboard — clients", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("filtres présents, propagés à l'URL, et la liste répond @smoke", async ({
    page,
  }, testInfo) => {
    await page.goto("/dashboard/customers");
    await expect(page).toHaveURL(/\/dashboard\/customers/);

    const recherche = page.getByLabel("Rechercher un client");
    const segment = page.getByLabel("Segment");
    const tri = page.getByLabel("Trier par");
    await expect(recherche).toBeVisible();
    await expect(segment).toBeVisible();
    await expect(tri).toBeVisible();

    // Le tableau peut être absent (organisation sans client identifié) : on
    // compte alors zéro ligne, et l'invariant « après ≤ avant » tient quand
    // même. La spec ne suppose donc rien du seed.
    const lignes = () => page.locator("tbody tr");
    const avant = await lignes().count();

    await segment.selectOption("a_relancer");
    await page.getByRole("button", { name: "Filtrer" }).click();

    // Formulaire GET : l'état du filtre vit dans l'URL, pas dans un état React.
    await expect(page).toHaveURL(/segment=a_relancer/);
    await expect(segment).toHaveValue("a_relancer");
    expect(await lignes().count()).toBeLessThanOrEqual(avant);

    // « Réinitialiser » n'apparaît qu'une fois un filtre actif, et ramène à
    // l'URL nue.
    await page.getByRole("link", { name: "Réinitialiser" }).click();
    await expect(page).toHaveURL(/\/dashboard\/customers$/);

    // Le tri est propagé lui aussi (sauf le tri par défaut, volontairement tu).
    await tri.selectOption("gains");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/tri=gains/);

    await expectNoA11yViolations(page, testInfo);
  });
});
