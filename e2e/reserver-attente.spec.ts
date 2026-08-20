import { expect, test, type Page } from "@playwright/test";

/**
 * Le Mode Attente active (RES-4, lot L7) : « Pendant votre attente » sur les
 * deux formes d'attente du produit — la file d'accueil sans créneau
 * (`/reserver/file/[queueId]`) et la réservation confirmée avec créneau
 * (`/reserver/[activityId]`).
 *
 * Seed (`supabase/seed.sql`) : la file « Comptoir Attente E2E »
 * (e2ea0000-0000-4000-8000-000000000063 — DÉDIÉE, distincte de « Comptoir
 * E2E » qu'utilise `reserver-file.spec.ts` : les deux specs tournent dans le
 * MÊME run Playwright sur des workers parallèles, et `queue_call_next` sert
 * le PREMIER de la file sans distinguer qui l'appelle — sur une file
 * partagée, la boucle « Appeler le suivant » de l'un aurait servi l'entrée de
 * l'autre, démontant `PendantVotreAttente` en plein test) et l'activité
 * « Dégustation du Comptoir E2E » (e2ea0000-0000-4000-8000-000000000011)
 * portent toutes les deux `wait_quiz_id` (Quiz du Comptoir E2E) et une
 * `wait_pause_campaign_id`, mais PAS LA MÊME — les deux moitiés du parcours de
 * gain doivent être couvertes depuis que `wait_session_open` descend la
 * configuration de retrait RÉELLE de la campagne :
 *
 *   · la FILE tire sur « E2E Grattage » (e2e20000-…-03), qui ne collecte RIEN :
 *     retrait automatique, le code s'affiche seul ;
 *   · l'ACTIVITÉ tire sur « E2E Gagnante » (e2e20000-…-01), qui EXIGE l'email :
 *     c'est la moitié qui prouve le correctif. Tant que l'écran supposait « ne
 *     rien collecter », le retrait automatique partait sans adresse, le serveur
 *     le refusait — et le lot était DÉJÀ tiré, le stock DÉJÀ décompté. Un tour
 *     offert brûlé sans code.
 *
 * Les deux roues n'ont qu'un lot tirable, pondéré 100 et à stock fini 5000 :
 * tirage déterministe, toujours gagnant (la BORNE 2 exclut du tour offert tout
 * lot à stock illimité).
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
const QUEUE_ID = "e2ea0000-0000-4000-8000-000000000063";
const ACTIVITY_ID = "e2ea0000-0000-4000-8000-000000000011";
const PHRASE_NON_NECESSAIRE =
  "Aucune animation n'est nécessaire pour conserver votre place.";
/**
 * Le code de retrait, tel que `claim_prize` le fabrique (migration 00019) :
 * `GAIN-` suivi de HUIT caractères de l'alphabet de caisse — sans I, O, 0 ni 1,
 * qui se confondent à l'œil au comptoir. Écrit une fois : les trois endroits
 * qui le cherchent doivent chercher la même chose.
 */
