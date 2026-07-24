import { expect, test, type Page } from "@playwright/test";

/**
 * Événement de pronostics GÉNÉRIQUE (hors football) — miroir de
 * `e2e/pronostics.spec.ts`, qui reste dédié au parcours football.
 *
 * Le concours seedé E2EPRONO3 (`supabase/seed.sql`, event_kind
 * 'ceremony') est une cérémonie : ni équipes ni compétition au
 * catalogue, trois questions typées et un verrouillage porté par
 * l'événement — coalesce(question.locks_at, contest.default_locks_at,
 * kickoff_at) :
 *   · `choice` OUVERTE (locks_at nul → défaut de l'événement, +30 j),
 *     dont le résultat officiel est DÉJÀ en base sans être publié ;
 *   · `number` OUVERTE ;
 *   · `choice` VERROUILLÉE (locks_at dépassé) et non résolue.
 *
 * Couvre : inscription → réponse `choice` et `number` enregistrées et
 * persistées → NON-FUITE du résultat tant que la question n'est pas
 * résolue → verrouillage effectif (plus aucune réponse acceptée).
 * (Turnstile est désactivé en E2E : aucune clé configurée.)
 */
const SLUG = "E2EPRONO3";
const EVENT_NAME = "Cérémonie E2E";
/** Libellé du catalogue football : il ne doit JAMAIS s'afficher ici. */
const FOOTBALL_COMPETITION_LABEL = "Autre / Match isolé";

const CHOICE_PROMPT = "Qui recevra le trophée de la Cérémonie E2E ?";
const NUMBER_PROMPT = "Combien de trophées seront remis pendant la cérémonie ?";
const LOCKED_PROMPT = "Quelle sera la couleur du tapis d'entrée ?";

/**
 * Carte d'une question dans l'onglet « Matchs ».
 *
 * Le scope par carte est OBLIGATOIRE : plusieurs questions ouvertes
 * cohabitent, donc plusieurs boutons « Valider » / « Modifier » — et
 * l'en-tête du hub joueur porte lui aussi un bouton « Modifier ». Un
 * locator de page entière violerait le mode strict.
 */
function questionCard(page: Page, prompt: string) {
  return page
    .locator("#prono-panel-matchs")
    .getByRole("listitem")
    .filter({ hasText: prompt });
}

test.describe("pronostics génériques — parcours joueur d'un événement", () => {
  test("inscription, réponses typées, non-fuite du résultat, verrouillage", async ({
    page,
  }, testInfo) => {
    await page.goto(`/pronos/${SLUG}`);

    // ── L'événement s'annonce sans compétition sportive : le football
    // n'est plus qu'un modèle parmi d'autres.
    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    await expect(page.getByText(FOOTBALL_COMPETITION_LABEL)).toHaveCount(0);

    // ── Inscription : pseudo unique par projet (les deux mobiles
    // tournent en parallèle sur le même événement seedé).
    const pseudo = `E2E gen ${testInfo.project.name}`.slice(0, 30);
    // #id direct : getByLabel("Pseudo") matcherait AUSSI la checkbox de
    // consentement (son libellé contient « Mon pseudo et mon avatar… »).
    await page.locator("#prono-first-name").fill(pseudo);
    // Seule checkbox du formulaire (ni email ni téléphone collectés).
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "C'est parti 🎉" }).click();

    // ── Mini espace joueur : en-tête profil + onglets.
    await expect(page.getByText(pseudo).first()).toBeVisible({
      timeout: 10_000,
    });

    // ── Question à CHOIX ouverte : la réponse est enregistrée.
    const choiceCard = questionCard(page, CHOICE_PROMPT);
    await expect(choiceCard).toHaveCount(1);
    await expect(choiceCard.getByText("Réponses ouvertes")).toBeVisible();
    await choiceCard.getByRole("radio", { name: "Alice Cinéma" }).check();
    await choiceCard.getByRole("button", { name: "Valider" }).click();
    await expect(
      choiceCard.getByRole("button", { name: /Enregistré|Modifier/ }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Question d'ESTIMATION ouverte : idem.
    const numberCard = questionCard(page, NUMBER_PROMPT);
    await numberCard
      .getByRole("spinbutton", { name: "Votre estimation" })
      .fill("12");
    await numberCard.getByRole("button", { name: "Valider" }).click();
    await expect(
      numberCard.getByRole("button", { name: /Enregistré|Modifier/ }),
    ).toBeVisible({ timeout: 10_000 });

    // ── Persistance réelle : après rechargement, les deux réponses
    // reviennent du serveur pré-remplies (pas un simple état React).
    await page.reload();
    await expect(
      questionCard(page, CHOICE_PROMPT).getByRole("radio", {
        name: "Alice Cinéma",
      }),
    ).toBeChecked();
    await expect(
      questionCard(page, NUMBER_PROMPT).getByRole("spinbutton", {
        name: "Votre estimation",
      }),
    ).toHaveValue("12");

    // ── NON-FUITE : le résultat officiel de la question à choix est en
    // base (opt-b) mais elle n'est PAS résolue — rien ne doit filtrer,
    // ni le bloc « Bonne réponse », ni le badge de résolution.
    await expect(page.getByText("Bonne réponse")).toHaveCount(0);
    await expect(page.getByText("Résultat connu")).toHaveCount(0);

    // ── VERROUILLAGE : échéance dépassée, plus aucune réponse possible.
    const lockedCard = questionCard(page, LOCKED_PROMPT);
    await expect(lockedCard).toHaveCount(1);
    await expect(lockedCard.getByText("Verrouillée")).toBeVisible();
    await expect(
      lockedCard.getByRole("radio", { name: "Tapis rouge" }),
    ).toBeDisabled();
    await expect(
      lockedCard.getByRole("button", { name: "Valider" }),
    ).toHaveCount(0);
    await expect(
      lockedCard.getByText("Vous n'avez pas répondu à temps."),
    ).toBeVisible();

    // ── Le classement de l'événement reste accessible (barème
    // générique : aucun point tant que rien n'est résolu).
    await page.getByRole("tab", { name: /Classement/ }).click();
    await expect(
      page.locator("#prono-panel-classement").getByText("Classement").first(),
    ).toBeVisible();
  });

  test("visiteur : l'événement s'annonce sans rien dévoiler @smoke", async ({
    page,
  }) => {
    await page.goto(`/pronos/${SLUG}`);

    await expect(
      page.getByRole("heading", { level: 1, name: EVENT_NAME }),
    ).toBeVisible();
    // Pas de compétition sportive sur un événement générique.
    await expect(page.getByText(FOOTBALL_COMPETITION_LABEL)).toHaveCount(0);

    // Sans inscription : le formulaire, et AUCUNE question — donc aucun
    // moyen de lire le résultat déjà connu en base.
    await expect(
      page.getByRole("button", { name: "C'est parti 🎉" }),
    ).toBeVisible();
    await expect(page.getByText(CHOICE_PROMPT)).toHaveCount(0);
    await expect(page.getByText("Bonne réponse")).toHaveCount(0);
  });
});
