import { expect, test } from "@playwright/test";

/**
 * Parcours joueur de bout en bout : scan (ouverture du lien) → roue →
 * spin → résultat (gagné : formulaire + code / perdu : message).
 *
 * Prérequis côté environnement cible :
 *   - E2E_PLAY_SLUG : slug d'un QR code dont la campagne est active,
 *     avec une limite de jeu "unlimited" (sinon le 2e run est bloqué) ;
 *   - de préférence une campagne sans action d'engagement, ou avec
 *     newsletter uniquement (le test la gère).
 */
const slug = process.env.E2E_PLAY_SLUG;

test.describe("parcours joueur", () => {
  test.skip(
    !slug,
    "Définir E2E_PLAY_SLUG (et E2E_BASE_URL) pour exécuter les E2E — voir playwright.config.ts",
  );

  test("la page de jeu se charge sans fuiter les probabilités", async ({
    page,
  }) => {
    const responses: string[] = [];
    page.on("response", async (res) => {
      if (res.request().resourceType() === "document") {
        responses.push(await res.text().catch(() => ""));
      }
    });

    await page.goto(`/play/${slug}`);
    await expect(
      page.getByRole("img", { name: "Roue de la fortune" }),
    ).toBeVisible();

    // Les poids des lots ne doivent jamais atteindre le client.
    for (const html of responses) {
      expect(html).not.toMatch(/"weight"\s*:/);
    }
  });

  test("spin complet : roue → résultat → code si gagné", async ({ page }) => {
    await page.goto(`/play/${slug}`);

    // Étape d'engagement éventuelle : on choisit la newsletter.
    const newsletter = page.getByText("Je m'inscris à la newsletter");
    if (await newsletter.isVisible().catch(() => false)) {
      await newsletter.click();
      await page.getByRole("textbox").fill("e2e@exemple.fr");
      await page.getByRole("button", { name: "S'inscrire et jouer" }).click();
    }

    await page.getByRole("button", { name: "Lancer la roue" }).click();

    // Fin d'animation (~4,4 s) puis écran de résultat.
    const won = page.getByText("✦ GAGNÉ ✦");
    const lost = page.getByText("Pas cette fois…");
    await expect(won.or(lost)).toBeVisible({ timeout: 15_000 });

    if (await lost.isVisible().catch(() => false)) return; // perdu : fin du parcours

    // Gagné : formulaire éventuel (selon la config de la campagne).
    const firstName = page.locator('input[name="firstName"]');
    if (await firstName.isVisible().catch(() => false)) {
      await firstName.fill("Test E2E");
      const email = page.locator('input[name="email"]');
      if (await email.isVisible().catch(() => false)) {
        await email.fill("e2e@exemple.fr");
      }
      const phone = page.locator('input[name="phone"]');
      if (await phone.isVisible().catch(() => false)) {
        await phone.fill("0612345678");
      }
      await page.locator('input[name="acceptedTerms"]').check();
      await page
        .getByRole("button", { name: "Récupérer mon gain" })
        .click();
    }

    // Le code de retrait s'affiche (GAIN-XXXX).
    await expect(page.getByText(/GAIN-[A-HJ-NP-Z2-9]{4}/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("un slug inexistant affiche un message clair", async ({ page }) => {
    await page.goto("/play/slug-inexistant-e2e");
    await expect(page.getByText("Ce lien de jeu n'existe pas.")).toBeVisible();
  });
});
