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
 * `@smoke` — DONC UN SEUL PROJET. Ce parcours MUTE l'état d'une session
 * (draft → lobby) ; le jouer en parallèle sur mobile-chrome et mobile-safari
 * ferait courir les deux navigateurs après la même ligne. C'est la mésaventure
 * déjà consignée en tête d'`event-remote-cycle.spec.ts`, et on ne la rejoue
 * pas : la session ci-dessous est propre à ce fichier, et le tag la borne à
 * `desktop-smoke`.
 */

const GAME_ID = "e2ed0000-0000-4000-8000-000000000001";
const ORG_ID = "e2e10000-0000-4000-8000-000000000001";
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
    await supabase.from("event_sessions").delete().eq("id", SESSION_ID);
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
    await admin().from("event_sessions").delete().eq("id", SESSION_ID);
  });

  test("une session neuve ne fuit pas côté joueur, puis s'ouvre depuis la télécommande @smoke", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // ── 1. La page joueur et l'écran de salle sont FERMÉS tant que c'est un
    // brouillon. C'est la garde de `event_etat_partage`, vue du dehors.
    expect((await page.request.get(`/event/${JOIN_CODE}/screen`)).status()).toBe(404);
    expect((await page.request.get(`/event/${JOIN_CODE}`)).status()).toBe(404);

    // ── 2. Le panel n'offre donc AUCUN lien vers ces pages.
    await page.goto(`/dashboard/events/${GAME_ID}`);
    await ouvrirLesSessions(page);
    const ligne = page.locator("li").filter({ hasText: LABEL });
    // Une seule ligne, sinon la suite viserait au hasard — et le message dirait
    // pourquoi plutôt que « strict mode violation » sur l'assertion suivante.
    await expect(ligne).toHaveCount(1);
    // `exact` OBLIGATOIRE : `getByText("Brouillon")` cherche une SOUS-CHAÎNE
    // insensible à la casse, et l'encart QR de la même ligne porte « tant
    // qu'elle est en brouillon (ou archivée)… ». Deux éléments, donc un échec
    // en mode strict — sur une page pourtant correcte.
    await expect(ligne.getByText("Brouillon", { exact: true })).toBeVisible();
    await expect(ligne.getByRole("link", { name: /Écran/ })).toHaveCount(0);

    // « Piloter » reste, LUI, toujours offert : c'est la seule porte du salon.
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
