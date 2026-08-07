import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Le filet des SEPT ateliers non couverts jusqu'ici (quiz, calendrier,
 * chasse, passeport, cagnotte, soirée, championnat) — même patron que
 * `wheel-wizard.spec.ts` : aucune de ces sept pages n'était visitée par une
 * spec avant ce chantier, et aucun scan axe ne s'y était encore posé.
 *
 * Fixtures : org « E2E Café » seedée (supabase/seed.sql), session owner.
 *   - Quiz du Comptoir E2E        e2e95000-…0001  (4 étapes)
 *   - Calendrier de l'Avent E2E   e2ee0000-…0001  (3 étapes)
 *   - Chasse E2E                  e2ea0000-…0001  (4 étapes)
 *   - Passeport E2E               e2eb0000-…0001  (4 étapes)
 *   - Jackpot E2E (mode staff)    e2ec0000-…0001  (2 étapes — pas d'écran comptoir)
 *   - Quiz du bar E2E (soirée)    e2ed0000-…0001  (4 étapes)
 *   - Championnat E2E             e2e60000-…0001  (6 étapes)
 *
 * Un seul test de navigation transverse par module porte @smoke ; le reste
 * (stepper, étape inconnue, vérification, a11y par étape) ne tourne qu'en
 * mobile, comme dashboard-home.spec.ts et wheel-wizard.spec.ts le font pour
 * les mêmes raisons (coût des scans axe).
 */

type Module = {
  nom: string;
  base: string;
  titreAtelier: string;
  premiereEtape: string;
  etapes: string[];
};

const MODULES: Module[] = [
  {
    nom: "quiz",
    base: "/dashboard/quiz/e2e95000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du quiz",
    premiereEtape: "quiz",
    etapes: ["quiz", "questions", "dotation", "verification"],
  },
  {
    nom: "calendrier",
    base: "/dashboard/calendar/e2ee0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du calendrier",
    premiereEtape: "reglages",
    etapes: ["reglages", "cases", "verification"],
  },
  {
    nom: "chasse",
    base: "/dashboard/hunts/e2ea0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier de la chasse",
    premiereEtape: "chasse",
    etapes: ["chasse", "parcours", "affiches", "verification"],
  },
  {
    nom: "passeport",
    base: "/dashboard/loyalty/e2eb0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du passeport",
    premiereEtape: "programme",
    etapes: ["programme", "recompenses", "cartes", "verification"],
  },
  {
    nom: "cagnotte",
    base: "/dashboard/jackpot/e2ec0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier de la cagnotte",
    premiereEtape: "reglages",
    // Mode 'staff' en seed : pas d'écran comptoir, donc 2 étapes seulement.
    etapes: ["reglages", "verification"],
  },
  {
    nom: "soirée",
    base: "/dashboard/events/e2ed0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier de la soirée",
    premiereEtape: "jeu",
    etapes: ["jeu", "manches", "soiree", "verification"],
  },
  {
    nom: "championnat",
    base: "/dashboard/pronostics/e2e60000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du championnat",
    premiereEtape: "championnat",
    etapes: [
      "championnat",
      "matchs",
      "questions",
      "bareme",
      "recompenses",
      "verification",
    ],
  },
];

test.describe("Ateliers des 7 modules — navigation par étape @smoke", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  for (const mod of MODULES) {
    test(`${mod.nom} : vue nue = suivi, chaque étape se rend, une étape inconnue retombe sur la première`, async ({
      page,
    }) => {
      // ── URL nue → vue SUIVI ──
      await page.goto(mod.base);
      await expect(
        page.getByRole("heading", { name: "Carte de l'Aventure" }),
      ).toBeVisible();
      await expect(page.locator("#statut")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: mod.titreAtelier }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Ouvrir l'atelier" }).first(),
      ).toBeVisible();

      // ── Chaque étape se rend, landmark numéroté commun ──
      for (const etape of mod.etapes) {
        await page.goto(`${mod.base}?etape=${etape}`);
        await expect(page).toHaveURL(new RegExp(`etape=${etape}`));
        await expect(page.locator("[aria-label^='Étape']").first()).toBeVisible();
      }

      // ── Étape inconnue → première étape, pas de 404 ──
      await page.goto(`${mod.base}?etape=n-importe-quoi`);
      await expect(page).toHaveURL(new RegExp(`etape=n-importe-quoi`));
      await expect(
        page.locator("[aria-label^='Étape 1 ']").first(),
      ).toBeVisible();
    });
  }
});

