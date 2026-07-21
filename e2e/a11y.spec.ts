import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Scan d'accessibilité de la landing marketing `/` — seule surface du
 * chantier a11y qu'aucune spec de parcours ne visite. Les autres pages
 * (/play, /pronos, caisse) sont scannées en fin de parcours dans leurs
 * specs respectives (player-win, pronostics, roles).
 */
test.describe("accessibilité — landing marketing", () => {
  test("la landing est sans violation axe serious/critical @smoke", async ({
    page,
  }, testInfo) => {
    // Les sections s'affichent via un fondu à l'intersection (Reveal),
    // qui se désactive en mouvement réduit : tout le contenu est alors
    // visible immédiatement — le scan couvre la page entière de façon
    // déterministe, sans dépendre du défilement.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});
