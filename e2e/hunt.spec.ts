import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Parcours joueur de la Chasse au trésor multi-QR (seed supabase/seed.sql :
 * chasse « Chasse E2E », 3 étapes, ordre libre, sans délai, stock illimité —
 * jetons d'étapes déterministes E2EHUNT100000001..3, 16 car.). Le joueur scanne chaque QR,
 * valide son passage, et obtient à la complétion un code de retrait au
 * format maison CHASSE-XXXXXXXX présentable en caisse.
 *
 * Anonyme (aucune session) : chaque exécution part d'un cookie joueur vierge,
 * donc d'un joueur neuf — le scénario est rejouable et isolé entre projets
 * et navigateurs (le tampon est idempotent côté RPC). Mono-parcours mobile,
 * comme player-win et pronostics ; le budget de scans par IP reste large
 * (huntScanIp : 20 / 10 min, 3 tampons par navigateur).
 */
const STEP_TOKENS = ["E2EHUNT100000001", "E2EHUNT200000002", "E2EHUNT300000003"] as const;

test.describe("chasse au trésor — parcours joueur complet", () => {
  test("scanner les trois étapes mène au code de retrait", async ({
    page,
  }, testInfo) => {
    // ── Écran d'accueil de l'étape 1 : la surface publique /hunt la plus
    // représentative (carte de tampons + étape + lot). Scan a11y avant tout
    // tampon — le nouveau parcours public entre dans la couverture axe.
    await page.goto(`/hunt/${STEP_TOKENS[0]}`);
    await expect(
      page.getByRole("heading", { name: "Chasse E2E", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Le comptoir")).toBeVisible();
    await expectNoA11yViolations(page, testInfo);

    // ── Tampon des trois étapes (ordre libre). Chaque validation est un POST
    // de server action qui pose/lit le cookie joueur httpOnly ; on attend la
    // confirmation d'état avant de passer au QR suivant (aucun sleep).
    for (let i = 0; i < STEP_TOKENS.length; i += 1) {
      if (i > 0) await page.goto(`/hunt/${STEP_TOKENS[i]}`);

      const validate = page.getByRole("button", {
        name: "Valider mon passage",
      });
      await expect(validate).toBeVisible({ timeout: 15_000 });
      await validate.click();

      if (i < STEP_TOKENS.length - 1) {
        // Étape intermédiaire : le bouton laisse place à l'invitation à
        // chercher le QR suivant — preuve que le tampon est enregistré (et
        // que le cookie est posé) avant la navigation.
        await expect(
          page.getByText(/Direction l'étape suivante/),
        ).toBeVisible({ timeout: 15_000 });
      }
    }

    // ── Complétion : l'écran final affiche le code de retrait au format
    // maison (CHASSE-XXXXXXXX, alphabet sans I/O/0/1) et l'instruction caisse.
    await expect(
      page.getByRole("heading", { name: /Chasse terminée/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/CHASSE-[A-HJ-NP-Z2-9]{8}/)).toBeVisible();
    await expect(
      page.getByText("Présentez ce code en caisse pour récupérer votre lot."),
    ).toBeVisible();

    // ── Scan a11y de l'écran final (code + formulaire optionnel de rappel
    // par email) : l'autre état distinct du parcours, riche en champs de
    // formulaire — surface à plus fort risque d'accessibilité.
    await expectNoA11yViolations(page, testInfo);
  });

  test("un jeton d'étape inconnu renvoie une 404 @smoke", async ({ page }) => {
    // Réponse générique unique : aucun oracle sur le motif d'invalidité.
    const response = await page.goto("/hunt/INCONNU9");
    expect(response?.status()).toBe(404);
  });
});
