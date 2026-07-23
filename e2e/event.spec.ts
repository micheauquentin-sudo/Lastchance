import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./axe";

/**
 * Mode événement en direct — surfaces PUBLIQUES suivables par lien (seed
 * supabase/seed.sql : org « E2E Café », jeu « Quiz du bar E2E » actif, session
 * « Soirée E2E » en phase `lobby`, join_code déterministe `E2EVNT` — alphabet
 * sans I/O/0/1). Deux écrans indépendants partagent la même session :
 *   • /event/E2EVNT          → téléphone joueur (saisie pseudo + avatar)
 *   • /event/E2EVNT/screen   → écran de salle public (QR géant + lobby)
 *
 * Aucun joueur n'est seedé et le mode événement n'expose pas de jeton public
 * déterministe permettant à un anonyme de piloter la partie : la couverture
 * porte sur l'AFFICHAGE de la phase lobby et sur l'accessibilité, pas sur un
 * cycle de jeu complet (question → révélation → podium), qui relèverait d'une
 * spec pilotée par la télécommande authentifiée (hors de ce lot).
 *
 * Anonyme et isolé entre projets/navigateurs : le cookie joueur est vierge, la
 * page joueur affiche donc toujours l'écran de saisie (pas de reprise de session).
 */
const JOIN_CODE = "E2EVNT";

test.describe("mode événement — surfaces publiques (lobby)", () => {
  test("la page joueur affiche l'écran de join (pseudo + avatar) sans violation axe", async ({
    page,
  }, testInfo) => {
    // Bandeau kermesse rayé animé : mouvement réduit fige l'affichage pour un
    // scan a11y déterministe.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/event/${JOIN_CODE}`);

    // En-tête serveur : titre de l'événement + nom du commerce (repères les
    // plus stables, indépendants du cookie joueur).
    await expect(
      page.getByRole("heading", { name: "Événement en direct", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("E2E Café")).toBeVisible();

    // Anonyme sans identité → formulaire de saisie (et non l'aire de jeu) :
    // pseudo, sélecteur d'avatar et bouton de participation.
    await expect(
      page.getByRole("heading", { name: "Rejoindre la partie" }),
    ).toBeVisible();
    await expect(page.getByLabel("Votre pseudo")).toBeVisible();
    await expect(page.getByText("Votre avatar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "C'est parti !" }),
    ).toBeVisible();

    // Scan a11y de la surface joueur (formulaire de join, petit écran).
    await expectNoA11yViolations(page, testInfo);
  });

  test("l'écran de salle affiche le QR et le lobby sans violation axe", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/event/${JOIN_CODE}/screen`);

    // En-tête plein écran : titre + commerce.
    await expect(
      page.getByRole("heading", { name: "Événement en direct", level: 1 }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("E2E Café")).toBeVisible();

    // Lobby : le join_code lisible et le message d'attente (aucun joueur seedé).
    await expect(page.getByText(JOIN_CODE)).toBeVisible();
    await expect(
      page.getByText("En attente des premiers joueurs…"),
    ).toBeVisible();

    // Le QR géant finit par s'afficher : le rendu client a généré la data-URL
    // et remplacé « Préparation du QR… ». Attente d'état (pas de délai fixe) —
    // elle stabilise aussi le scan axe qui suit (sinon il analyserait le
    // remplaçant de chargement).
    await expect(
      page.getByRole("img", {
        name: /QR code à scanner pour rejoindre l'événement/i,
      }),
    ).toBeVisible({ timeout: 30_000 });

    // Scan a11y de l'écran de salle public.
    await expectNoA11yViolations(page, testInfo);
  });

  test("un code d'accès inconnu renvoie une 404 @smoke", async ({ page }) => {
    // Code bien formé (alphabet valide) mais absent du seed : réponse générique
    // unique, aucun oracle sur le motif (session inconnue, close, module coupé…).
    const response = await page.goto("/event/ZZZZZZ");
    expect(response?.status()).toBe(404);
  });
});