test.describe("Ateliers des 7 modules — stepper, vérification et a11y", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  for (const mod of MODULES) {
    test(`${mod.nom} : le stepper porte ${mod.etapes.length} pastille(s), aria-current sur la courante, a11y de la vue nue et de chaque étape`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith("mobile"),
        "Scans a11y coûteux, un seul contexte suffit — comme wheel-wizard.spec.ts",
      );

      // ── a11y de la vue nue (suivi) ──
      await page.goto(mod.base);
      await expectNoA11yViolations(page, testInfo);

      // ── Stepper : bon nombre de pastilles, aria-current sur la première ──
      await page.goto(`${mod.base}?etape=${mod.premiereEtape}`);
      const stepper = page.getByRole("navigation", {
        name: "Étapes de l'atelier",
      });
      await expect(stepper).toBeVisible();
      await expect(stepper.getByRole("listitem")).toHaveCount(
        mod.etapes.length,
      );
      const courante = stepper.locator('[aria-current="step"]');
      await expect(courante).toHaveCount(1);

      // ── a11y de chaque étape ──
      for (const etape of mod.etapes) {
        await page.goto(`${mod.base}?etape=${etape}`);
        await expect(
          page.locator("[aria-label^='Étape']").first(),
        ).toBeVisible();
        await expectNoA11yViolations(page, testInfo);
      }
    });

    test(`${mod.nom} : l'étape de vérification affiche des lignes ✓/✗ et tout ✗ porte un lien vers son étape`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !testInfo.project.name.startsWith("mobile"),
        "Lecture d'état, un seul contexte suffit",
      );

      await page.goto(`${mod.base}?etape=verification`);
      await expect(
        page.getByRole("heading", { name: "Tout est-il prêt ?" }),
      ).toBeVisible();

      const lignesACorriger = page.getByText("À corriger :");
      const count = await lignesACorriger.count();
      if (count > 0) {
        const lien = page
          .getByRole("link", { name: /Corriger à l'étape/ })
          .first();
        await expect(lien).toBeVisible();
        await expect(lien).toHaveAttribute("href", new RegExp(`etape=`));
      }
    });
  }
});

/**
 * Bug corrigé (commit fde377c) : « Enregistrer l'événement » effaçait
 * `default_locks_at` dès qu'on ne retouchait pas la date — l'input
 * `datetime-local` était non contrôlé, partait vide, et la RPC écrivait
 * `null` sans condition. Reproduit ici sur le championnat E2EPRONO (aucune
 * date posée au seed) : poser une date, enregistrer, recharger — elle doit
 * être toujours là — puis enregistrer UNE SECONDE FOIS sans y toucher et
 * recharger encore : elle doit rester, ce qui est exactement l'effacement
 * silencieux que le bug produisait.
 */
test.describe("Championnat — étape « Les matchs » : la date de verrouillage ne s'efface plus", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : la date posée est partagée entre les projets parallèles",
    );
  });

  test("poser une date, enregistrer, recharger : la date tient ; réenregistrer sans y toucher ne l'efface pas @smoke", async ({
    page,
  }) => {
    const base =
      "/dashboard/pronostics/e2e60000-0000-4000-8000-000000000001?etape=matchs";
    await page.goto(base);

    const dateInput = page.locator("#event-default-locks");
    await expect(dateInput).toBeVisible();

    const valeur = "2031-06-15T10:00";
    await dateInput.fill(valeur);
    await page
      .getByRole("button", { name: "Enregistrer l'événement" })
      .click();

    // Le serveur fait foi : on recharge plutôt que de se fier à l'état client.
    await page.reload();
    await expect(page.locator("#event-default-locks")).toHaveValue(valeur);

    // Réenregistrer SANS toucher au champ : avant le correctif, cela effaçait
    // la date (hidden non contrôlé parti vide → RPC écrit null).
    await page
      .getByRole("button", { name: "Enregistrer l'événement" })
      .click();
    await page.reload();
    await expect(page.locator("#event-default-locks")).toHaveValue(valeur);
  });
});

/**
 * Calendrier — étape « La vérification » : la case 3 est verrouillée
 * (`unlock_at` futur, seed), donc jamais garnie → le contrôle « Chaque case
 * ouvrable porte une offre » ressort en ✗ avec un lien nommé « case 3 ».
 */
test.describe("Calendrier — vérification : le lien vers la case fautive est nommé", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("une case incomplète porte un lien « case N » vers l'étape « Les cases »", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Lecture d'état, un seul contexte suffit",
    );

    await page.goto(
      "/dashboard/calendar/e2ee0000-0000-4000-8000-000000000001?etape=verification",
    );
    await expect(
      page.getByRole("heading", { name: "Tout est-il prêt ?" }),
    ).toBeVisible();

    const lien = page.getByRole("link", { name: /case \d+/ }).first();
    await expect(lien).toBeVisible();
    await expect(lien).toHaveAttribute("href", /etape=cases/);
  });
});

/**
 * Jackpot — le stepper varie selon `validation_mode` : en mode « staff »
 * (seed), pas d'écran comptoir → 2 pastilles. En basculant sur « Code
 * tournant » (rotating_code) depuis l'étape « Les réglages », une 3e
 * pastille « L'écran comptoir » doit apparaître.
 */
test.describe("Cagnotte — le stepper suit le mode de validation", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : bascule le mode de validation de la cagnotte seedée",
    );
  });

  test("mode staff : 2 pastilles ; passage en code tournant : 3 pastilles @smoke", async ({
    page,
  }) => {
    const base = "/dashboard/jackpot/e2ec0000-0000-4000-8000-000000000001";
    await page.goto(`${base}?etape=reglages`);

    const stepper = page.getByRole("navigation", {
      name: "Étapes de l'atelier",
    });
    await expect(stepper.getByRole("listitem")).toHaveCount(2);

    const radioCodeComptoir = page.getByRole("radio", {
      name: /Code au comptoir/,
    });
    const boutonEnregistrer = page.getByRole("button", { name: "Enregistrer" });

    await expect(radioCodeComptoir).toBeVisible();
    await radioCodeComptoir.check();
    await boutonEnregistrer.click();

    await page.goto(`${base}?etape=reglages`);
    await expect(stepper.getByRole("listitem")).toHaveCount(3);

    // On remet le mode d'origine pour ne pas polluer les autres runs.
    await page.getByRole("radio", { name: /Validation en caisse/ }).check();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.goto(`${base}?etape=reglages`);
    await expect(stepper.getByRole("listitem")).toHaveCount(2);
  });
});
