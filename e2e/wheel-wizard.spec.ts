import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * L'Atelier du jeu (`/dashboard/campaigns/<id>/wheel`) — filet de bout en
 * bout et d'accessibilité. Aucune spec ne visitait cette page avant ce
 * chantier : c'est le premier scan axe qui s'y pose.
 *
 * Fixtures : org « E2E Café » seedée (supabase/seed.sql), session owner.
 *   - E2E Gagnante  (e2e20000-…0001 / roue e2e30000-…0001) : QR + 2 lots dont
 *     1 gagnant à poids 100, sans dates → tous les contrôles de vérification
 *     passent (utile pour prouver le ✓ et le CTA « prêt »).
 *   - E2E En pause  (e2e20000-…0004 / roue e2e30000-…0004) : sans lot ni QR
 *     désactivé — pas de lot du tout → « Au moins un lot peut être gagné » et
 *     « Les chances de gain tiennent debout » sortent en ✗, chacun avec un
 *     lien vers l'étape « Les lots » (utile pour le ✗ et son lien).
 *
 * Un seul test de navigation porte @smoke (coût : 5 chargements de page) ;
 * le reste (radiogroup, vérification, création, a11y par étape) ne tourne
 * qu'en mobile, comme dashboard-home.spec.ts le fait pour les mêmes raisons.
 */
const CAMPAIGN_GAGNANTE = "e2e20000-0000-4000-8000-000000000001";
const WHEEL_GAGNANTE = "e2e30000-0000-4000-8000-000000000001";
const CAMPAIGN_PAUSE = "e2e20000-0000-4000-8000-000000000004";

