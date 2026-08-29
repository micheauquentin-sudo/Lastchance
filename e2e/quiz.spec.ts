import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";
import { CODE_CONSOMME } from "./redeem-card";

/**
 * Créateur de quiz — parcours joueur ASYNCHRONE de bout en bout, sur le quiz
 * déterministe seedé pour l'org « E2E Café » (supabase/seed.sql) :
 *
 *   /quiz/e2e-quiz   « Quiz du Comptoir E2E », actif, slug STABLE, mode
 *                    `threshold` (lot dès 2 bonnes réponses) sur stock FINI.
 *                    Trois questions couvrant trois modèles d'UI au-dessus de
 *                    trois formes de réponse :
 *                      0. multiple_choice / choice   (3 options, non chronométrée)
 *                      1. estimate       / number    (valeur exacte SECRÈTE)
 *                      2. timed          / text      (120 s, variante SECRÈTE)
 *
 * Ce que la spec tient, en plus du parcours nominal :
 *
 *  · NON-FUITE DE LA VÉRITÉ. Les deux dernières questions portent une réponse
 *    officielle qui n'a AUCUNE autre raison de figurer dans la page — c'est ce
 *    qui rend l'assertion probante (une option de choix multiple, elle, est
 *    servie légitimement : elle ne désigne pas la bonne réponse). On inspecte le
 *    document COMPLET par page.content() — donc aussi le payload RSC de
 *    /quiz/[slug] et tout ce que le polling y a injecté — à chaque étape où le
 *    joueur n'a pas ENCORE répondu à la question concernée. Même méthode que le
 *    mot mystère des jeux de défi (e2e/skill-games.spec.ts).
 *
 *  · CHRONOMÈTRE SERVEUR. La 3e question ouvre un sas explicite puis affiche un
 *    role="timer" : la fenêtre est LARGE (120 s) à dessein — la spec constate
 *    que le chronomètre EXISTE et est piloté par le serveur, elle ne court
 *    jamais après son expiration (la base seule tranche le hors-délai).
 *
 *  · UNE SEULE RÉPONSE PAR QUESTION. Après correction, l'interface n'offre plus
 *    que « question suivante » : aucun chemin de re-soumission n'est proposé.
 *
 *  · CAISSE. Le code QUIZ-… fraîchement gagné se valide UNE fois puis refuse le
 *    doublon. Chaque exécution émet son PROPRE code (identité cookie neuve) :
 *    aucune ressource à usage unique n'est disputée entre projets, contrairement
 *    au lot de coffre du parrainage.
 */

/**
 * Vérités SECRÈTES du quiz seedé — jamais servies avant la réponse du joueur.
 * Toutes deux sont choisies pour n'avoir AUCUNE autre raison d'apparaître : le
 * nombre est hors de portée des agrégats de temps (elapsed_ms, total_elapsed_ms)
 * que l'état porte légitimement pour les questions déjà répondues.
 */
const SECRET_NUMBER = "407312";
const SECRET_WORD = /PERROQUET/i;

/** Forme d'un code de retrait de quiz (alphabet de caisse, sans I/O/0/1). */
const QUIZ_CODE = /^QUIZ-[A-HJ-NP-Z2-9]{8}$/;

/**
 * Aucune vérité non due au joueur dans le document servi — payload RSC compris.
 * Appelée UNIQUEMENT à des instants où le joueur n'a pas encore répondu aux
 * questions à secret.
 */
async function expectNoTruthLeak(page: Page, step: string) {
  const html = await page.content();
  expect(html, `valeur exacte de l'estimation fuitée (${step})`).not.toContain(
    SECRET_NUMBER,
  );
  expect(html, `mot attendu de la question libre fuité (${step})`).not.toMatch(
    SECRET_WORD,
  );
}

