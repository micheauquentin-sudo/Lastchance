import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Méta-progression — module TRANSVERSE (scopé par organisation, sans addon
 * dédié) greffé au parcours de jeu, sur l'org « E2E Café » (owner.json) et sa
 * campagne garantie gagnante E2EWIN01 (supabase/seed.sql).
 *
 * Aucune saison n'est seedée : le module n'a pas de fixture déterministe comme
 * le quiz ou le parrainage (`/dashboard/progression` le dit explicitement —
 * pas d'addon, pas d'écran d'offre). La spec CRÉE donc sa propre saison de
 * bout en bout, puis vérifie ce que le joueur en voit avant de la clore.
 *
 * `test.describe.serial` : la saison créée par le premier test doit rester
 * EN COURS pour que le second (le joueur) y progresse, et TOUJOURS en cours
 * pour que le troisième (la clôture) ait quelque chose à clore. Un nom de
 * saison horodaté évite toute collision avec une saison laissée par une
 * exécution précédente (l'unicité de la saison active est une contrainte
 * serveur, pas seulement une redondance d'UI).
 *
 * Style et locators alignés sur e2e/referral.spec.ts et e2e/quiz.spec.ts :
 * getByRole + nom exact, jamais un getByText ambigu.
 */

const SLUG = "E2EWIN01";
const SEASON_NAME = `Saison E2E ${Date.now()}`;

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

/**
 * ⚠️ INSTABLE — DETTE CONNUE ET ASSUMÉE, à fiabiliser dans un chantier dédié.
 *
 * Ce bloc enchaîne, EN SÉRIE et sur un seul projet : huit créations pilotées à
 * l'écran (saison, badge, collection, objet, mission, coffre), un lancement, une
 * désactivation, une réactivation, un parcours joueur complet et une clôture.
 * Chaque étape est une action serveur suivie d'une revalidation.
 *
 * Conséquence mesurée sur six passages CI consécutifs : l'échec se DÉPLACE —
 * titre de saison, collection, objet, mission, réactivation, coffre — avec un
 * code identique d'un passage à l'autre. Ce n'est pas un défaut applicatif : le
 * module est prouvé par 1 804 assertions pgTAP (dont un contrôle négatif), et ce
 * parcours est passé intégralement à plusieurs reprises, en CI comme en local.
 * C'est la LONGUEUR de la chaîne qui est fragile : un seul accroc n'importe où
 * fait tomber les trois tests, `describe.serial` empêchant les suivants de
 * tourner.
 *
 * `retries: 0` est DÉLIBÉRÉ et doit le rester : l'état est partagé entre les
 * trois étapes, et une reprise rejouerait la chaîne contre une base portant déjà
 * une saison — la page en afficherait deux, état que la CI ne connaît pas.
 * Chaque accroc devient donc un échec dur, ce qui rend l'instabilité VISIBLE
 * plutôt que noyée dans une reprise silencieuse. C'est le bon compromis tant que
 * la cause n'est pas traitée.
 *
 * La correction juste n'est pas d'allonger les délais ni d'autoriser les
 * reprises, mais de SEMER la configuration de saison directement en base et de
 * ne faire porter à l'E2E que les comportements d'écran. Essayé et écarté ici :
 * c'est un chantier, pas une retouche.
 */
test.describe.serial("méta-progression — cycle de vie complet", () => {
  test.describe.configure({ retries: 0 });
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("l'éditeur crée, configure et lance une saison @smoke", async ({
    page,
  }, testInfo) => {
    // Ressource PARTAGÉE entre les trois étapes du describe.serial (création
    // → spin → clôture) : une seule saison active à la fois est une
    // contrainte SERVEUR, pas seulement d'UI — deux projets en parallèle se
    // disputeraient la même saison, exactement comme le lot de coffre unique
    // du parrainage.
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "cycle de vie partagé entre les trois étapes — exécuté sur un seul projet",
    );
    test.slow();
    await page.goto("/dashboard/progression");
    await expect(
      page.getByRole("heading", { name: "Progression", exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // ── Création de la saison ──────────────────────────────────
    await page.getByRole("button", { name: "+ Nouvelle saison" }).click();
    await page.getByLabel("Nom de la saison").fill(SEASON_NAME);

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

    const seasonHeading = page.getByRole("heading", { name: SEASON_NAME });
    await expect(seasonHeading).toBeVisible({ timeout: 30_000 });
    const card = page
      .locator("section")
      .filter({ has: seasonHeading });
    // `exact` sur TOUTES les pastilles de statut : `getByText` matche par
    // sous-chaîne et sans respecter la casse. Sans lui, « Brouillon » attrape
    // aussi la note « Tant que la saison est en brouillon, tout reste… ».
    // Les libellés rendus sont des chaînes exactes (progression-labels.ts,
    // props activeLabel/pausedLabel), donc l'égalité stricte est sûre.
    await expect(card.getByText("Brouillon", { exact: true })).toBeVisible();

    // ── 1. Badge ────────────────────────────────────────────────
    await card.getByLabel("Nom du badge").fill("Habitué du comptoir");
    await card.getByRole("button", { name: "Ajouter le badge" }).click();
    await expect(
      card.getByText("⭐ Habitué du comptoir", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 2. Collection et objet ─────────────────────────────────
    await card.getByLabel("Nom de la collection").fill("Les vignerons");
    await card
      .getByRole("button", { name: "Ajouter la collection" })
      .click();
    // `exact` sur tous les noms saisis : cet éditeur RÉAFFICHE chaque nom
    // dans le libellé du formulaire suivant — ici la légende « Nouvel objet
    // dans « Les vignerons » » — et `getByText` matche par sous-chaîne. Le
    // nom lui-même est rendu dans un <p> qui ne contient que lui.
    await expect(card.getByText("Les vignerons", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    await card.getByLabel("Nom de l'objet").fill("La carte du domaine");
    await card.getByRole("button", { name: "Ajouter l'objet" }).click();
    await expect(
      card.getByText("La carte du domaine", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 3. Mission ──────────────────────────────────────────────
    // Palier à 1 : un unique spin gagnant suffit à la faire progresser dans
    // le test joueur qui suit. Type d'expérience « campaign » coché par
    // défaut par le formulaire — exactement ce que couvre E2EWIN01.
    await card.getByLabel("Nom de la mission").fill("Jouer une fois");
    await card.getByLabel("Palier à atteindre").fill("1");
    await card
      .getByLabel("Clés versées à l'achèvement")
      .fill("1");
    await card
      .getByLabel("Badge octroyé (facultatif)")
      .selectOption({ label: "Habitué du comptoir" });
    // La mission n'octroie PAS d'objet, à dessein. « La carte du domaine » est
    // le seul contenu du coffre créé plus bas, et `availableItems` compte les
    // objets que le joueur ne possède pas ENCORE : une mission qui le donnerait
    // viderait le coffre d'avance, et son bouton « Ouvrir » resterait
    // désactivé — le test s'interdirait lui-même l'étape qu'il veut prouver.
    // Le badge couvre l'octroi par mission ; le coffre couvre l'octroi par clé.
    await card.getByRole("button", { name: "Ajouter la mission" }).click();
    // Ancré au DÉBUT, pas égal : `MissionRow` rend le nom et la pastille
    // d'état dans le MÊME <p>, dont le texte vaut « Jouer une foisActive ».
    // L'ancre exclut les boutons, qui ne commencent pas par le nom.
    await expect(card.getByText(/^Jouer une fois/)).toBeVisible({
      timeout: 30_000,
    });

    // ── 4. Coffre ───────────────────────────────────────────────
    await card.getByLabel("Nom du coffre").fill("Le coffre du cellier");
    await card.getByLabel("Coût en clés").fill("1");
    await card
      .getByLabel("Les vignerons · La carte du domaine")
      .check();
    await card.getByRole("button", { name: "Ajouter le coffre" }).click();
    // Même structure que MissionRow : le texte vaut « Le coffre du cellierActif ».
    await expect(card.getByText(/^Le coffre du cellier/)).toBeVisible({
      timeout: 30_000,
    });

    // Scan a11y de l'éditeur, saison entièrement configurée mais pas encore
    // lancée (état le plus chargé de la page : les 4 étapes sont dépliées).
    await expectNoA11yViolations(page, testInfo);

    // ── Lancement ───────────────────────────────────────────────
    await card
      .getByRole("button", { name: `Lancer la saison ${SEASON_NAME}` })
      .click();
    await expect(
      card.getByRole("group", {
        name: `Lancer « ${SEASON_NAME} » ?`,
      }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Oui, lancer la saison" })
      .click();
    await expect(card.getByText("En cours", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Configuration figée : la saison lancée passe en lecture seule, les
    // formulaires d'ajout disparaissent.
    await expect(
      card.getByRole("button", { name: "Ajouter le badge" }),
    ).toHaveCount(0);

    // ── Interrupteur d'arrêt (mission), saison active ────────────
    // Finding de la revue de sécurité : le commerçant doit pouvoir couper une
    // mission trop généreuse sans clore toute la saison. Vérifié ici, puis
    // réactivé avant le test joueur suivant qui compte sur elle pour avancer.
    await card
      .getByRole("button", { name: "Désactiver la mission Jouer une fois" })
      .click();
    await expect(
      card.getByRole("group", {
        name: "Désactiver la mission « Jouer une fois » ?",
      }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Oui, désactiver la mission" })
      .click();
    await expect(card.getByText("Désactivée", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // Panneau joueur : un joueur anonyme distinct ne voit plus la mission
    // coupée après un spin gagnant — l'`EnabledPill` dit l'état, ce contrôle
    // dit l'effet.
    const cutoffContext = await page.context().browser()!.newContext();
    const cutoffPage = await cutoffContext.newPage();
    await cutoffPage.goto(`/play/${SLUG}`);
    await expect(
      cutoffPage.getByRole("button", { name: "Lancer la roue" }),
    ).toBeVisible({ timeout: 30_000 });
    await cutoffPage.getByRole("button", { name: "Lancer la roue" }).click();
    await expect(cutoffPage.getByText("✦ GAGNÉ ✦")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      cutoffPage.getByRole("progressbar", {
        name: "Jouer une fois : 1 sur 1",
      }),
    ).toHaveCount(0);
    await cutoffContext.close();

    // Réactivation : redonne la mission au test joueur qui suit.
    await card
      .getByRole("button", { name: "Réactiver la mission Jouer une fois" })
      .click();
    await expect(
      card.getByRole("group", {
        name: "Réactiver la mission « Jouer une fois » ?",
      }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Oui, réactiver la mission" })
      .click();
    await expect(card.getByText("Active", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
  });

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
      "cycle de vie partagé entre les trois étapes — exécuté sur un seul projet",
    );
    // Device vierge : un joueur anonyme distinct de l'owner ci-dessus.
    await page.context().clearCookies();
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto(`/play/${SLUG}`);
    await expect(
      page.getByRole("button", { name: "Lancer la roue" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Lancer la roue" }).click();
    await expect(page.getByText("✦ GAGNÉ ✦")).toBeVisible({ timeout: 30_000 });

    // Le panneau « Votre progression » se greffe après la partie, avec la
    // saison lancée à l'étape précédente et sa mission à progression 1/1.
    await expect(
      page.getByRole("heading", { name: "Votre progression" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(SEASON_NAME)).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Jouer une fois : 1 sur 1",
      }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/1 clé disponible/)).toBeVisible();

    await expectNoA11yViolations(page, testInfo);

    // La clé gagnée ouvre le coffre configuré à l'étape précédente.
    const openButton = page.getByRole("button", { name: "Ouvrir" });
    await expect(openButton).toBeEnabled({ timeout: 30_000 });
    await openButton.click();
    await expect(
      page.getByText(/Nouvel objet : La carte du domaine/),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("l'éditeur clôt la saison — la clôture est définitive", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "cycle de vie partagé entre les trois étapes — exécuté sur un seul projet",
    );
    await page.goto("/dashboard/progression");
    const seasonHeading = page.getByRole("heading", { name: SEASON_NAME });
    await expect(seasonHeading).toBeVisible({ timeout: 30_000 });
    const card = page.locator("section").filter({ has: seasonHeading });

    await card
      .getByRole("button", { name: `Clore la saison ${SEASON_NAME}` })
      .click();
    await expect(
      card.getByRole("group", { name: `Clore « ${SEASON_NAME} » maintenant ?` }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Oui, clore définitivement" })
      .click();
    await expect(card.getByText("Terminée", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    // Aller simple : aucun bouton ne relance une saison close.
    await expect(
      card.getByRole("button", { name: `Lancer la saison ${SEASON_NAME}` }),
    ).toHaveCount(0);
  });
});
