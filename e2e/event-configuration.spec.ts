import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ouvrirTuile } from "./helpers";

/**
 * DE LA SESSION CRÉÉE AU SALON OUVERT — le parcours que personne ne couvrait.
 *
 * `event-remote-cycle.spec.ts` part d'une session DÉJÀ en `lobby` (il le dit
 * lui-même) et joue le cycle question → révélation. Tout ce qui précède —
 * créer une session, la piloter, l'ouvrir — n'était couvert par AUCUN test.
 * C'est exactement là que deux défauts sont passés en production :
 *
 *   · « Écran » était rendu sur une session en brouillon, alors que
 *     `/event/[code]/screen` refuse `draft` : un onglet sur un 404, à tous les
 *     coups. Ce fichier l'asserte des DEUX côtés — le bouton absent, ET la
 *     page qui répond 404 tant que le salon est fermé.
 *   · « Piloter » est la SEULE porte qui ouvre un salon. Un plantage de cette
 *     page — et elle faisait trois lectures dont deux facultatives — laisse
 *     l'organisateur sans recours, en soirée, devant du public. Le simple fait
 *     d'y arriver et d'y démarrer la session est donc asserté ici.
 *
 * UN SEUL PROJET — et c'est le filtre par nom, pas le tag, qui l'obtient.
 * Ce parcours MUTE l'état d'une session (draft → lobby) et démarre son jeu :
 * joué sur trois projets à la fois, les navigateurs se courent après sur les
 * mêmes identifiants. `@smoke` ne suffit PAS à l'empêcher — seul
 * `desktop-smoke` porte un `grep` dans `playwright.config.ts`, les deux
 * projets mobiles n'en ont aucun et exécutent tout, tag compris. Le `test.skip`
 * du `beforeEach`, lui, borne réellement, et il tombe AVANT toute écriture.
 */

/**
 * UN JEU À SOI, ET C'EST LE SEED QUI L'EXIGE.
 *
 * Le jeu seedé « Quiz du bar E2E » est PARTAGÉ : `event.spec.ts` y lit un
 * état initial immuable sur la session E2EVNT, et `event-remote-cycle.spec.ts`
 * pilote la session E2ERMT — la seule que le seed réserve au pilotage. Le
 * commentaire du seed est explicite : « toute spec qui lance/verrouille/révèle
 * une question ou qui inscrit un joueur doit utiliser la session dédiée ».
 *
 * Ce parcours DÉMARRE une session : c'est du pilotage. Il lui faut donc sa
 * propre surface, et le voisin s'était donné un game dédié pour exactement
 * cette raison face à `event.spec.ts`.
 *
 * NE PAS RELIRE CE BLOC COMME UN DIAGNOSTIC. Le jeu dédié a été introduit en
 * croyant qu'il expliquait la chute d'`event-remote-cycle` en CI ; c'était
 * FAUX. La cause était un `U+FE0F` ajouté à l'emoji d'un bouton, qui cassait
 * un sélecteur visant le nom accessible complet (corrigé sur `main`). Le jeu
 * dédié reste juste — le seed l'exige — mais il n'a jamais rien réparé, et
 * l'écrire ici épargne au prochain lecteur la fausse piste qui m'a coûté trois
 * cycles.
 *
 * D'où un jeu créé et détruit ici, avec sa question : plus aucune surface
 * commune, donc plus aucune interférence possible dans un sens ou dans l'autre.
 */
const ORG_ID = "e2e10000-0000-4000-8000-000000000001";
const GAME_ID = "e2ed0000-0000-4000-8000-0000000000d1";
const QUESTION_ID = "e2ed0000-0000-4000-8000-0000000000d2";
const SESSION_ID = "e2ed0000-0000-4000-8000-0000000000c1";
const JOIN_CODE = "E2ECFG";
const LABEL = "Configuration E2E";

