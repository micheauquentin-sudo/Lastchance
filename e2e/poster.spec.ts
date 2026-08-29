import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * TEST-3 : première spec du Studio d'affiches (`poster-editor.tsx`, 858
 * lignes, zéro test jusqu'ici). On y arrive comme un commerçant le ferait
 * réellement — depuis `/dashboard/qr-codes`, lien « Créer l'affiche » d'une
 * carte QR (ouvre `/poster/[id]` dans un nouvel onglet, `target="_blank"`) —
 * plutôt que de deviner un `qr_codes.id` non déterministe (la table ne seed
 * pas d'`id` explicite, cf. `supabase/seed.sql`).
 *
 * Couverture minimale : l'éditeur rend l'affiche (barre d'actions, page A4,
 * panneau de réglages) et passe un scan axe. Pas d'édition ni d'impression
 * réelle — la mécanique de drag/impression sortirait du minimal du lot TEST-3.
 */
test.describe("Studio d'affiches — rendu de l'éditeur", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("l'éditeur d'affiche d'un QR de campagne s'ouvre et rend sans violation axe", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/dashboard/qr-codes");

    const posterLink = page
      .getByRole("link", { name: "Créer l'affiche" })
      .first();
    await expect(posterLink).toBeVisible({ timeout: 30_000 });

    const [posterPage] = await Promise.all([
      context.waitForEvent("page"),
      posterLink.click(),
    ]);
    await posterPage.waitForLoadState("domcontentloaded");

    // Barre d'actions : retour, annuler/rétablir, enregistrer, imprimer/exporter — le
    // repère le plus stable de l'éditeur chargé (pas de heading sémantique
    // sur cette page canvas-first).
    await expect(
      posterPage.getByRole("link", { name: "← QR codes" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      posterPage.getByRole("button", { name: "Imprimer" }),
    ).toBeVisible();
    await expect(
      posterPage.getByRole("button", { name: "Télécharger l'affiche" }),
    ).toBeVisible();
    await expect(
      posterPage.getByRole("button", { name: "Enregistrer" }),
    ).toBeVisible();

    // Panneau de réglages : les modèles proposés confirment que l'affiche a
    // bien chargé sa configuration initiale (pas un écran vide/erreur).
    await expect(posterPage.getByText("Modèles")).toBeVisible();
    await expect(posterPage.getByText("Ajouter une image de fond")).toBeVisible();

    // Une seule affiche sort : l'aperçu d'édition est explicitement masqué,
    // seule la feuille A4 dédiée demeure visible dans le média d'impression.
    await posterPage.emulateMedia({ media: "print" });
    await expect(posterPage.getByTestId("poster-preview")).toBeHidden();
    await expect(posterPage.getByTestId("poster-print-sheet")).toBeVisible();
    await posterPage.emulateMedia({ media: "screen" });

    await expectNoA11yViolations(posterPage, testInfo);
    await posterPage.close();
  });
});
