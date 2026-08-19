import { expect, test, type Page } from "@playwright/test";

/**
 * Le Mode Attente active (RES-4, lot L7) : « Pendant votre attente » sur les
 * deux formes d'attente du produit — la file d'accueil sans créneau
 * (`/reserver/file/[queueId]`) et la réservation confirmée avec créneau
 * (`/reserver/[activityId]`).
 *
 * Seed (`supabase/seed.sql`) : la file « Comptoir E2E »
 * (e2ea0000-0000-4000-8000-000000000061) et l'activité « Dégustation du
 * Comptoir E2E » (e2ea0000-0000-4000-8000-000000000011) portent toutes les
 * deux `wait_quiz_id` (Quiz du Comptoir E2E) et `wait_pause_campaign_id`
 * (« E2E Grattage », SANS collecte — `PendantVotreAttente` rend un
 * `ClaimConfig` muet, et une campagne qui collecte l'email ferait échouer le
 * claim automatique — roue à un seul lot pondéré 100 et stock fini 5000 :
 * tirage déterministe, toujours gagnant).
 *
 * `attente` est un CHAMP DE CONTEXTE, résolu une fois par rendu serveur
 * (`loadReserverQueuePublicContext` / `loadReserverPublicContext`) — jamais
 * par le scrutin client. Rejoindre la file ou réserver ne le fait donc
 * apparaître qu'après un rechargement de page complet ; c'est le même geste
 * qui, plus tard, permet de vérifier que la Pause Chance déjà jouée rend le
 * MÊME résultat (`wait_session_use_pause` / `consume_reserver_wait_spin_grant`
 * sont idempotentes).
 *
 * La file est PARTAGÉE entre projets Playwright parallèles
 * (`mobile-chrome`/`mobile-safari`) — même règle que `reserver-file.spec.ts` :
 * aucune assertion sur un rang exact, seulement sur sa présence.
 */
const QUEUE_ID = "e2ea0000-0000-4000-8000-000000000061";
const ACTIVITY_ID = "e2ea0000-0000-4000-8000-000000000011";
const PHRASE_NON_NECESSAIRE =
  "Aucune animation n'est nécessaire pour conserver votre place.";

