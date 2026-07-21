import { expect, test } from "@playwright/test";

/**
 * Newsletter de bout en bout via la FILE DE TRAVAUX (audit #7) :
 * 3 abonnés seedés, composition, mise en file (l'action ne bloque
 * plus sur l'envoi), tick du worker (/api/cron/jobs, déclenché ici
 * avec CRON_SECRET comme le ferait pg_cron), envoi par lots via le
 * stub Resend, puis journal avec statut « Envoyé » et compte final.
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

  test("composer → file d'attente → worker → journal « Envoyé » @smoke", async ({
    page,
    request,
  }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET absent (worker non déclenchable)");

    await page.goto("/dashboard/newsletter");

    // Les abonnés seedés sont comptés dans le segment « Tous ».
    const segmentTous = page.getByRole("button", { name: /Tous les abonnés actifs/ });
    await expect(segmentTous).toBeVisible();
    await expect(segmentTous).toContainText("3");

    // Un segment vide n'est pas envoyable (bouton désactivé).
    await page.getByRole("button", { name: /3 gains ou plus/ }).click();
    await expect(page.getByRole("button", { name: /^Envoyer à/ })).toBeDisabled();
    await segmentTous.click();

    // Composition + mise en file (sujet unique : le journal s'accumule).
    const subject = `Promo E2E ${Date.now()}`;
    await page.getByLabel("Objet").fill(subject);
    await page
      .getByLabel("Message")
      .fill("Offre spéciale cette semaine — merci de votre fidélité !");
    await page.getByRole("button", { name: "Envoyer à 3 abonnés" }).click();

    // L'action répond instantanément : la campagne est EN FILE.
    await expect(
      page.getByText(/En file d'attente : envoi à 3 abonnés/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(subject)).toBeVisible();

    // Tick du worker — exactement l'appel que fait pg_cron.
    const worker = await request.get("/api/cron/jobs", {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(worker.status()).toBe(200);
    const summary = (await worker.json()) as { processed: number };
    expect(summary.processed).toBeGreaterThanOrEqual(1);

    // Le journal reflète l'envoi réel : statut + compte final.
    await page.reload();
    await expect(page.getByText(subject)).toBeVisible();
    await expect(page.getByText("Envoyé", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/3\/3 envoyés/).first()).toBeVisible();
  });
});
