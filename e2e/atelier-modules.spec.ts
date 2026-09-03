import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { ouvrirTuile } from "./helpers";

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
  /**
   * Le libellé du lien vers la vue JOUEUR, quand il n'est pas « Voir le jeu ».
   *
   * Le passeport n'est pas un jeu : on n'y joue pas, on y accumule. Écrire
   * « Voir le jeu » y envoyait le commerçant chercher une partie qui n'existe
   * pas. Le libellé est donc réglable par module, et ce champ dit lesquels
   * s'écartent du défaut — plutôt qu'un test qui chercherait vaguement l'un
   * OU l'autre et ne prouverait plus lequel est rendu où.
   */
  libelleVoir?: string;
  premiereEtape: string;
  etapes: string[];
  /**
   * LE TITRE DE LA CARTE « STUDIO », pour les modules déjà portés (VIT-39).
   *
   * Au-delà du point de rupture `lg`, la carte d'entrée de l'atelier est
   * REMPLACÉE par celle du studio — c'est la demande : l'atelier reste pour le
   * téléphone. Ce champ dit lesquels ont franchi le pas ; les autres gardent
   * le comportement d'avant, et ce fichier n'a pas à être retouché à chaque
   * conversion.
   *
   * Absent = pas encore porté. Ce n'est PAS un défaut par omission : un module
   * porté sans ce champ ferait rougir la branche « atelier » ci-dessous.
   */
  studio?: string;
};

/**
 * Le point de rupture `lg` de Tailwind, en pixels.
 *
 * Lu du VIEWPORT et non du nom du projet Playwright : c'est la largeur qui
 * décide côté CSS, et un projet renommé ne doit pas changer ce que ce test
 * mesure.
 */
const RUPTURE_LG = 1024;

