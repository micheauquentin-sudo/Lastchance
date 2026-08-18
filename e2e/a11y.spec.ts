import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Les surfaces qu'aucune spec de parcours ne scanne.
 *
 * L'en-tête de ce fichier a longtemps affirmé que « les autres pages sont
 * scannées en fin de parcours dans leurs specs respectives ». C'était faux
 * de sept specs, et le fichier ne visitait que `/`. Un commentaire qui
 * déclare une couverture qui n'existe pas est pire que pas de commentaire :
 * il fait renoncer à vérifier.
 *
 * Sont réunies ici les pages SANS parcours propre — celles qu'on traverse
 * (connexion, inscription, mise en route) ou qu'on consulte (portefeuille,
 * participations, réglages) sans qu'un scénario métier s'y arrête.
 */
test.describe("accessibilité — surfaces publiques", () => {
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

  for (const [nom, chemin] of [
    ["la connexion", "/login"],
    ["l'inscription", "/signup"],
    // Publique et sans session : le portefeuille d'un visiteur inconnu
    // affiche son état vide, qui est aussi une page à part entière.
    ["le portefeuille", "/portefeuille"],
  ] as const) {
    test(`${nom} est sans violation axe serious/critical`, async ({
      page,
    }, testInfo) => {
      await page.goto(chemin);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page, testInfo);
    });
  }
});

test.describe("accessibilité — surfaces commerçant", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  for (const [nom, chemin] of [
    ["la mise en route", "/onboarding"],
    ["les participations", "/dashboard/participations"],
    ["les réglages", "/dashboard/settings"],
  ] as const) {
    test(`${nom} est sans violation axe serious/critical`, async ({
      page,
    }, testInfo) => {
      await page.goto(chemin);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoA11yViolations(page, testInfo);
    });
  }
});