/**
 * OUVRIR LA TUILE DES SESSIONS, PUIS LE PROUVER.
 *
 * `CarteRepliable` ne rend PAS ses enfants tant qu'elle est repliée : la
 * liste des sessions n'existe pas dans le DOM, et un locator qui la vise rend
 * zéro. Un premier jet balayait tous les boutons « Développer » en boucle ;
 * quand le dépli n'aboutissait pas, l'échec tombait vingt lignes plus bas sur
 * « 0 élément » et désignait la mauvaise cause.
 *
 * On vise donc LA tuile — `TUILES_EVENEMENT` la nomme « Les sessions » — avec
 * le helper maison, puis on exige le titre que son contenu rend,
 * « Sessions en direct » (`EventSessionsSection`).
 *
 * LE `toPass` N'EST PAS DE LA PRÉCAUTION DÉCORATIVE. Un clic envoyé avant que
 * React ait hydraté la page est ACCEPTÉ par le navigateur et perdu par
 * l'application : c'est la première cause d'instabilité de cette suite, et
 * `ouvrirTuile` avale volontairement l'échec de son clic (la tuile peut être
 * déjà ouverte). On rejoue donc le couple geste + preuve jusqu'à ce que l'état
 * VOULU soit là, au lieu de faire confiance au clic. Cette page est visitée
 * deux fois dans le test, et la tuile se replie entre les deux.
 */
