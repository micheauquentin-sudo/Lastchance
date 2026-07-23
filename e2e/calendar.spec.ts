import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parcours joueur SUIVABLE du Calendrier / campagne quotidienne (seed
 * supabase/seed.sql : org « E2E Café », addon_calendar actif). Calendrier
 * « Calendrier de l'Avent E2E », thème Noël, actif, public_slug déterministe
 * `e2e-calendar`, 3 cases :
 *   · case 1 — `content`, unlock_at PASSÉ → OUVRABLE aujourd'hui ;
 *   · case 2 — `lot` (stock fini), unlock_at PASSÉ → OUVRABLE aujourd'hui ;
 *   · case 3 — `content`, unlock_at à +2 jours → VERROUILLÉE (le gating
 *     temporel est serveur-autoritatif : la case future N'EST PAS ouvrable).
 *
 * Le module est À DISTANCE : aucune présence physique, le seul gating est
 * TEMPOREL. La couverture porte sur l'AFFICHAGE public (grille verrouillée /
 * ouvrable, panneau d'inscription au rappel, accessibilité), sur l'OUVERTURE
 * réelle d'une case `content` (sans dépense de stock, rejouable — cookie joueur
 * vierge par navigateur) et sur la 404 générique d'un slug inconnu.
 *
 * Locators rigoureux : getByRole + aria-label exact + regex ciblées — jamais un
 * getByText susceptible de matcher deux éléments.
 */
const CALENDAR_SLUG = "e2e-calendar";
const CALENDAR_NAME = "Calendrier de l'Avent E2E";

test.describe("calendrier / campagne quotidienne — affichage joueur suivable", () => {
  test("la grille montre les cases ouvrables/verrouillée et le panneau d'inscription, sans violation axe", async ({
    page,
  }, testInfo) => {
    // Barre de progression et cellules animées (transitions) : mouvement réduit
    // fige l'affichage pour un scan a11y déterministe.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/calendar/${CALENDAR_SLUG}`);

    // En-tête : le nom du calendrier est le repère public le plus stable (rendu
    // serveur, indépendant du cookie joueur). L'emoji de titre est aria-hidden,
    // donc absent du nom accessible.
    await expect(
      page.getByRole("heading", { name: CALENDAR_NAME, level: 1 }),
    ).toBeVisible({ timeout: 30_000 });

    // Progression d'assiduité : cycle neuf (cookie vierge) → 0 / 3.
    await expect(
      page.getByRole("progressbar", { name: "Cases ouvertes" }),
    ).toBeVisible();

    // Cases 1 et 2 : déverrouillées → boutons « Ouvrir la case N » (aria-label
    // exact). exact:true évite tout appariement partiel.
    await expect(
      page.getByRole("button", { name: "Ouvrir la case 1", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ouvrir la case 2", exact: true }),
    ).toBeVisible();

    // Case 3 : verrouillée (gating temporel serveur) → PAS de bouton d'ouverture,
    // rendue comme un simple libellé « Case 3, verrouillée … ».
    await expect(
      page.getByRole("button", { name: /Ouvrir la case 3/ }),
    ).toHaveCount(0);
    await expect(page.getByLabel(/Case 3, verrouillée/)).toBeVisible();

    // Panneau d'inscription au rappel quotidien (opt-in RGPD) — présent, replié.
    await expect(
      page.getByRole("heading", { name: /Reçois un rappel chaque jour/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "M'inscrire" }),
    ).toBeVisible();

    // Scan a11y de la surface publique au repos (avant expansion / ouverture).
    await expectNoA11yViolations(page, testInfo);

    // L'inscription se déplie : champ email + opt-in explicites + « Valider ».
    await page.getByRole("button", { name: "M'inscrire" }).click();
    await expect(page.getByLabel("Votre email")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Valider" }),
    ).toBeVisible();
  });

  test("ouvrir une case déverrouillée révèle son contenu du jour", async ({
    page,
  }) => {
    await page.goto(`/calendar/${CALENDAR_SLUG}`);

    // Attente d'état : la grille hydratée expose le bouton d'ouverture.
    const openBox1 = page.getByRole("button", {
      name: "Ouvrir la case 1",
      exact: true,
    });
    await expect(openBox1).toBeVisible({ timeout: 30_000 });
    await openBox1.click();

    // Ouverture réussie (open_calendar_box, service role) → modale de révélation.
    // La case 1 est de type `content` : le « mot du jour » s'affiche.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(
      dialog.getByRole("heading", { name: "Le mot du jour" }),
    ).toBeVisible();

    // Fermeture : la case devient « ouverte » (bouton « Revoir la case 1 »).
    await dialog.getByRole("button", { name: "Fermer" }).click();
    await expect(
      page.getByRole("button", { name: "Revoir la case 1", exact: true }),
    ).toBeVisible();
  });

  test("un calendrier inconnu renvoie une 404 @smoke", async ({ page }) => {
    // Réponse générique unique : aucun oracle sur le motif d'invalidité
    // (slug inconnu, archivé, module coupé, abonnement inactif…).
    const response = await page.goto("/calendar/slug-inexistant-e2e");
    expect(response?.status()).toBe(404);
  });
});
