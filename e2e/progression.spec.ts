import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Méta-progression — module TRANSVERSE (scopé par organisation, sans addon
 * dédié) greffé au parcours de jeu, sur l'org « E2E Café » (owner.json) et sa
 * campagne garantie gagnante E2EWIN01 (supabase/seed.sql).
 *
 * Historique : ce fichier portait un unique `describe.serial` de treize étapes
 * en série (huit créations pilotées à l'écran, un lancement, une désactivation,
 * une réactivation, un parcours joueur, une clôture).
 *
 * Il a longtemps expliqué son instabilité par « la LONGUEUR de la chaîne, un
 * seul accroc faisant tomber les trois tests ». **Cette explication n'a jamais
 * reposé sur une mesure et elle est INFIRMÉE** (docs/bugs.md, 2026-07-30) : le
 * `describe.serial` qu'elle invoque n'existe plus depuis la réécriture en tests
 * indépendants, et le spec reste intermittent. Ne pas la reprendre sans la
 * mesurer — elle a servi trois jours à ne rien chercher.
 *
 * Ce que la mesure établit (`.github/workflows/flaky-measure.yml`, 20 essais
 * réarmés un par un) : **1 rouge sur 20**, toujours au même endroit — le titre
 * de la saison que le test vient de CRÉER n'apparaît pas dans les 30 s. La note
 * « DISCRIMINANT » du test concerné dit désormais lequel des deux mondes
 * possibles on observe, ce que « titre introuvable » ne disait pas.
 *
 * Découpage retenu : la configuration d'une saison COMPLÈTE (badge, collection,
 * objet, mission, coffre) est désormais SEMÉE en base (supabase/seed.sql,
 * org e2e10000-…, saison ACTIVE e2f00000-…0001) — l'E2E ne pilote plus que ce
 * qu'elle est seule à pouvoir prouver :
 *   1. l'éditeur : un test COURT et INDÉPENDANT (créer une saison, y ajouter un
 *      badge, vérifier la ligne) — trois étapes, prouve formulaire + revalidation.
 *      Une seule saison ACTIVE par organisation étant une contrainte SERVEUR
 *      (progression_seasons_one_active_org_idx), et la saison semée occupant déjà
 *      ce rôle, la saison créée ici reste un BROUILLON : assertions adaptées.
 *   2. le joueur : spin → jauge 1/1 → clé → ouverture du coffre → objet obtenu,
 *      contre la saison SEMÉE. Preuve de bout en bout du correctif d'identité
 *      (20260805230000) — c'est la seule chose que ce test doit prouver, il ne
 *      crée plus rien lui-même.
 *   3. la clôture : porte sur la saison SEMÉE (elle est active dès le seed, et
 *      lancer une seconde saison active est impossible tant qu'elle tourne — la
 *      clôturer sur un brouillon fraîchement créé exigerait de la lancer d'abord,
 *      ce qu'interdit cette même contrainte). Elle doit donc s'exécuter APRÈS le
 *      test joueur ci-dessus, qui a besoin de la saison encore active — seul
 *      ordre encore imposé, et il tient à une contrainte serveur documentée, pas
 *      à un enchaînement d'actions d'écran. `describe.serial` disparaît (chaque
 *      test qui échoue ne fait plus tomber les autres) ; `retries: 0` couvre les
 *      DEUX blocs qui mutent l'état, pour deux raisons distinctes écrites à
 *      chacun : ni la saison semée ni le brouillon créé ici ne se rejouent
 *      depuis l'état qu'une tentative ratée laisse derrière elle.
 *
 * Style et locators alignés sur e2e/referral.spec.ts et e2e/quiz.spec.ts :
 * getByRole + nom exact, jamais un getByText ambigu.
 */

const SLUG = "E2EWIN01";
const SEEDED_SEASON_NAME = "Saison E2E";
/**
 * Unique par EXÉCUTION, jamais par tentative — et c'est délibéré.
 *
 * Le rendre unique par tentative rendrait la reprise « propre », donc verte
 * dix-neuf fois sur vingt : Playwright classerait le test « flaky » et
 * sortirait en code 0 (`failOnFlakyTests` vaut false par défaut). Le défaut
 * disparaîtrait de la CI ET du harnais de mesure, qui compte un essai VERT sur
 * ce même code de sortie. C'est très exactement le faux vert que ce projet a
 * déjà payé deux fois. La reprise est donc supprimée (`retries: 0` plus bas),
 * pas rendue confortable.
 */
const DRAFT_SEASON_NAME = `Saison E2E brouillon ${Date.now()}`;

/**
 * Rendu non-éditeur : le cashier n'a pas de rôle owner|editor, donc
 * `canConfigure` est faux côté RPC quel que soit l'état des saisons — le
 * message ne dépend PAS de l'existence d'une saison active, seulement du
 * rôle. Fixture `cashier.json` déjà posée par auth.setup.ts pour
 * roles.spec.ts : pas de nouvelle session à créer, coût nul face au
 * rate-limit login.
 */
test.describe("méta-progression — rendu non-éditeur", () => {
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("un cashier voit les agrégats mais pas la configuration des saisons", async ({
    page,
  }) => {
    await page.goto("/dashboard/progression");
    await expect(
      page.getByRole("heading", { name: "Progression", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Les 4 tuiles d'agrégats restent visibles pour tout rôle.
    await expect(page.getByText("Joueurs suivis")).toBeVisible();
    await expect(page.getByText("Missions accomplies")).toBeVisible();
    await expect(page.getByText("Clés gagnées")).toBeVisible();
    await expect(page.getByText("Coffres ouverts")).toBeVisible();

    // Écran honnête du rôle non-éditeur, jamais une liste vide trompeuse.
    await expect(
      page.getByRole("heading", {
        name: "Les saisons ne vous sont pas montrées",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "+ Nouvelle saison" }),
    ).toHaveCount(0);
  });
});

test.describe("méta-progression — éditeur", () => {
  /**
   * `retries: 0` — ce test N'EST PAS REJOUABLE depuis l'état que sa propre
   * tentative ratée laisse derrière elle, et une reprise ne peut ici que
   * mentir. Le nom de la saison est figé pour le processus (voir
   * DRAFT_SEASON_NAME) : la reprise recrée LA MÊME saison sur une base qui en
   * porte déjà une. Deux issues, toutes deux mauvaises —
   *   · la seconde création passe : deux titres identiques, violation du mode
   *     strict, et un message qui ne dit plus rien de la cause d'origine ;
   *   · la seconde création est refusée : le titre laissé par la tentative 1
   *     satisfait l'assertion et le test PASSE sans avoir rien prouvé.
   *
   * Le second cas est le pire : c'est un vert obtenu sur un résidu. Mieux vaut
   * une tentative unique dont le rouge veut dire quelque chose.
   */
  test.describe.configure({ retries: 0 });
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("l'éditeur crée une saison et y ajoute un badge @smoke", async ({
    page,
  }, testInfo) => {
    // Exécuté sur un seul projet : la saison SEMÉE étant déjà active pour
    // l'organisation, plusieurs projets créant chacun un brouillon en parallèle
    // ne se disputent rien de partagé, mais borner à un projet évite d'empiler
    // des brouillons inutilement à chaque exécution multi-navigateurs.
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "un seul projet suffit à prouver le formulaire et sa revalidation",
    );
    await page.goto("/dashboard/progression");
    await expect(
      page.getByRole("heading", { name: "Progression", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "+ Nouvelle saison" }).click();
    await page.getByLabel("Nom de la saison").fill(DRAFT_SEASON_NAME);

    const now = new Date();
    const starts = now.toISOString().slice(0, 16);
    const ends = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    await page.getByLabel("Début", { exact: true }).fill(starts);
    await page.getByLabel("Fin", { exact: true }).fill(ends);

    await page
      .getByRole("checkbox", {
        name: /J'ai compris qu'une fois lancée/,
      })
      .check();
    await page.getByRole("button", { name: "Créer la saison" }).click();

    // ── DISCRIMINANT ────────────────────────────────────────────────────────
    // « titre introuvable » confondait deux mondes très différents, et cette
    // confusion a coûté trois jours de diagnostic faux sur ce fichier
    // (docs/bugs.md) : la création REFUSÉE par le serveur, et la création
    // RÉUSSIE que l'écran ne montre pas. Le second est un défaut de production,
    // le premier non — et rien ne les séparait.
    //
    // Le panneau ne se referme QUE dans la branche de succès de l'action
    // (`progression-new-season.tsx` : `setOpen(false)` après `result.ok`). Son
    // repliement prouve donc que la saison est en base. Il ne dépend d'aucun
    // arbre renvoyé par le serveur — c'est un `setState` local, commité par le
    // rendu ordinaire.
    //
    // Rouge si : le serveur refuse (zod, `is_org_editor`, `invalid season`),
    // l'action n'aboutit pas, ou le client ne commite plus aucun rendu. Dans
    // les trois cas le panneau reste ouvert et affiche son message.
    await expect(
      page.getByRole("button", { name: "+ Nouvelle saison" }),
    ).toBeVisible({ timeout: 30_000 });

    const seasonHeading = page.getByRole("heading", {
      name: DRAFT_SEASON_NAME,
    });
    // Si c'est CETTE assertion qui tombe alors que la précédente est passée,
    // ni le test ni le serveur ne sont en cause : la saison EXISTE et l'écran
    // ne la montre pas. Ce que vit alors le commerçant : il crée sa saison,
    // rien n'apparaît, il recommence — et se retrouve avec des doublons.
    // NE PAS « stabiliser » par un `reload()` ni par un délai : ce serait
    // effacer le dernier symptôme qui reste de ce défaut.
    await expect(seasonHeading).toBeVisible({ timeout: 30_000 });
    const card = page.locator("section").filter({ has: seasonHeading });
    // La saison SEMÉE occupe déjà le rôle « active » de l'organisation : celle
    // créée ici reste forcément en BROUILLON (progression_seasons_one_active_org_idx).
    // `exact` : `getByText` matche par sous-chaîne et sans respecter la casse,
    // sans lui « Brouillon » attraperait aussi la note qui suit juste en dessous.
    await expect(card.getByText("Brouillon", { exact: true })).toBeVisible();

    await card.getByLabel("Nom du badge").fill("Habitué du comptoir");
    await card.getByRole("button", { name: "Ajouter le badge" }).click();
    await expect(
      card.getByText("⭐ Habitué du comptoir", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });

    await expectNoA11yViolations(page, testInfo);
  });
});

/**
 * `retries: 0` DÉLIBÉRÉ sur ces deux tests : ils portent tous deux sur la MÊME
 * saison SEMÉE (e2f00000-…0001, ACTIVE dès le seed) et doivent s'exécuter dans
 * cet ORDRE — le test joueur d'abord, la clôture ensuite. Une reprise du test
 * joueur après que la clôture a eu lieu retomberait sur une saison fermée et
 * échouerait à tort ; Playwright exécute les tests d'un même fichier en série
 * dans l'ordre de déclaration (fullyParallel désactivé), cet ordre est donc
 * garanti sans `describe.serial` — et sans lui, un échec du premier test ne fait
 * plus disparaître le second, ce qui est tout le gain de ce découpage.
 */
test.describe("méta-progression — cycle de vie de la saison semée", () => {
  test.describe.configure({ retries: 0 });
  test.use({ storageState: "e2e/.auth/owner.json" });

  // RÉACTIVÉ (20260805230000, ADR-045). Ce test a été neutralisé le temps qu'un
  // prérequis tombe : le premier tour de roue d'un joueur neuf ne faisait
  // progresser aucune mission.
  //
  // La cause n'était PAS celle que la neutralisation annonçait. La résolution
  // du `player_id` depuis `player_legacy_identities` existait et fonctionnait
  // déjà, dans `append_experience_event_internal`. Le défaut tenait à un ORDRE
  // d'écriture : `resolve_player_identity` insère l'adhésion avant la ligne de
  // pont — la FK composite l'impose — or c'est le trigger de l'adhésion qui
  // portait le rattrapage, et il lisait un pont pas encore écrit. Le mécanisme
  // existait, décalé d'une visite entière.
  //
  // Le rattrapage se déclenche désormais sur `player_legacy_identities`, là où
  // la correspondance devient vraie. C'est ce test qui le prouve de bout en
  // bout : spin → événement attribué → mission à 1/1 → clé → coffre ouvrable.
  test("après un spin, le panneau de progression du joueur affiche la mission", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "porte sur la saison semée, partagée avec le test de clôture suivant — exécuté sur un seul projet",
    );
    // Device vierge : un joueur anonyme, sans lien avec l'éditeur.
    await page.context().clearCookies();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto(`/play/${SLUG}`);
    await expect(
      page.getByRole("button", { name: "Lancer la roue" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Lancer la roue" }).click();
    await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });

    // Le panneau « Votre progression » se greffe après la partie, contre la
    // saison SEMÉE (mission à progression 1/1 dès ce premier spin).
    await expect(
      page.getByRole("heading", { name: "Votre progression" }),
    ).toBeVisible({ timeout: 30_000 });
    // Idem côté joueur : `exact` pour ne pas dépendre de l'absence d'un autre
    // nom de saison qui commencerait pareil.
    await expect(
      page.getByText(SEEDED_SEASON_NAME, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Jouer une fois : 1 sur 1",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 clé disponible/)).toBeVisible();

    await expectNoA11yViolations(page, testInfo);

    // La clé gagnée ouvre le coffre semé (« Le coffre du cellier »).
    const openButton = page.getByRole("button", { name: "Ouvrir" });
    await expect(openButton).toBeEnabled({ timeout: 30_000 });
    await openButton.click();
    await expect(
      page.getByText(/Nouvel objet : La carte du domaine/),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("l'éditeur clôt la saison semée — la clôture est définitive", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "porte sur la saison semée, partagée avec le test joueur précédent — exécuté sur un seul projet",
    );
    await page.goto("/dashboard/progression");
    // `exact` INDISPENSABLE depuis que ce fichier crée aussi un brouillon :
    // `getByRole` compare le nom accessible par SOUS-CHAÎNE, et « Saison E2E
    // brouillon 1785… » contient « Saison E2E ». Sans lui, deux titres matchent
    // et l'assertion tombe en violation de mode strict.
    const seasonHeading = page.getByRole("heading", {
      name: SEEDED_SEASON_NAME,
      exact: true,
    });
    await expect(seasonHeading).toBeVisible({ timeout: 30_000 });
    const card = page.locator("section").filter({ has: seasonHeading });

    await card
      .getByRole("button", { name: `Clore la saison ${SEEDED_SEASON_NAME}` })
      .click();
    await expect(
      card.getByRole("group", {
        name: `Clore « ${SEEDED_SEASON_NAME} » maintenant ?`,
      }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Oui, clore définitivement" })
      .click();
    await expect(card.getByText("Terminée", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Aller simple : aucun bouton ne relance une saison close.
    await expect(
      card.getByRole("button", {
        name: `Lancer la saison ${SEEDED_SEASON_NAME}`,
      }),
    ).toHaveCount(0);
  });
});
