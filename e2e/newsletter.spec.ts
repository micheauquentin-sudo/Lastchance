import { expect, test } from "@playwright/test";

/**
 * Newsletter de bout en bout : 3 abonnés seedés, composition, envoi
 * par lots via le fournisseur (stub Resend en CI : RESEND_BASE_URL →
 * e2e/api-stubs.mjs), confirmation, et journal des campagnes.
 *
 * Note d'architecture constatée : il n'y a PAS de file d'attente —
 * l'envoi est synchrone dans la server action (lots de 100 via
 * l'API batch), puis journalisé dans newsletter_campaigns.
 *
 * Mono-projet (desktop-smoke) : le rate-limit d'envoi est de
 * 5 / jour / org+IP — un seul projet le consomme avec marge (la base
 * CI est neuve à chaque run, le compteur PG repart de zéro).
 */
test.describe("newsletter — composition, envoi, journal", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : rate-limit d'envoi 5/jour par org",
    );
  });

  test("composer → envoyer aux 3 abonnés → confirmation + journal @smoke", async ({
    page,
  }) => {
    await page.goto("/dashboard/newsletter");

    // Les abonnés seedés sont comptés dans le segment « Tous ».
    const segmentTous = page.getByRole("button", { name: /Tous les abonnés actifs/ });
    await expect(segmentTous).toBeVisible();
    await expect(segmentTous).toContainText("3");

    // Un segment vide n'est pas envoyable (bouton désactivé).
    await page.getByRole("button", { name: /3 gains ou plus/ }).click();
    await expect(page.getByRole("button", { name: /^Envoyer à/ })).toBeDisabled();
    await segmentTous.click();

    // Composition + envoi (sujet unique : le journal s'accumule entre retries).
    const subject = `Promo E2E ${Date.now()}`;
    await page.getByLabel("Objet").fill(subject);
    await page
      .getByLabel("Message")
      .fill("Offre spéciale cette semaine — merci de votre fidélité !");
    await page.getByRole("button", { name: "Envoyer à 3 abonnés" }).click();

    // Le stub Resend accepte le lot : confirmation exacte…
    await expect(page.getByText("Envoyé à 3 abonnés.")).toBeVisible({
      timeout: 15_000,
    });
    // …et la campagne apparaît au journal avec son compte de destinataires.
    await expect(page.getByText(subject)).toBeVisible();
    await expect(page.getByText(/3 destinataires/).first()).toBeVisible();
  });
});