test.describe("créateur de quiz — parcours joueur", () => {
  test("répond, se corrige, gagne son code QUIZ-… et le fait valider en caisse @smoke", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Parcours long (3 questions + clôture + double passage en caisse).
    test.slow();

    // ── 0. Arrivée sur la page publique ──────────────────────────
    await page.goto("/quiz/e2e-quiz");
    await expect(
      page.getByRole("heading", { name: "Quiz du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    // L'état public complet est déjà dans le payload RSC (toutes les questions,
    // y compris celles jamais présentées) : c'est l'instant le plus exigeant
    // pour la non-fuite.
    await expectNoTruthLeak(page, "chargement initial, avant inscription");

    // ── 1. Rejoindre (aucune PII obligatoire) ────────────────────
    await page.getByRole("button", { name: /Je joue/ }).click();

    // ── 2. Question 1 — choix multiple, non chronométrée ─────────
    // Non chronométrée : elle est présentée d'emblée, sans sas.
    const prompt1 = page.getByRole("heading", {
      name: "Quelle boisson fait la réputation du Comptoir E2E ?",
    });
    await expect(prompt1).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Question 1 / 3")).toBeVisible();

    // Les 3 options SONT servies — elles ne désignent pas la vérité — mais les
    // secrets des questions suivantes, eux, restent en base.
    await expect(page.getByRole("radio")).toHaveCount(3);
    await expectNoTruthLeak(page, "question 1 affichée, non répondue");

    // Aucune correction n'est visible tant que le joueur n'a pas répondu.
    await expect(page.getByText(/Bonne réponse/)).toHaveCount(0);
    await expect(page.getByText(/La bonne réponse était/)).toHaveCount(0);

    await page.getByRole("radio", { name: "Le café" }).check();
    await page.getByRole("button", { name: "Valider ma réponse" }).click();

    // Correction immédiate, tranchée par le serveur.
    await expect(page.getByText("✓ Bonne réponse !")).toBeVisible({
      timeout: 30_000,
    });
    // UNE SEULE RÉPONSE : le formulaire d'envoi a disparu, seule la suite reste.
    await expect(
      page.getByRole("button", { name: "Valider ma réponse" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Question suivante →" }).click();

    // ── 3. Question 2 — estimation chiffrée, vérité SECRÈTE ──────
    await expect(
      page.getByRole("heading", {
        name: "Combien de grains de café le bocal du Comptoir E2E contient-il ?",
      }),
    ).toBeVisible({ timeout: 30_000 });

    // La valeur exacte n'a toujours pas atteint le navigateur, alors même que la
    // question est à l'écran : elle n'arrivera qu'AVEC la correction.
    await expectNoTruthLeak(page, "question 2 affichée, non répondue");

    const estimate = page.getByLabel("Votre estimation");
    await expect(estimate).toHaveValue("");
    await estimate.fill(SECRET_NUMBER);
    await page.getByRole("button", { name: "Valider ma réponse" }).click();
    await expect(page.getByText("✓ Bonne réponse !")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Question suivante →" }).click();

    // ── 4. Question 3 — CHRONOMÉTRÉE, réponse libre secrète ──────
    // Chronométrée : un sas s'interpose, l'intitulé n'apparaît qu'au lancement.
    const gate = page.getByRole("button", { name: "Je suis prêt·e, on y va !" });
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "Question chronométrée" }),
    ).toBeVisible();
    await expectNoTruthLeak(page, "sas de la question chronométrée");

    await gate.click();

    await expect(
      page.getByRole("heading", {
        name: "Quel oiseau orne l'enseigne du Comptoir E2E ?",
      }),
    ).toBeVisible({ timeout: 30_000 });

    // Le chronomètre est lancé CÔTÉ SERVEUR (started_at posé par la RPC) ;
    // l'écran ne fait que le refléter.
    await expect(page.getByRole("timer", { name: "Temps restant" })).toBeVisible();

    // Le mot attendu ne pré-remplit rien et n'apparaît nulle part.
    const free = page.getByLabel("Votre réponse");
    await expect(free).toHaveValue("");
    await expectNoTruthLeak(page, "question 3 affichée, non répondue");

    // Casse et accents sont normalisés par le serveur (quiz_normalize_text).
    await free.fill("perroquet");
    await page.getByRole("button", { name: "Valider ma réponse" }).click();
    await expect(page.getByText("✓ Bonne réponse !")).toBeVisible({
      timeout: 30_000,
    });

    // ── 5. Clôture de la participation ───────────────────────────
    //
    // ON NE FAIT PAS CONFIANCE AU CLIC — il tombait sur mobile-safari, sur
    // une PR qui ne touchait QUE des fichiers de documentation. Signature
    // connue de ce dépôt : le clic part avant que React ait hydraté le
    // bouton, ne déclenche rien, et l'assertion suivante attend trente
    // secondes un titre qui ne viendra jamais.
    //
    // On assure donc l'ÉTAT que le clic devait produire. Le `if` est
    // indispensable : une fois le sas ouvert, le bouton a disparu, et le
    // recliquer échouerait au lieu de constater que c'est déjà fait.
    const sasDeCloture = page.getByRole("heading", {
      name: "C'est terminé pour les questions !",
    });
    await expect(async () => {
      if (!(await sasDeCloture.isVisible().catch(() => false))) {
        await page
          .getByRole("button", { name: "Voir mon résultat →" })
          .click({ timeout: 5_000 })
          .catch(() => {});
      }
      await expect(sasDeCloture).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    // Le bouton du sas de clôture porte le MÊME libellé sans la flèche.
    await page
      .getByRole("button", { name: "Voir mon résultat", exact: true })
      .click();

    // ── 6. Lot du mode `threshold` : 3 bonnes réponses ≥ seuil 2 ──
    await expect(
      page.getByRole("heading", { name: "Le sablé du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Présentez ce code en caisse pour récupérer votre lot."),
    ).toBeVisible();

    const code = (await page.getByText(QUIZ_CODE).innerText()).trim();
    expect(code).toMatch(QUIZ_CODE);

    // ── 7. Caisse — le code se valide UNE fois, jamais deux ───────
    // Contexte commerçant distinct (session owner seedée) : le joueur reste
    // anonyme dans son propre contexte.
    const desk = await browser.newContext({
      baseURL,
      storageState: "e2e/.auth/owner.json",
      ignoreHTTPSErrors: true,
    });
    const deskPage = await desk.newPage();
    try {
      await deskPage.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
      await expect(deskPage.getByText(code)).toBeVisible({ timeout: 30_000 });
      await expect(deskPage.getByText("Le sablé du Comptoir E2E")).toBeVisible();
      await expect(
        deskPage.getByText("Seuil de bonnes réponses"),
      ).toBeVisible();

      // 1re remise : la carte bascule en « déjà remis ». Le rafraîchissement RSC
      // qui suit l'action peut traîner — à défaut, un reload relit l'état
      // serveur, seule autorité (redeem_quiz_reward).
      await deskPage
        .getByRole("button", { name: "Valider la remise" })
        .click();
      try {
        await expect(deskPage.getByText(CODE_CONSOMME)).toBeVisible({
          timeout: 20_000,
        });
      } catch {
        await deskPage.reload();
        await expect(deskPage.getByText(CODE_CONSOMME)).toBeVisible({
          timeout: 20_000,
        });
      }

      // Double retrait refusé : re-vérification du même code, plus aucun bouton.
      await deskPage.goto(`/dashboard/redeem?code=${encodeURIComponent(code)}`);
      await expect(deskPage.getByText(CODE_CONSOMME)).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        deskPage.getByRole("button", { name: "Valider la remise" }),
      ).toHaveCount(0);
    } finally {
      await desk.close();
    }

    // ── 8. Côté joueur, le lot est marqué récupéré ───────────────
    await page.reload();
    await expect(page.getByText("✓ Lot déjà récupéré en caisse.")).toBeVisible({
      timeout: 30_000,
    });
  });
});

/**
 * Filet de contraste et de structure — le capteur, pas le parcours.
 *
 * Cette spec prouvait le comportement et rien d'autre : aucune de ses pages
 * n'était scannée. Les quinze récidives de contraste de l'audit sont passées
 * par là — un écran couvert fonctionnellement passe pour un écran couvert.
 */
test.describe("accessibilité — le quiz joueur", () => {
  test("le quiz joueur sans violation axe serious/critical", async ({ page }, testInfo) => {
    await page.goto("/quiz/e2e-quiz");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(page, testInfo);
  });
});