const CODE_RETRAIT = /^GAIN-[A-HJ-NP-Z2-9]{8}$/;

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
        playerPage.getByRole("heading", { name: "Comptoir Attente E2E" }),
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
      // la même classe (`RevelationPause`). Le motif du code l'isole sans
      // ambiguïté — PRÉFIXE COMPRIS : un code de retrait est `GAIN-` suivi de
      // huit caractères de l'alphabet de caisse (sans I/O/0/1), jamais huit
      // caractères nus (`claim_prize`, migration 00019). Sans le préfixe, le
      // motif ne correspondait à RIEN et l'attente allait au bout du délai.
      const codeTexte = (
        await cartePause.getByText(CODE_RETRAIT).textContent()
      )?.trim();
      expect(codeTexte).toMatch(CODE_RETRAIT);

      // ── 4. Le lot apparaît sur /portefeuille — même cookie, même joueur.
      await playerPage.getByRole("link", { name: /Mes récompenses/ }).click();
      // ATTENDRE QUE CETTE NAVIGATION SOIT ARRIVÉE avant d'en lancer une autre
      // à l'étape 5. Le titre du lot devient visible dès que l'état serveur est
      // là, mais sur WebKit la navigation sous-jacente peut encore être en vol :
      // le `goto` suivant se fait alors interrompre par elle (« Navigation …
      // is interrupted by another navigation to …/portefeuille »). Même course,
      // même parade que dans `reserver.spec.ts`.
      await playerPage.waitForURL(/\/portefeuille/, { timeout: 30_000 });
      await expect(
        playerPage.getByRole("heading", { name: "Dessert offert E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await playerPage.waitForLoadState("networkidle");

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
        await cartePauseApres.getByText(CODE_RETRAIT).textContent()
      )?.trim();
      expect(codeRejoue).toBe(codeTexte);
    } finally {
      await playerContext.close();
    }
  });

  test("file : l'appel du staff recouvre tout, et la section d'attente reste MONTÉE sous l'overlay", async ({
    page,
    browser,
  }) => {
    // MÊME RAISON QUE DANS `reserver-file.spec.ts` : la boucle d'appel borne son
    // scrutin à 90 s, soit exactement le délai global d'un test — elle ne
    // pouvait pas épuiser son budget. Et la file, même dédiée à ce fichier,
    // reste partagée entre `mobile-chrome` et `mobile-safari`, qui consomment
    // des tours d'appel en parallèle.
    test.slow();

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    try {
      await playerPage.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        playerPage.getByRole("heading", { name: "Comptoir Attente E2E" }),
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
      await page.getByRole("button", { name: /Comptoir Attente E2E/ }).click();
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
          { timeout: 120_000, message: "notre entrée doit finir par être appelée" },
        )
        .toBe(true);

      // ── L'overlay APPELÉ recouvre tout — il est `fixed inset-0 z-50`, donc
      // l'appel prime et c'est lui qu'on voit.
      await expect(
        playerPage.getByText("Présentez-vous au comptoir.", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      // ── …ET LA SECTION RESTE MONTÉE DESSOUS. Elle était démontée, ce qui
      // emportait le lot révélé, son code et le formulaire de retrait en cours
      // de saisie — au moment précis où quelqu'un lit un code à présenter au
      // comptoir. Le tirage survit toujours en base ; c'était l'écran qui se
      // perdait, et il reprend désormais sa place si l'overlay se referme.
      await expect(
        playerPage.getByRole("heading", { name: "Pendant votre attente" }),
      ).toHaveCount(1);

      // ── ET RIEN N'EST PROMIS QUI N'EXISTE : ce joueur n'a pas touché à la
      // Pause Chance, l'appel ne lui parle donc d'aucun gain.
      await expect(
        playerPage.getByText(/Votre gain de la Pause Chance/),
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

    // ── LA CONFIGURATION DE RETRAIT DE LA CAMPAGNE DESCEND JUSQU'À L'ÉCRAN.
    //
    // C'est l'assertion qui prouve le correctif, et elle n'est possible que
    // parce que l'ACTIVITÉ tire sur « E2E Gagnante », qui EXIGE l'email (la
    // file, elle, tire sur une campagne muette — voir l'en-tête). L'écran
    // supposait « ne rien collecter » : le retrait automatique partait sans
    // adresse, le serveur le refusait avec « Votre email est requis », et le lot
    // était déjà tiré, le stock déjà décompté. Un tour offert brûlé sans code.
    //
    // Le formulaire qui apparaît EST la preuve : il n'existe que si
    // `collect_email` a voyagé de la campagne jusqu'ici.
    const cartePause = section.locator("li", { hasText: "Pause Chance" });
    await cartePause.getByRole("button", { name: "Tenter ma chance" }).click();

    await expect(cartePause.getByText("GAGNÉ")).toBeVisible({
      timeout: 30_000,
    });
    await expect(cartePause.getByPlaceholder("Votre email")).toBeVisible({
      timeout: 30_000,
    });
    // …et le code n'est PAS affiché tant que l'adresse n'est pas donnée : la
    // collecte est réellement appliquée, pas seulement rendue.
    await expect(cartePause.getByText(CODE_RETRAIT)).toHaveCount(0);
  });
});

/**
 * L'écran « C'est à vous » (appel plein écran) est-il affiché, côté joueur ?
 * Revient sur l'URL de la file (le scrutin ne tourne que sur une page montée)
 * et lit l'état.
 *
 * `waitFor` BORNÉ et non `isVisible` : ce dernier ne réessaie pas, il
 * photographie le DOM à l'instant du `load` — avant, souvent, que l'overlay
 * soit peint. La boucle lisait alors « pas encore appelé » indéfiniment, y
 * compris sur une entrée `called` depuis plusieurs minutes. Même parade, même
 * raison que dans `reserver-file.spec.ts` : le délai reste court, c'est le
 * prédicat d'un scrutin et non une assertion.
 */
async function estJoueurAppele(page: Page) {
  await page.goto(`/reserver/file/${QUEUE_ID}`);
  return page
    .getByText("Présentez-vous au comptoir.", { exact: true })
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
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