const MODULES: Module[] = [
  {
    nom: "quiz",
    base: "/dashboard/quiz/e2e95000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du quiz",
    studio: "Mon studio",
    premiereEtape: "quiz",
    etapes: ["quiz", "questions", "dotation", "verification"],
  },
  {
    nom: "calendrier",
    base: "/dashboard/calendar/e2ee0000-0000-4000-8000-000000000001",
    titreAtelier: "L'atelier du calendrier",
    studio: "Mon studio",
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
    libelleVoir: "Voir le passeport",
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
      //
      // Depuis « tout replié », seul le Statut s'ouvre de lui-même. La porte
      // de l'atelier naît en barre repliée : on la déplie avant d'exiger son
      // contenu, ce qui vérifie AUSSI que la barre existe, puisque
      // `ouvrirTuile` cliquerait dans le vide sinon.
      await page.goto(mod.base);
      await expect(page.locator("#statut")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Carte de l'Aventure" }),
      ).toHaveCount(0);

      // ── LA PORTE DÉPEND DE LA TAILLE D'ÉCRAN (VIT-39) ──
      //
      // Sur grand écran, un module porté montre son STUDIO et masque l'entrée
      // de l'atelier ; sous `lg`, l'inverse. Les deux moitiés sont vérifiées,
      // pas seulement celle qui doit apparaître : n'exiger que la présence
      // laisserait passer le jour où les DEUX cartes s'affichent, ce qui est
      // précisément le défaut qu'on répare — le commerçant voyait l'atelier
      // sur son ordinateur alors qu'on lui avait promis le studio.
      const surGrandEcran = (page.viewportSize()?.width ?? 0) >= RUPTURE_LG;

      if (mod.studio && surGrandEcran) {
        // La carte du studio est dépliée d'office : c'est l'entrée principale.
        await expect(
          page.getByRole("heading", { name: mod.studio }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Ouvrir le studio" }).first(),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: mod.titreAtelier }),
        ).toBeHidden();
      } else {
        await ouvrirTuile(
          page,
          new RegExp(`Développer «.*${mod.titreAtelier}`),
        );
        await expect(
          page.getByRole("heading", { name: mod.titreAtelier }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Ouvrir l'atelier" }).first(),
        ).toBeVisible();
      }

      // ── Le jeu tel que le joueur le voit, depuis la tuile « Statut » ──
      //
      // Les sept fixtures sont seedées ACTIVES (et la soirée a une session) :
      // l'URL joueur existe donc pour chacune, et le bouton doit être là. Il
      // ouvre un onglet — on n'y navigue pas, on vérifie qu'il est bien
      // externalisé et distinct de « Modifier dans l'atelier ».
      const voirLeJeu = page
        .locator("#statut")
        .getByRole("link", { name: mod.libelleVoir ?? "Voir le jeu" });
      await expect(voirLeJeu).toBeVisible();
      await expect(voirLeJeu).toHaveAttribute("target", "_blank");

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
 *
 * PREUVE (échec CI initial) : la date restait "" après le premier
 * enregistrement déjà — pas seulement au second. `contest_is_locked` renvoie
 * TOUJOURS `true` sur E2EPRONO (son second match a un `kickoff_at` dans le
 * passé, cf. seed), donc `ContestEventCard` affiche `ReasonInput` et l'action
 * exige `reason` (10 caractères mini, sinon "locked: reason required" côté
 * RPC). Le premier essai de ce test ne remplissait aucun motif : le POST
 * échouait silencieusement (l'UI ne fait pas assert sur `state.error` ici) et
 * rien n'était jamais écrit — le correctif du bug lui-même n'était donc PAS
 * mis en cause, seul le flux du test l'était. `#event-reason` est rempli à
 * CHAQUE enregistrement ci-dessous.
 *
 * SECONDE PRÉCAUTION, documentée dans `src/lib/use-action-form.ts` : l'action
 * répond en async, `pending` retombe dans un `finally`, mais un `page.reload()`
 * déclenché AVANT que la réponse soit revenue annule la requête en vol côté
 * navigateur — un vrai échec de sauvegarde, indiscernable en apparence du bug
 * fermé. On attend donc que le bouton reprenne son libellé de repos (`pending`
 * retombé, donc la réponse HTTP est arrivée) avant de recharger.
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

    // Championnat verrouillé (un match déjà passé, cf. seed) : le motif est
    // obligatoire à CHAQUE enregistrement, pas seulement au premier.
    const motif = page.locator("#event-reason");
    await expect(motif).toBeVisible();

    const valeur = "2031-06-15T10:00";
    const bouton = page.getByRole("button", { name: "Enregistrer l'événement" });
    await dateInput.fill(valeur);
    await motif.fill("Correctif E2E : pose de la date de verrouillage.");
    await bouton.click();
    // La réponse HTTP est arrivée quand le bouton reprend son libellé de
    // repos (pending → false dans le `finally` de useActionForm).
    await expect(bouton).toHaveText("Enregistrer l'événement");

    // Le serveur fait foi : on recharge plutôt que de se fier à l'état client.
    await page.reload();
    await expect(page.locator("#event-default-locks")).toHaveValue(valeur);

    // ── Moitié 1 de la preuve : le no-op destructeur est désormais
    // IMPOSSIBLE PAR CONSTRUCTION. `disabled={pending || (kindFrozen &&
    // dateUnchanged)}` (contest-settings.tsx) grise le bouton dès que la
    // date n'a pas changé depuis le rechargement — le motif seul ne le
    // réactive pas (`dateUnchanged` ne regarde que la date et la case
    // d'effacement, jamais `reason`). Rien à toucher : on prouve juste que
    // rien n'est cliquable.
    const boutonInchange = page.getByRole("button", {
      name: "Enregistrer l'événement",
    });
    await expect(boutonInchange).toBeDisabled();

    // ── Moitié 2 : un enregistrement qui CHANGE la date persiste toujours
    // correctement — la garde ne bloque que le no-op, pas l'édition légitime.
    const valeur2 = "2031-09-01T14:30";
    await page.locator("#event-default-locks").fill(valeur2);
    await page
      .locator("#event-reason")
      .fill("Correctif E2E : report de la date de verrouillage.");
    const boutonChange = page.getByRole("button", {
      name: "Enregistrer l'événement",
    });
    await expect(boutonChange).toBeEnabled();
    await boutonChange.click();
    await expect(boutonChange).toHaveText("Enregistrer l'événement");
    await page.reload();
    await expect(page.locator("#event-default-locks")).toHaveValue(valeur2);
  });
});

/**
 * Calendrier — étape « La vérification » : une case vide est SIGNALÉE, pas
 * BLOQUÉE — et son lien nomme quand même la case.
 *
 * L'invariant qu'un tour précédent de ce test vérifiait (« une case `content`
 * sans texte est une case FAUTIVE, bloquante ») a été RETIRÉ par le chantier
 * « retours propriétaire » : `refusCase()` (src/lib/activation/calendar.ts)
 * ne regarde plus le texte d'une case `content` du tout. Une case vide est
 * désormais légale — elle signifie « pas de chance » pour le joueur — et
 * n'apparaît que dans le contrôle NON bloquant `cases-vides`. Le seul chemin
 * bloquant restant (`cases`) est réservé aux cases `lot` sans stock/libellé
 * et `spin` sans roue, qu'aucune action de ce test ne peut produire sans
 * toucher une autre organisation du seed.
 *
 * Chemin retenu : AUGMENTER `day_count` de 3 à 4 sur l'étape « Les réglages ».
 * `syncCalendarDays` (src/actions/calendar.ts:684) insère alors la case 4 en
 * INSERT brut — `content_type: "content"` SANS `content_text` — qui atterrit
 * dans le contrôle `cases-vides` : signalée en orange, son lien nomme la case
 * (regex `/case \d+/` matche aussi bien « Aller à la case 4 » que l'ancien
 * libellé bloquant), et la publication reste possible (« Tout est prêt »
 * visible, `toutPret` vrai). On restaure `day_count=3` dans un `finally` : la
 * RÉDUCTION, elle, déclenche le garde-fou `confirm_day_loss` (case à cocher
 * après un premier refus nommé) — la mini-preuve que ce garde-fou fonctionne
 * dans l'autre sens.
 */
test.describe("Calendrier — vérification : une case vide est signalée, pas bloquée", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : fait varier le nombre de cases d'un calendrier partagé",
    );
  });

  test("une case vide porte un lien « case N » vers l'étape « Les cases » et n'empêche pas la publication @smoke", async ({
    page,
  }) => {
    const calendarId = "e2ee0000-0000-4000-8000-000000000001";

    await page.goto(`/dashboard/calendar/${calendarId}?etape=reglages`);
    const dayCount = page.locator("#calendar-daycount");
    await expect(dayCount).toHaveValue("3");

    try {
      // ── 3 → 4 cases : la case 4, neuve, est vide par construction ──
      await dayCount.fill("4");
      const bouton = page.getByRole("button", { name: "Enregistrer" });
      await bouton.click();
      await expect(bouton).toHaveText("Enregistrer");

      await page.goto(`/dashboard/calendar/${calendarId}?etape=verification`);
      await expect(
        page.getByRole("heading", { name: "Tout est-il prêt ?" }),
      ).toBeVisible();

      // Signalée (orange), pas bloquante : le contrôle « cases-vides » nomme
      // la case 4 et propose le même lien qu'un contrôle bloquant.
      await expect(
        page.getByText(/case.*sans rien à gagner/i),
      ).toBeVisible();

      const lien = page.getByRole("link", { name: /case \d+/ }).first();
      await expect(lien).toBeVisible();
      await expect(lien).toHaveAttribute("href", /etape=cases/);

      // Non bloquant : la publication reste proposée malgré la case vide.
      await expect(
        page.getByText("Rien ne manque. Il ne reste qu'à ouvrir le calendrier à vos clients."),
      ).toBeVisible();
    } finally {
      // ── Restaurer 4 → 3 : la réduction est un refus NOMMÉ puis une
      // confirmation explicite — le garde-fou attendu au retour aussi.
      await page.goto(`/dashboard/calendar/${calendarId}?etape=reglages`);
      await page.locator("#calendar-daycount").fill("3");
      const boutonReduit = page.getByRole("button", { name: "Enregistrer" });
      await boutonReduit.click();
      await expect(boutonReduit).toHaveText("Enregistrer");

      const confirmation = page.locator('input[name="confirm_day_loss"]');
      if (await confirmation.isVisible().catch(() => false)) {
        await confirmation.check();
        const boutonConfirme = page.getByRole("button", { name: "Enregistrer" });
        await boutonConfirme.click();
        await expect(boutonConfirme).toHaveText("Enregistrer");
      }
      await page.goto(`/dashboard/calendar/${calendarId}?etape=reglages`);
      await expect(page.locator("#calendar-daycount")).toHaveValue("3");
    }
  });
});