test.describe("Atelier du jeu — navigation par étape", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("sans ?etape= l'Atelier rend « Le jeu » ; chaque étape se rend ; une étape inconnue retombe sur « Le jeu » @smoke", async ({
    page,
  }) => {
    await page.goto(`/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel`);
    await expect(
      page.getByRole("heading", { name: "L'atelier du jeu" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Le jeu" })).toBeVisible();

    const etapes: Array<{ etape: string; heading: string }> = [
      { etape: "jeu", heading: "Le jeu" },
      { etape: "lots", heading: /^Lots \(/ as unknown as string },
      { etape: "habillage", heading: "" },
      { etape: "creneau", heading: "" },
      // Les deux étapes entrées dans l'atelier : « Avant de jouer » et
      // « Après le gain » d'un côté, le partage et le parrainage de l'autre.
      // Pas d'assertion de titre — comme habillage et créneau, leur contenu
      // porte plusieurs cartes et aucun heading unique ne les résume.
      { etape: "parcours", heading: "" },
      { etape: "partage", heading: "" },
      { etape: "verification", heading: "Tout est-il prêt ?" },
    ];

    for (const { etape } of etapes) {
      await page.goto(
        `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?etape=${etape}`,
      );
      await expect(page).toHaveURL(new RegExp(`etape=${etape}`));
      // Chaque étape porte le landmark numéroté commun aux cinq écrans.
      await expect(
        page.locator("section[aria-label^='Étape']"),
      ).toBeVisible();
    }

    // Valeur inconnue → « Le jeu », pas de 404.
    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?etape=n-importe-quoi`,
    );
    await expect(page.getByRole("heading", { name: "Le jeu" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "L'atelier du jeu" }),
    ).toBeVisible();
  });
});

test.describe("Atelier du jeu — stepper, étapes et a11y", () => {
  /**
   * REPART D'UNE ROUE SANS FOND — la précondition est ÉTABLIE, plus supposée.
   *
   * ── LE DÉFAUT QUE CETTE AIDE FERME ──
   *
   * Les deux tests d'habillage travaillent sur LA MÊME roue seedée, et tous
   * deux commençaient par affirmer « roue seedée sans fond ». Or l'atelier
   * ENREGISTRE TOUT SEUL (`useAutoSave`, 800 ms de débounce) : le clic « sans
   * avoir rien enregistré » du premier test peint la roue POUR DE BON. Celui
   * qui passait en second trouvait un fond là où il en exigeait zéro.
   *
   * D'où des rougeurs qui semblaient aléatoires : elles ne dépendaient que de
   * l'ordre d'exécution, et une base fraîchement semée les faisait
   * disparaître — ce qui explique qu'une simple relance « réparait » tout.
   * La reprise (`retry`) ne réparait rien, elle : le second essai retombait
   * sur la roue que le premier venait de salir.
   *
   * ── POURQUOI UN RECHARGEMENT, ET PAS UN INDICATEUR ──
   *
   * `dirty` ne retombe QUE sur le bouton d'enregistrement explicite : après
   * une sauvegarde automatique, le message « Style enregistré » n'apparaît
   * jamais. Attendre un indicateur, c'est attendre un signal qui ne viendra
   * pas. Le rechargement, lui, prouve ce qui compte vraiment : ce que la BASE
   * a retenu. Et la boucle recommence si l'écriture n'a pas encore atterri.
   */
  async function repartirSansFond(page: Page) {
    const groupe = page.getByRole("group", { name: "Fond d'écran" });
    const aucun = groupe.getByRole("radio", { name: "Aucun" });
    const fondApercu = page.locator("[data-apercu='accueil-jeu'] [data-fond]");
    await expect(aucun).toBeVisible({ timeout: 30_000 });

    await expect(async () => {
      if (!(await aucun.isChecked())) {
        await aucun.check();
        // Le débounce vaut 800 ms. On attend que l'indicateur d'attente
        // s'efface plutôt que de compter les millisecondes.
        await expect(page.getByText("Modification en attente")).toHaveCount(0, {
          timeout: 10_000,
        });
      }
      await page.reload();
      await expect(fondApercu).toHaveCount(0, { timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
  }

  test.use({ storageState: "e2e/.auth/owner.json" });

  test("le fil des 5 étapes affiche 5 pastilles, aria-current sur la courante", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Un seul contexte suffit pour un fil de navigation statique",
    );

    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?etape=lots`,
    );
    const stepper = page.getByRole("navigation", {
      name: "Étapes de l'atelier",
    });
    await expect(stepper).toBeVisible();
    const pastilles = stepper.getByRole("listitem");
    // SEPT depuis que « Le parcours joueur » et « Le partage » sont entrés
    // dans l'atelier. Ce compte est la garde qui dit que le fil suit vraiment
    // `ETAPES_ROUE` — le jour où une étape y est ajoutée sans être rendue,
    // c'est ici que ça se voit.
    await expect(pastilles).toHaveCount(7);

    const courante = stepper.locator('[aria-current="step"]');
    await expect(courante).toHaveCount(1);
    await expect(courante).toContainText("Les lots");

    await expectNoA11yViolations(page, testInfo);
  });

  test("étape « Le jeu » : le radiogroup des mécaniques existe, choisir « Mot mystère » désactive « Illimité (démo) »", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Comportement de formulaire, un seul contexte suffit",
    );

    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?wheel=${WHEEL_GAGNANTE}&etape=jeu`,
    );

    // Deux familles de mécaniques, chacune un vrai groupe de boutons radio.
    await expect(
      page.getByRole("group", { name: "Le hasard décide" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Le client joue son gain" }),
    ).toBeVisible();
    const roue = page.getByRole("radio", { name: /Roue/ });
    const motMystere = page.getByRole("radio", { name: /Mot mystère/ });
    await expect(roue).toBeVisible();
    await expect(motMystere).toBeVisible();

    const limite = page.getByLabel("Chaque client peut jouer");
    const optionIllimite = limite.locator('option[value="unlimited"]');
    await expect(optionIllimite).toBeEnabled();

    await motMystere.check();
    await expect(motMystere).toBeChecked();
    await expect(optionIllimite).toBeDisabled();

    await expectNoA11yViolations(page, testInfo);
  });

  test("étape « La vérification » : lignes ✓/✗, un ✗ porte un lien vers son étape, le CTA pointe vers #statut", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Lecture d'état, un seul contexte suffit",
    );

    // Campagne SANS lot ni QR : au moins un contrôle ressort en ✗.
    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_PAUSE}/wheel?etape=verification`,
    );
    await expect(
      page.getByRole("heading", { name: "Tout est-il prêt ?" }),
    ).toBeVisible();

    const ligneLots = page
      .locator("li", { hasText: "Au moins un lot peut être gagné" })
      .first();
    await expect(ligneLots).toBeVisible();
    // Le sr-only devant le titre porte l'annonce d'état — plus fiable que le
    // glyphe ✗, `aria-hidden` et donc invisible du côté accessible.
    await expect(ligneLots.getByText("À corriger :")).toBeVisible();
    const lienCorrection = ligneLots.getByRole("link", {
      name: /Corriger à l'étape « Les lots »/,
    });
    await expect(lienCorrection).toBeVisible();
    await expect(lienCorrection).toHaveAttribute(
      "href",
      new RegExp(`/dashboard/campaigns/${CAMPAIGN_PAUSE}/wheel\\?etape=lots`),
    );

    // Le CTA final (« prêt » ou « pas prêt ») pointe toujours vers #statut —
    // le seul écran qui publie.
    const cta = page.locator(`a[href$="#statut"]`).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      `/dashboard/campaigns/${CAMPAIGN_PAUSE}#statut`,
    );

    await expectNoA11yViolations(page, testInfo);
  });

  test("campagne prête : la ligne de contrôle passe en ✓ et le CTA « Ouvrir aux joueurs » pointe vers #statut", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Lecture d'état, un seul contexte suffit",
    );

    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?wheel=${WHEEL_GAGNANTE}&etape=verification`,
    );
    await expect(
      page.getByText("Rien ne manque. Il ne reste qu'à ouvrir le jeu à vos clients."),
    ).toBeVisible();
    const cta = page.getByRole("link", {
      name: "Tout est prêt — Ouvrir aux joueurs",
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}#statut`,
    );

    await expectNoA11yViolations(page, testInfo);
  });

  test("étapes « Les lots », « L'habillage » et « Le créneau » : rendu sans violation a11y", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Scan a11y, un seul contexte suffit — 3 chargements par test suffisent",
    );

    for (const etape of ["lots", "habillage", "creneau", "parcours", "partage"]) {
      await page.goto(
        `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?wheel=${WHEEL_GAGNANTE}&etape=${etape}`,
      );
      await expect(
        page.locator("section[aria-label^='Étape']"),
      ).toBeVisible();
      await expectNoA11yViolations(page, testInfo);
    }
  });

  /**
   * Le sélecteur de fond d'écran, et surtout SA PROMESSE : l'aperçu se repeint
   * au clic, avant tout enregistrement. C'est le patron `ApercuAccueilJeu` —
   * il a été livré précisément parce que le commerçant choisissait une option
   * et ne la voyait nulle part avant d'enregistrer puis de changer d'étape.
   *
   * L'assertion porte sur `data-fond` de la couche `FondEcran`, pas sur une
   * URL d'image : c'est l'attribut que le composant garantit, et il survit à
   * un changement de nom de fichier ou de largeur servie.
   */
  test("étape « L'habillage » : choisir un fond d'écran repeint l'aperçu au clic", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Interaction d'éditeur, un seul contexte suffit",
    );

    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?wheel=${WHEEL_GAGNANTE}&etape=habillage`,
    );

    const groupe = page.getByRole("group", { name: "Fond d'écran" });
    await expect(groupe).toBeVisible();

    // L'assertion vise l'APERÇU, pas la page : les onze vignettes du
    // sélecteur portent elles aussi un `data-fond`, un compte global serait
    // vert sans que l'aperçu ait bougé.
    const fondApercu = page.locator("[data-apercu='accueil-jeu'] [data-fond]");

    // La roue est peut-être encore peinte par un autre test : on l'efface
    // au lieu de parier qu'elle est vierge.
    await repartirSansFond(page);

    await groupe.getByRole("radio", { name: "Noël" }).check();

    // Repeint au clic, sans avoir rien enregistré.
    await expect(fondApercu).toHaveAttribute("data-fond", "noel");
  });

  /**
   * LES DEUX MOITIÉS DE LA RÈGLE DES PRESETS, dans un seul parcours.
   *
   * Un UNIVERS pose son fond d'écran en même temps que ses couleurs — c'est
   * ce que sa légende promet au commerçant, et rien d'autre ne le vérifie
   * (les tests unitaires lisent la table, pas l'écran).
   *
   * Une AMBIANCE, cliquée ensuite, ne doit PAS l'effacer. C'était le défaut :
   * `setStyle(preset)` nu supprimait `fond` puisque les ambiances n'en
   * portent pas. Le commerçant perdait sa photo sur un clic de curiosité,
   * sans un mot. L'ordre des deux clics EST le test.
   */
  test("étape « L'habillage » : un univers pose son fond, une ambiance ne l'efface pas", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Interaction d'éditeur, un seul contexte suffit",
    );

    await page.goto(
      `/dashboard/campaigns/${CAMPAIGN_GAGNANTE}/wheel?wheel=${WHEEL_GAGNANTE}&etape=habillage`,
    );

    const univers = page.getByRole("group", { name: "Univers" });
    const ambiances = page.getByRole("group", { name: "Ambiances" });
    const fondApercu = page.locator("[data-apercu='accueil-jeu'] [data-fond]");

    await repartirSansFond(page);

    await univers.getByRole("button", { name: "Football" }).click();
    await expect(fondApercu).toHaveAttribute("data-fond", "football");
    await expect(
      univers.getByRole("button", { name: "Football" }),
    ).toHaveAttribute("aria-pressed", "true");

    // Une ambiance change les couleurs et LAISSE l'image en place. Le style
    // est « sale » depuis le premier clic : la confirmation d'écrasement est
    // acceptée, sinon le second clic ne ferait rien du tout.
    page.once("dialog", (d) => d.accept());
    await ambiances.getByRole("button", { name: "Néon" }).click();
    await expect(fondApercu).toHaveAttribute("data-fond", "football");
  });
});

test.describe("Atelier du jeu — création d'une campagne", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("créer une campagne depuis /dashboard/campaigns atterrit dans l'Atelier", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("mobile"),
      "Parcours de création, un seul contexte suffit",
    );

    await page.goto("/dashboard/campaigns");
    await page
      .getByRole("button", { name: "+ Nouvelle campagne" })
      .first()
      .click();

    const nom = `E2E Atelier ${Date.now()}`;
    await page.getByLabel("Nom de la campagne").fill(nom);
    await page.getByRole("button", { name: "Créer" }).click();

    await expect(page).toHaveURL(/\/dashboard\/campaigns\/[0-9a-f-]{36}\/wheel$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "L'atelier du jeu" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Le jeu" })).toBeVisible();
  });
});
