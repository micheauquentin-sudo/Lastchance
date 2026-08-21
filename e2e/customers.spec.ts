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

  /**
   * LES DEUX SEGMENTS « RÉSERVER » (VIT-4) — et le seul profil qui les porte.
   *
   * Le seed pose deux réservations sur un créneau PASSÉ ET FERMÉ d'E2E Café :
   * Gaston (`gaston@e2e.local`) est `checked_in`, niouz1 est `confirmed` sans
   * check-in. Gaston est le SEUL e-mail de `participations` chez E2E Café,
   * donc le seul à apparaître dans la liste — qui part des joueurs, pas des
   * réservations. Il est à la fois « a réservé » et « est venu ».
   *
   * L'assertion porte sur son E-MAIL et non sur un prénom : `first_name` est
   * nullable depuis ce lot, et un profil sans prénom rend « — ».
   */
  test("les segments « A réservé » et « Est venu » rendent le profil semé", async ({
    page,
  }) => {
    const segment = page.getByLabel("Segment");
    const filtrer = page.getByRole("button", { name: "Filtrer" });

    for (const [valeur, pastille] of [
      ["a_reserve", "A réservé"],
      ["venu", "Est venu"],
    ] as const) {
      await page.goto("/dashboard/customers");
      await segment.selectOption(valeur);
      await filtrer.click();
      await expect(page).toHaveURL(new RegExp(`segment=${valeur}`));

      const ligne = page.locator("tbody tr", {
        hasText: "gaston@e2e.local",
      });
      await expect(ligne).toHaveCount(1, { timeout: 20_000 });
      // La pastille est rendue depuis les colonnes de la RPC, pas dérivée de
      // `wins` : elle doit être là sur la ligne filtrée par ce même fait.
      await expect(ligne.getByText(pastille)).toBeVisible();
    }
  });

  /**
   * L'EXPORT PORTE LES DEUX COLONNES DE PLUS, et la dernière ligne de
   * troncature reste intacte : elle n'est pas une ligne de données et ne gagne
   * donc aucune colonne. On lit l'EN-TÊTE, jamais un nombre de lignes — le seed
   * évolue, l'en-tête est un contrat.
   *
   * `page.context().request` et non un `fetch` nu : la session du propriétaire
   * vit dans les cookies du contexte, et la route refuse tout le reste par 401.
   */
  test("l'export CSV porte a_reserve et est_venu dans son en-tête", async ({
    page,
  }) => {
    const reponse = await page
      .context()
      .request.get("/dashboard/customers/export");
    expect(reponse.status()).toBe(200);

    const premiere = (await reponse.text()).split("\n")[0] ?? "";
    expect(premiere).toContain(
      "email;prenom;gains;recuperes;premier_gain;dernier_gain;a_reserve;est_venu",
    );
  });
});