/**
 * Jackpot — le stepper varie selon `validation_mode` : en mode « staff »
 * (seed), pas d'écran comptoir → 2 pastilles. En basculant sur « Code
 * tournant » (rotating_code) depuis l'étape « Les réglages », une 3e
 * pastille « L'écran comptoir » doit apparaître.
 *
 * PREUVE (échec CI initial) : après bascule + clic, le stepper restait à
 * 2 pastilles — de façon parfaitement reproductible sur les deux essais.
 * `useActionForm` (src/lib/use-action-form.ts) résout l'action en async et ne
 * fait retomber `pending` que dans un `finally`, APRÈS la réponse HTTP ; le
 * test enchaînait `.click()` puis `page.goto()` sans attendre cette réponse —
 * la navigation annule alors la requête en vol côté navigateur, donc
 * `validation_mode` n'était jamais écrit. Ni `refineCampaign` (le plancher de
 * cooldown vaut 300 s dans les deux modes ici, donc jamais bloquant) ni
 * `campaignFieldsForMode` (qui écrit `validation_mode` sans condition) ne
 * sont en cause. On attend désormais que le bouton reprenne son libellé de
 * repos avant de naviguer.
 */
test.describe("Cagnotte — le stepper suit le mode de validation", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  const BASE_CAGNOTTE = "/dashboard/jackpot/e2ec0000-0000-4000-8000-000000000001";

  /**
   * Amène la cagnotte seedée dans un mode de validation donné et PROUVE le
   * résultat au compte de pastilles. Idempotente : si le mode est déjà le
   * bon, elle ne poste rien. Le signal de fin d'enregistrement est le TOAST
   * (« Enregistré. ») — pas le libellé du bouton : depuis l'autosave, un
   * check() suivi d'un clic peut produire DEUX soumissions de même valeur,
   * et le bouton repasse par son état de repos entre les deux.
   */
  async function basculerModeValidation(
    page: Page,
    nomRadio: RegExp,
    pastillesAttendues: number,
  ) {
    await page.goto(`${BASE_CAGNOTTE}?etape=reglages`);
    const radio = page.getByRole("radio", { name: nomRadio });
    await expect(radio).toBeVisible();
    if (!(await radio.isChecked())) {
      await radio.check();
      await page.getByRole("button", { name: "Enregistrer" }).click();
      await expect(
        page.locator('[role="status"]', { hasText: "Enregistré." }).first(),
      ).toBeVisible({ timeout: 15_000 });
      // absorbe l'éventuelle seconde soumission (file d'autosave) avant de
      // naviguer — sinon elle part sur une page en cours de déchargement.
      await page.waitForLoadState("networkidle");
    }
    await page.goto(`${BASE_CAGNOTTE}?etape=reglages`);
    await expect(
      page
        .getByRole("navigation", { name: "Étapes de l'atelier" })
        .getByRole("listitem"),
    ).toHaveCount(pastillesAttendues);
  }

  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-smoke",
      "Mono-projet : bascule le mode de validation de la cagnotte seedée",
    );
  });

  // Restauration IDEMPOTENTE, même après un échec en cours de test : sans
  // elle, une tentative tombée en mode « code tournant » laissait la donnée
  // seedée polluée, et le retry mourait dès son toHaveCount(2) d'entrée —
  // c'est exactement la panne vue en CI.
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== "desktop-smoke") return;
    await basculerModeValidation(page, /Validation en caisse/, 2).catch(
      () => {},
    );
  });

  test("mode staff : 2 pastilles ; passage en code tournant : 3 pastilles @smoke", async ({
    page,
  }) => {
    // Entrée AUTO-RÉPARANTE : on force l'état de départ au lieu de le
    // supposer — un run précédent interrompu ne peut plus faire mourir
    // celui-ci à l'entrée.
    await basculerModeValidation(page, /Validation en caisse/, 2);
    await basculerModeValidation(page, /Code au comptoir/, 3);
  });
});