async function ouvrirLesSessions(page: import("@playwright/test").Page) {
  await expect(async () => {
    await ouvrirTuile(page, /Développer «.*Les sessions/);
    await expect(
      page.getByRole("heading", { name: "Sessions en direct" }),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

test.describe("mode événement — de la session créée au salon ouvert", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  /**
   * UN SEUL PROJET, ET LE TAG N'Y SUFFIT PAS.
   *
   * `@smoke` ne borne rien : seul `desktop-smoke` porte un `grep` dans
   * `playwright.config.ts` ; `mobile-chrome` et `mobile-safari` n'en ont
   * aucun et exécutent TOUT, tag compris. Ce parcours MUTE l'état d'une session
   * (draft → lobby) et démarre le jeu partagé : joué sur trois projets, les
   * navigateurs se courent après — c'est ce qui a fait tomber ce fichier ET
   * `event-remote-cycle.spec.ts` au premier passage en CI.
   *
   * Le filtre par nom de projet, lui, borne réellement.
   */
  test.beforeEach(async ({}, infos) => {
    // AVANT toute écriture : sur les autres projets on ne sème rien, donc rien
    // à nettoyer et aucune ligne partagée à disputer.
    test.skip(
      infos.project.name !== "desktop-smoke",
      "Parcours mutant : un seul projet, sinon deux navigateurs visent la même session.",
    );
    const supabase = admin();
    // Le jeu d'abord : sa suppression emporte ses sessions et ses questions
    // (FK on delete cascade), donc chaque tentative — première, retry —
    // repart d'un terrain vierge sans dépendre de ce que la précédente a
    // laissé.
    await supabase.from("event_games").delete().eq("id", GAME_ID);
    const { error: erreurJeu } = await supabase.from("event_games").insert({
      id: GAME_ID,
      organization_id: ORG_ID,
      name: "Jeu de configuration E2E",
      // ACTIF : « Démarrer la session » refuse un jeu en brouillon, côté
      // action ET côté RPC. Ce parcours vérifie l'ouverture d'un SALON, pas
      // l'activation d'un jeu — celle-ci a ses propres tests.
      status: "active",
    });
    if (erreurJeu) throw new Error(`seed jeu configuration : ${erreurJeu.message}`);
    // Une question : un jeu actif sans manche n'existe pas dans le produit,
    // et la télécommande afficherait un écran que personne ne voit jamais.
    const { error: erreurQuestion } = await supabase
      .from("event_questions")
      .insert({
        id: QUESTION_ID,
        game_id: GAME_ID,
        organization_id: ORG_ID,
        position: 0,
        question_type: "poll",
        prompt: "Question de configuration E2E ?",
        time_limit_seconds: 30,
        points_base: 1000,
      });
    if (erreurQuestion) {
      throw new Error(`seed question configuration : ${erreurQuestion.message}`);
    }
    const { error } = await supabase.from("event_sessions").insert({
      id: SESSION_ID,
      game_id: GAME_ID,
      organization_id: ORG_ID,
      label: LABEL,
      join_code: JOIN_CODE,
      // L'ÉTAT DE DÉPART EST LE DÉFAUT DE LA TABLE : une session naît
      // `draft`, et c'est précisément l'état où les deux défauts vivaient.
      status: "draft",
      reward_label: "Café de configuration",
      reward_stock: 2,
    });
    if (error) throw new Error(`seed session configuration : ${error.message}`);
  });

  test.afterAll(async () => {
    // Le jeu emporte tout le reste en cascade.
    await admin().from("event_games").delete().eq("id", GAME_ID);
  });

  test("une session neuve attend les joueurs, puis s'ouvre depuis la télécommande @smoke", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 1. Le lien joueur est partageable avant la soirée : il affiche une
    // attente inerte, sans inscription ni réponse. L'écran projeté reste fermé
    // tant que le salon n'est pas ouvert.
    expect((await page.request.get(`/event/${JOIN_CODE}/screen`)).status()).toBe(404);
    expect((await page.request.get(`/event/${JOIN_CODE}`)).status()).toBe(200);

    await page.goto(`/event/${JOIN_CODE}`);
    await expect(page.getByRole("status")).toContainText(/salle d'attente arrive bientôt/i);
    await expect(page.getByLabel("Votre pseudo")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /rejoindre|répondre/i })).toHaveCount(0);

    // ── 2. Le panel offre déjà le lien et le QR joueurs, mais pas l'écran de
    // salle. Le commerçant peut donc les distribuer avant le lancement.
    await page.goto(`/dashboard/events/${GAME_ID}`);
    await ouvrirLesSessions(page);
    const ligne = page.locator("li").filter({ hasText: LABEL });
    // Une seule ligne, sinon la suite viserait au hasard — et le message dirait
    // pourquoi plutôt que « strict mode violation » sur l'assertion suivante.
    await expect(ligne).toHaveCount(1);
    // `exact` OBLIGATOIRE : l'encart QR mentionne aussi le brouillon ; on doit
    // cibler le statut de la session, pas une sous-chaîne ambiguë.
    await expect(ligne.getByText("Brouillon", { exact: true })).toBeVisible();
    await expect(ligne.getByRole("link", { name: /Joueurs/ })).toBeVisible();
    await expect(ligne.getByRole("img", { name: /QR code de/ })).toBeVisible();
    await expect(ligne.getByRole("button", { name: /Copier le lien/ })).toBeVisible();
    await expect(ligne.getByRole("link", { name: /Écran/ })).toHaveCount(0);

    // « Piloter » reste la porte qui transforme l'attente en salon ouvert.
    const piloter = ligne.getByRole("link", { name: /Piloter/ });
    await expect(piloter).toBeVisible();

    // ── 3. La télécommande s'ouvre — et le simple fait d'y arriver est
    // l'assertion : un plantage ici enlève tout recours à l'organisateur.
    await piloter.click();
    await expect(page).toHaveURL(new RegExp(`${SESSION_ID}/remote`));
    await expect(
      page.getByRole("button", { name: /Démarrer la session/i }),
    ).toBeVisible({ timeout: 30_000 });

    // ── 4. On ouvre le salon.
    await page.getByRole("button", { name: /Démarrer la session/i }).click();
    // `phaseLabel` (event-remote.tsx) : status `lobby` + phase `lobby` rend
    // « Salon d'attente ». Ce n'est PAS « Salon ouvert » — ça, c'est
    // `SESSION_STATUS_LABEL`, l'étiquette de la liste du panel.
    await expect(page.getByText(/Salon d'attente/)).toBeVisible({ timeout: 30_000 });

    // ── 5. CE QUI ÉTAIT FERMÉ EST MAINTENANT OUVERT — des deux côtés.
    expect((await page.request.get(`/event/${JOIN_CODE}/screen`)).status()).toBe(200);
    expect((await page.request.get(`/event/${JOIN_CODE}`)).status()).toBe(200);

    await page.goto(`/dashboard/events/${GAME_ID}`);
    await ouvrirLesSessions(page);
    const ligneOuverte = page.locator("li").filter({ hasText: LABEL });
    await expect(ligneOuverte.getByRole("link", { name: /Écran/ })).toBeVisible();
  });
});