test.describe("réserver — mode attente active (RES-4)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("file : la section d'attente apparaît sous le rang, la Pause Chance gagne, le lot rejoint le portefeuille, et le rechargement rend le même tour", async ({
    browser,
  }) => {
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    try {
      // ── 1. Rejoindre la file, puis RECHARGER : `attente` est un champ de
      // contexte serveur, pas du scrutin — il ne peut apparaître qu'après un
      // rendu qui voit la place fraîchement prise.
      await playerPage.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        playerPage.getByRole("heading", { name: "Comptoir E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await playerPage
        .getByRole("button", { name: "Prendre mon tour" })
        .click();
      await expect(
        playerPage.getByText("Vous êtes", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      await playerPage.reload();
      await expect(
        playerPage.getByRole("heading", { name: "Pendant votre attente" }),
      ).toBeVisible({ timeout: 30_000 });

      // ── 2. La phrase de non-nécessité, en tête de la section.
      const section = playerPage.locator(
        'section[aria-labelledby="attente-active-titre"]',
      );
      await expect(section).toContainText(PHRASE_NON_NECESSAIRE);

      // ── Assertion transversale : la section n'apparaît JAMAIS au-dessus du
      // rang — comparaison des positions verticales réelles des deux régions.
      await assertSectionSousLeRang(
        playerPage,
        'section[aria-labelledby="mon-rang-titre"]',
        section,
      );

      // ── 3. Pause Chance : tour déterministe, toujours gagnant.
      const cartePause = section.locator("li", { hasText: "Pause Chance" });
      await cartePause
        .getByRole("button", { name: "Tenter ma chance" })
        .click();

      await expect(cartePause.getByText("GAGNÉ")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        cartePause.getByText("Dessert offert E2E", { exact: false }).first(),
      ).toBeVisible();
      await expect(
        cartePause.getByText("À retirer au comptoir lors de votre passage."),
      ).toBeVisible();

      // « p.font-mono » n'isole pas le code : le bandeau « ✦ GAGNÉ ✦ » porte
      // la même classe (`RevelationPause`). Le motif du code (alphabet de
      // caisse, sans I/O/0/1) l'isole sans ambiguïté.
      const codeTexte = (
        await cartePause.getByText(/^[A-HJ-NP-Z2-9]{8}$/).textContent()
      )?.trim();
      expect(codeTexte).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

      // ── 4. Le lot apparaît sur /portefeuille — même cookie, même joueur.
      await playerPage.getByRole("link", { name: /Mes récompenses/ }).click();
      await expect(
        playerPage.getByRole("heading", { name: "Dessert offert E2E" }),
      ).toBeVisible({ timeout: 30_000 });

      // ── 5. Retour sur la file, rechargement : « Revoir mon tour » rend le
      // MÊME code — la RPC est idempotente, elle ne tire jamais un second tour.
      await playerPage.goto(`/reserver/file/${QUEUE_ID}`);
      await playerPage.reload();
      const sectionApresRechargement = playerPage.locator(
        'section[aria-labelledby="attente-active-titre"]',
      );
      const cartePauseApres = sectionApresRechargement.locator("li", {
        hasText: "Pause Chance",
      });
      await expect(
        cartePauseApres.getByRole("button", { name: "Revoir mon tour" }),
      ).toBeVisible({ timeout: 30_000 });
      await cartePauseApres
        .getByRole("button", { name: "Revoir mon tour" })
        .click();

      await expect(cartePauseApres.getByText("GAGNÉ")).toBeVisible({
        timeout: 30_000,
      });
      const codeRejoue = (
        await cartePauseApres.getByText(/^[A-HJ-NP-Z2-9]{8}$/).textContent()
      )?.trim();
      expect(codeRejoue).toBe(codeTexte);
    } finally {
      await playerContext.close();
    }
  });

  test("file : l'appel du staff pendant l'attente affichée recouvre tout, la section disparaît", async ({
    page,
    browser,
  }) => {
    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    try {
      await playerPage.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        playerPage.getByRole("heading", { name: "Comptoir E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await playerPage
        .getByRole("button", { name: "Prendre mon tour" })
        .click();
      await expect(
        playerPage.getByText("Vous êtes", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      await playerPage.reload();
      await expect(
        playerPage.getByRole("heading", { name: "Pendant votre attente" }),
      ).toBeVisible({ timeout: 30_000 });

      // ── Le comptoir appelle jusqu'à ce que CE joueur bascule « appelé ».
      await page.goto("/dashboard/reservations");
      await expect(
        page.getByRole("heading", { name: "Réservations" }),
      ).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: /Comptoir E2E/ }).click();
      const boutonAppeler = page.getByRole("button", {
        name: /Appeler le suivant/,
      });
      await expect(boutonAppeler).toBeVisible({ timeout: 30_000 });

      await expect
        .poll(
          async () => {
            if (await boutonAppeler.isEnabled().catch(() => false)) {
              await boutonAppeler.click().catch(() => {});
              await page
                .getByText(/— appelé\.|Personne n'attend/)
                .waitFor({ timeout: 5_000 })
                .catch(() => {});
            }
            return estJoueurAppele(playerPage);
          },
          { timeout: 90_000, message: "notre entrée doit finir par être appelée" },
        )
        .toBe(true);

      // ── L'overlay APPELÉ recouvre tout, et la section d'attente a été
      // DÉMONTÉE — pas seulement masquée sous elle.
      await expect(
        playerPage.getByText("Présentez-vous au comptoir.", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        playerPage.getByRole("heading", { name: "Pendant votre attente" }),
      ).toHaveCount(0);
    } finally {
      await playerContext.close();
    }
  });

  test("réservation confirmée : la section d'attente apparaît, SOUS la réservation", async ({
    page,
  }) => {
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    await creneauxSection
      .locator("li")
      .filter({ hasText: /place/ })
      .first()
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });

    // Même règle que sur la file : `attente` vient du contexte serveur, on
    // recharge pour la voir apparaître.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Pendant votre attente" }),
    ).toBeVisible({ timeout: 30_000 });

    const section = page.locator(
      'section[aria-labelledby="attente-active-titre"]',
    );
    await expect(section).toContainText(PHRASE_NON_NECESSAIRE);

    // Assertion transversale : sous la carte de réservation elle-même
    // (le code que le client rouvre sa page pour retrouver), jamais au-dessus
    // — PAS sous la section englobante, qui contient l'attente elle-même et
    // dont la boîte engloberait donc toujours les deux.
    await assertSectionSousLeRang(
      page,
      'section[aria-labelledby="mes-reservations-titre"] ul',
      section,
    );
  });
});

/**
 * L'écran « C'est à vous » (appel plein écran) est-il affiché, côté joueur ?
 * Revient sur l'URL de la file (le scrutin ne tourne que sur une page
 * montée) et lit l'état — jamais une pause fixe.
 */
async function estJoueurAppele(page: Page) {
  await page.goto(`/reserver/file/${QUEUE_ID}`);
  return page
    .getByText("Présentez-vous au comptoir.", { exact: true })
    .isVisible()
    .catch(() => false);
}

/**
 * Vérifie que la région désignée par `attenteSelector` est rendue
 * STRICTEMENT SOUS la région désignée par `avantSelector` — comparaison des
 * positions verticales réelles, pas de l'ordre du DOM seul (qui peut mentir
 * en cas de `position: absolute`, absent ici mais la garde est peu coûteuse).
 */
async function assertSectionSousLeRang(
  page: Page,
  avantSelector: string,
  attenteLocator: ReturnType<Page["locator"]>,
) {
  const avant = page.locator(avantSelector).first();
  await expect(avant).toBeVisible();
  const avantBox = await avant.boundingBox();
  const attenteBox = await attenteLocator.boundingBox();
  expect(avantBox).not.toBeNull();
  expect(attenteBox).not.toBeNull();
  expect(attenteBox!.y).toBeGreaterThanOrEqual(avantBox!.y + avantBox!.height - 1);
}
