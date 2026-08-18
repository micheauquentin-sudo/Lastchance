import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Cycle MINIMAL du Mode événement en direct, piloté par la télécommande
 * organisateur authentifiée — ce que l'en-tête d'`event.spec.ts` déclare
 * explicitement hors de son lot (surfaces publiques du lobby seulement).
 * Seed : session DÉDIÉE « Cycle télécommande E2E »
 * (`e2ed0000-0000-4000-8000-000000000022`, join_code `E2ERMT`, org E2E Café,
 * jeu « Quiz du bar E2E » actif) avec trois questions, dont la première
 * (`e2ed0000-0000-4000-8000-000000000011`, type `quiz`, « Capitale de la
 * France ? », options Paris/Lyon).
 *
 * ⚠️ POURQUOI UNE SESSION À ELLE SEULE. Ce test MUTE la session qu'il pilote —
 * il y inscrit un joueur et la fait passer `lobby → question_active →
 * question_locked → reveal` — alors qu'`event.spec.ts` exige de SA session
 * (`…0021`, `E2EVNT`) l'état initial intact : phase `lobby`, « En attente des
 * premiers joueurs… », aucun joueur. Avec 2 workers Playwright en CI, les deux
 * specs s'exécutaient en même temps sur le MÊME état serveur : l'échec était
 * structurel, pas une question d'ordonnancement. Même geste que le calendrier
 * dédié `e2e-calendar-vide` et la cagnotte `e2e-jackpot-code`. Le game, lui,
 * reste partagé : seule la session porte la machine à états.
 *
 * La session seedée est déjà en statut `lobby` (pas `draft`) : la
 * télécommande saute directement au lanceur de question, sans bouton
 * « Démarrer ». Cycle couvert : lancer une question → le joueur (contexte
 * anonyme séparé) la voit et répond → verrouiller → révéler → la
 * télécommande ET le joueur affichent la révélation. Le podium (fin de
 * session) est un bonus hors du périmètre minimal demandé et n'est pas testé
 * ici : le stock de récompense est désormais propre à cette session, mais
 * clore la session la sortirait de `lobby` pour les relances suivantes.
 *
 * Polling (pas de dépendance Realtime en local) : toutes les attentes
 * multi-onglets sont des attentes d'état (`expect(...).toBeVisible()`),
 * jamais un délai fixe.
 *
 * REJOUABILITÉ (pas seulement isolation). L'isolation de session (game
 * dédié plus haut) évite la collision AVEC `event.spec.ts`, mais ne
 * protège pas ce test de LUI-MÊME : il mute sa propre session
 * (`lobby → question_active → question_locked → reveal`) et ne la
 * remettait jamais à `lobby`. Sous 2 projets Playwright + `retries: 1`
 * en CI, une tentative qui échoue à mi-cycle (contention, un des délais
 * serveur de 20/30 s trop juste) laissait la session en
 * `question_active`/`reveal` avec un joueur déjà inscrit : CHAQUE
 * tentative suivante (le retry, ou l'autre projet lancé en parallèle)
 * trouvait alors la télécommande SANS le bouton « Lancer une question »
 * — un échec déterministe en cascade qui ressemblait à du flake WebKit
 * mais n'en était pas un (même défaut que la jauge jackpot corrigée en
 * `c7feb86` : une assertion qui suppose l'état initial au lieu de le
 * garantir). Le `beforeEach` ci-dessous remet la session en `lobby` et
 * purge ses joueurs (service role, même client que `stripe-webhook.spec.ts`
 * — fonctionne à l'identique en CI et en local, pas de psql à distinguer
 * par environnement) : chaque tentative démarre d'un état propre, qu'elle
 * suive une réussite, un échec ou un retry.
 */
const SESSION_ID = "e2ed0000-0000-4000-8000-000000000022";
const JOIN_CODE = "E2ERMT";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

test.describe("mode événement — cycle question → révélation (télécommande)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test.beforeEach(async () => {
    const supabase = admin();
    // Cascade sur event_answers (FK on delete cascade) : purge complète du
    // passage précédent, quel qu'ait été son point d'arrêt.
    await supabase.from("event_players").delete().eq("session_id", SESSION_ID);
    const { error } = await supabase
      .from("event_sessions")
      .update({
        status: "lobby",
        phase: "lobby",
        current_question_id: null,
        current_question_started_at: null,
        prono_correct_option_id: null,
      })
      .eq("id", SESSION_ID);
    if (error) {
      throw new Error(`reset session événement E2E: ${error.message}`);
    }
  });

  test("l'organisateur lance une question, le joueur répond, la révélation s'affiche partout", async ({
    page,
    browser,
  }) => {
    // ── 1. Télécommande : la session est en lobby (garanti par le
    // beforeEach), prête à lancer.
    await page.goto(`/dashboard/events/${SESSION_ID}/remote`);
    await expect(
      page.getByRole("heading", { name: "Lancer une question" }),
    ).toBeVisible({ timeout: 30_000 });
    const questionRow = page.getByText("Capitale de la France ?");
    await expect(questionRow).toBeVisible();

    // ── 2. Joueur : contexte anonyme séparé, rejoint la partie puis répond.
    const player = await browser.newContext();
    const playerPage = await player.newPage();
    try {
      await playerPage.goto(`/event/${JOIN_CODE}`);
      await playerPage.getByLabel("Votre pseudo").fill("Testeur E2E");
      await playerPage.getByRole("button", { name: "C'est parti !" }).click();
      await expect(
        playerPage.getByRole("heading", { name: "Vous êtes dans la place !" }),
      ).toBeVisible({ timeout: 30_000 });

      // Lancer la question depuis la télécommande, et attendre la
      // CONFIRMATION serveur (le libellé du contrôle bascule sur « Question
      // en cours ») avant de faire quoi que ce soit côté joueur : la question
      // porte un chrono SERVEUR de 20 s (seed) qui démarre au moment où la
      // Server Action aboutit, pas au clic lui-même.
      await page
        .getByRole("button", { name: "Lancer" })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: "Question en cours" }),
      ).toBeVisible({ timeout: 30_000 });

      // Le joueur ne la verrait normalement qu'au poll suivant du lobby
      // (jusqu'à 5 s, `eventLobbyDelay`) : laisser faire ce poll de fond
      // mangerait une part significative des 20 s avant même le premier
      // rendu, un budget trop juste sous charge WSL. Un `reload()` force une
      // lecture SSR immédiate de l'état courant — même mécanisme que la
      // caisse — et ne consomme donc pas le chrono de réponse pour rien.
      await playerPage.reload();
      await expect(
        playerPage.getByRole("heading", { name: "Capitale de la France ?" }),
      ).toBeVisible({ timeout: 30_000 });
      await playerPage.getByRole("button", { name: "Paris" }).click();
      await expect(
        playerPage.getByText("✅ Réponse enregistrée — attendez la suite !"),
      ).toBeVisible({ timeout: 20_000 });

      // ── 3. Verrouiller puis révéler depuis la télécommande.
      await page
        .getByRole("button", { name: "🔒 Verrouiller les réponses" })
        .click();

      await expect(
        page.getByRole("heading", { name: "Révéler la réponse" }),
      ).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "👁 Révéler" }).click();

      // ── 4. Révélation visible à la fois côté joueur et côté télécommande.
      await expect(
        playerPage.getByRole("heading", { name: "Bonne réponse !" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Et ensuite ?" }),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await player.close();
    }
  });
});
