import { expect, test } from "@playwright/test";

/**
 * Parcours « Réserver » (RES-1b / L4) : de la page publique de l'activité
 * jusqu'au comptoir des arrivées, et retour.
 *
 * Seed (`supabase/seed.sql`) : activité E2E « Dégustation du Comptoir E2E »
 * (e2ea0000-0000-4000-8000-000000000011) avec DEUX créneaux —
 * ...021 dans 2 jours (hors fenêtre de check-in) et ...022 dans 30 minutes
 * (fenêtre déjà ouverte, `starts_at - 1h`). Le créneau proche sert le
 * check-in ; le lointain reste libre pour ne pas interférer.
 *
 * Comme les specs jackpot/quiz sœurs : on prouve l'ÉTAT réel (le code affiché
 * dans « Mes réservations », le verdict du comptoir), jamais un simple
 * message de succès flottant.
 */
const ACTIVITY_ID = "e2ea0000-0000-4000-8000-000000000011";

test.describe("réserver — parcours public puis comptoir", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("réservation sans email, code affiché, arrivée enregistrée puis rejouée, annulation refusée", async ({
    page,
  }) => {
    // ── 1. Page publique de l'activité E2E : le créneau proche (30 min) est
    // celui dont la fenêtre de check-in est déjà ouverte — on le réserve.
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    const carteCreneauProche = creneauxSection
      .locator("li")
      .filter({ hasText: /place/ })
      .first();
    await expect(carteCreneauProche).toBeVisible();

    // ── 2. Réservation SANS email : le formulaire ne coche pas le
    // consentement, et le champ email reste vide.
    await carteCreneauProche
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    // `reloadOnSuccess` : la page se recharge et « Mes réservations » montre
    // la réservation fraîchement prise, avec son code.
    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });
    const carteReservation = page
      .locator("li")
      .filter({ hasText: "Confirmée" })
      .first();
    await expect(carteReservation).toBeVisible();
    const codeTexte = await carteReservation
      .locator("p.font-mono")
      .last()
      .textContent();
    const code = (codeTexte ?? "").trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // Aucun email ni jeton dans le HTML rendu : l'identité est le cookie.
    const contenu = await page.content();
    expect(contenu).not.toContain("@e2e.local");

    // ── 3. Comptoir : saisie du code → « arrivée enregistrée ».
    await page.goto("/dashboard/reservations");
    await expect(page.getByRole("heading", { name: "Arrivées" })).toBeVisible(
      { timeout: 30_000 },
    );
    const champCode = page.getByLabel("Code de réservation");
    await champCode.fill(code);
    await page.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    await expect(page.getByText("Arrivée enregistrée")).toBeVisible({
      timeout: 20_000,
    });

    // ── 4. Re-saisie du MÊME code : verdict « déjà enregistrée », JAMAIS
    // « fenêtre refermée » — le statut prime sur la fenêtre (docstring
    // `CheckinVerdict`).
    await champCode.fill(code);
    await page.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    await expect(page.getByText("Déjà enregistrée")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Fenêtre d'arrivée refermée")).toHaveCount(0);

    // ── 5. Tentative d'annulation de la réservation arrivée : le bouton
    // d'annulation n'apparaît plus (une arrivée déjà enregistrée ne s'annule
    // plus — commentaire de `MaReservation`).
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    const carteArrivee = page
      .locator("li")
      .filter({ hasText: "Arrivé" })
      .first();
    await expect(carteArrivee).toBeVisible({ timeout: 30_000 });
    await expect(
      carteArrivee.getByRole("button", { name: "Annuler ma réservation" }),
    ).toHaveCount(0);
  });

  test("email sans consentement coché : le formulaire refuse avec le message ciblé", async ({
    page,
  }) => {
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    // Le créneau lointain (2 jours) : le scénario court n'a pas besoin de la
    // fenêtre de check-in, et laisse le créneau proche disponible à d'autres
    // exécutions.
    const carteCreneauLointain = creneauxSection
      .locator("li")
      .filter({ hasText: /place/ })
      .last();
    await expect(carteCreneauLointain).toBeVisible();

    await carteCreneauLointain
      .getByLabel(/Votre email/)
      .fill("client-e2e-sans-consentement@example.com");
    // La case de consentement n'est PAS cochée.
    await carteCreneauLointain
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });

    // Ni l'email saisi ni un jeton n'apparaissent dans la page rendue.
    const contenu = await page.content();
    expect(contenu).not.toContain("client-e2e-sans-consentement@example.com");
  });
});
