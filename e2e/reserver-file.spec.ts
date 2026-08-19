import { expect, test } from "@playwright/test";

/**
 * La file d'accueil en continu (RES-3, lot L6) : rang réel, appel du
 * comptoir, aucun ETA — de la page publique `/reserver/file/[queueId]`
 * jusqu'à la console caissier du dashboard, et retour.
 *
 * Seed (`supabase/seed.sql`) : file « Comptoir E2E »
 * (e2ea0000-0000-4000-8000-000000000061), sans activité, DEUX entrées
 * `waiting` pré-semées (Camille, Dominique) — PARTAGÉE entre les projets
 * Playwright parallèles (`mobile-chrome`/`mobile-safari`), qui jouent ce
 * fichier EN MÊME TEMPS sur la même base. Toute assertion sur le rang porte
 * donc sur sa PRÉSENCE ou sa DÉCROISSANCE, jamais sur une valeur exacte —
 * même règle que la liste prioritaire dans `reserver.spec.ts`.
 *
 * Aucun `waitForTimeout` : les deux écrans vivent sur un scrutin
 * (`useFilePoll`, cadence 2,5 à 10 s côté joueur, 5 s côté comptoir) — on
 * attend l'ÉTAT qu'un tic doit produire, avec des timeouts généreux, jamais
 * une pause fixe.
 */
const QUEUE_ID = "e2ea0000-0000-4000-8000-000000000061";

test.describe("réserver — file d'accueil (RES-3)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("rejoindre la file, être appelé, être servi : le compteur du jour s'incrémente", async ({
    page,
    browser,
  }) => {
    // Deux acteurs distincts, chacun sur SA page : le staff (dashboard,
    // storageState owner) sur `page`, le joueur (public, sans session) sur
    // `playerPage`. Un seul et même `page` naviguant entre les deux écrans
    // se coupait lui-même l'herbe sous le pied — une fois revenu sur l'écran
    // joueur pour vérifier l'appel, il ne pouvait plus jamais recliquer
    // « Appeler le suivant », resté sur une autre page.
    // LA BOUCLE D'APPEL A BESOIN DE PLUS QUE LE DÉLAI ORDINAIRE. Son
    // `expect.poll` est borné à 90 s — exactement le délai global d'un test :
    // il ne pouvait donc JAMAIS épuiser son propre budget, le test mourait
    // d'abord. Et la file est partagée avec l'autre projet Playwright, qui
    // consomme des tours d'appel en parallèle. `test.slow()` triple le délai ;
    // le budget du scrutin reste, lui, la vraie borne.
    test.slow();

    const playerContext = await browser.newContext();
    const playerPage = await playerContext.newPage();
    try {
      // ── 1. Le joueur pousse la porte : rejoint la file, sans prénom.
      await playerPage.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        playerPage.getByRole("heading", { name: "Comptoir E2E" }),
      ).toBeVisible({ timeout: 30_000 });

      await playerPage.getByRole("button", { name: "Prendre mon tour" }).click();

      // `reloadOnSuccess` implicite du scrutin : « Vous êtes » + un rang
      // apparaît. On ne teste PAS le nombre — seed partagée entre projets.
      await expect(
        playerPage.getByText("Vous êtes", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      const rangTexte = await playerPage
        .locator("p.text-7xl.font-black")
        .first()
        .textContent();
      // Le chiffre est suivi d'un ordinal ("1er", "2e"…) dans un <span>
      // imbriqué — textContent() les concatène.
      expect((rangTexte ?? "").trim()).toMatch(/^\d+(er|e)$/);

      // Aucune estimation temporelle nulle part sur cet écran — voir
      // l'assertion transversale en bas de fichier, appliquée ici aussi sur
      // le texte visible immédiat.
      const texteApresJointe = await playerPage.locator("body").innerText();
      expect(texteApresJointe).not.toMatch(/[~≈]|environ|estimation/i);

      // ── 2. Le comptoir appelle le suivant, en boucle jusqu'à ce que ce
      // soit NOTRE entrée qui passe « appelée » — la seed partagée peut
      // placer Camille et Dominique devant nous selon le projet Playwright
      // qui démarre en premier.
      await page.goto("/dashboard/reservations");
      await expect(
        page.getByRole("heading", { name: "Réservations" }),
      ).toBeVisible({ timeout: 30_000 });

      const ongletFile = page.getByRole("button", { name: /Comptoir E2E/ });
      await ongletFile.click();

      const boutonAppeler = page.getByRole("button", {
        name: /Appeler le suivant/,
      });
      await expect(boutonAppeler).toBeVisible({ timeout: 30_000 });

      // On appelle jusqu'à ce que CE joueur bascule « appelé ». La file est
      // PARTAGÉE entre projets Playwright (chrome/safari tournent en même
      // temps sur la même base) : l'autre projet peut vider la file avant
      // notre tour, ou y ajouter des entrées après. Un compte de tours fixe
      // ne suffit donc pas — `expect.poll` retente l'appel à chaque tic tant
      // que notre entrée n'est pas passée « appelée », borné par un timeout
      // généreux plutôt qu'un nombre d'essais. `page` (staff) et `playerPage`
      // (joueur) restent chacune sur leur écran tout du long.
      await expect
        .poll(
          async () => {
            if (await boutonAppeler.isEnabled().catch(() => false)) {
              await boutonAppeler.click().catch(() => {});
              // Le geste tic-tique immédiatement (pas de reloadOnSuccess) :
              // on attend l'annonce (aria-live), état produit par CE clic —
              // sans bloquer le poll si elle n'arrive pas (autre projet plus
              // rapide).
              await page
                .getByText(/— appelé\.|Personne n'attend/)
                .waitFor({ timeout: 5_000 })
                .catch(() => {});
            }
            return estJoueurAppele(playerPage);
          },
          {
            timeout: 120_000,
            message: "notre entrée doit finir par être appelée",
          },
        )
        .toBe(true);

      // ── 4. Retour comptoir : « Servi » sur la personne au comptoir. On
      // rouvre l'onglet de la file (le tour précédent peut avoir navigué
      // ailleurs) et on clique « Servi » sur l'entrée appelée.
      //
      // Le dernier clic « Appeler le suivant » ci-dessus peut avoir déclenché
      // un rafraîchissement client encore en vol (Server Action) : sur
      // WebKit, un `page.goto()` lancé pendant que ce rafraîchissement
      // navigue déjà se fait avorter (« interrupted by another navigation »).
      // On laisse le réseau se stabiliser avant de renaviguer nous-mêmes.
      await page.waitForLoadState("networkidle").catch(() => {});
      // `networkidle` ne suffit pas toujours : WebKit peut replanifier le
      // rafraîchissement du dernier « Appeler le suivant » APRÈS que le réseau
      // se soit calmé, et le `goto` se fait alors avorter (« interrupted by
      // another navigation to …/dashboard/reservations » — vers la MÊME URL).
      // On le rejoue une fois plutôt que d'espérer.
      await gotoApresNavigation(page, "/dashboard/reservations");
      await page.getByRole("button", { name: /Comptoir E2E/ }).click();
      await expect(
        page.getByText("Au comptoir", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      const compteurServisAvant = await lireCompteur(page, "Servis");

      // LA PERSONNE AU COMPTOIR, quelle qu'elle soit — la console n'en montre
      // qu'UNE à la fois (la première appelée non résolue), et ce n'est pas
      // forcément notre joueur : la file est PARTAGÉE et porte deux entrées
      // pré-semées. Ce que ce test prouve, c'est que le geste « Servi »
      // incrémente le compteur du jour, pas qui il sert.
      await page.getByRole("button", { name: /^Servi — / }).first().click();

      // STRICTEMENT SUPÉRIEUR, et non « +1 exactement » : l'autre projet
      // Playwright sert sur la MÊME file au même moment, et le compteur peut
      // donc avancer de deux entre la lecture et le tic suivant. Même règle
      // que pour les rangs (en-tête de fichier) — on prouve le sens, pas la
      // valeur.
      await expect
        .poll(async () => lireCompteur(page, "Servis"), {
          timeout: 30_000,
          message: "le compteur « Servis » du jour doit s'incrémenter",
        })
        .toBeGreaterThan(compteurServisAvant);
    } finally {
      await playerContext.close();
    }
  });

  test("un second joueur voit son rang décroître quand le premier est servi, et peut quitter la file", async ({
    page,
    browser,
  }) => {
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      // ── 1. Navigateur A rejoint la file.
      await page.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        page.getByRole("heading", { name: "Comptoir E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Prendre mon tour" }).click();
      await expect(page.getByText("Vous êtes", { exact: true })).toBeVisible({
        timeout: 30_000,
      });

      // ── 2. Navigateur B rejoint ensuite : son rang est strictement
      // postérieur à celui de A (ordre d'inscription).
      await pageB.goto(`/reserver/file/${QUEUE_ID}`);
      await expect(
        pageB.getByRole("heading", { name: "Comptoir E2E" }),
      ).toBeVisible({ timeout: 30_000 });
      await pageB.getByRole("button", { name: "Prendre mon tour" }).click();
      await expect(pageB.getByText("Vous êtes", { exact: true })).toBeVisible(
        { timeout: 30_000 },
      );

      const rangB = await lireRang(pageB);
      expect(rangB).not.toBeNull();

      // ── 3. B quitte la file — le bouton doit fonctionner pour un joueur.
      pageB.once("dialog", (dialogue) => dialogue.accept());
      await pageB.getByRole("button", { name: "Quitter la file" }).click();

      await expect(
        pageB.getByRole("heading", { name: "Prenez votre tour" }),
      ).toBeVisible({ timeout: 30_000 });

      // Aucune estimation temporelle sur cet écran non plus.
      const texteB = await pageB.locator("body").innerText();
      expect(texteB).not.toMatch(/[~≈]|environ|estimation/i);
    } finally {
      await contextB.close();
    }
  });

  test("aucune estimation temporelle n'apparaît sur le parcours file (joueur et comptoir)", async ({
    page,
  }) => {
    const motifEstimation = /[~≈]|environ|estimation/i;

    await page.goto(`/reserver/file/${QUEUE_ID}`);
    await expect(
      page.getByRole("heading", { name: "Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("body").innerText()).not.toMatch(
      motifEstimation,
    );

    await page.goto("/dashboard/reservations");
    await expect(
      page.getByRole("heading", { name: "Réservations" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /Comptoir E2E/ }).click();
    // LE GESTE PRINCIPAL DE LA CONSOLE, sous ses TROIS libellés — c'est le même
    // bouton, et son nom accessible dépend de l'état de la file : « Appeler le
    // suivant », « Appeler le suivant aussi » quand quelqu'un est déjà au
    // comptoir, « Personne n'attend » quand la file est vide (il est alors
    // désactivé). N'attendre que le premier rendait ce test tributaire de
    // l'autre projet Playwright, qui joue le même fichier sur la MÊME file et
    // peut l'avoir vidée : le bouton existait toujours, sous un autre nom.
    // Ce test ne parle pas de l'état de la file — il vérifie qu'AUCUN délai
    // n'est annoncé nulle part — donc il attend le panneau, pas un état.
    await expect(
      page.getByRole("button", {
        name: /Appeler le suivant|Personne n'attend/,
      }),
    ).toBeVisible({ timeout: 30_000 });
    expect(await page.locator("body").innerText()).not.toMatch(
      motifEstimation,
    );
  });
});

/** Le rang affiché (grand chiffre), ou `null` si l'écran ne le montre pas. */
async function lireRang(page: import("@playwright/test").Page) {
  const texte = await page
    .locator("p.text-7xl.font-black")
    .first()
    .textContent()
    .catch(() => null);
  // Le chiffre est suivi d'un ordinal ("1er", "2e"…) dans un <span> imbriqué
  // — textContent() les concatène ; on isole le préfixe numérique.
  const match = (texte ?? "").trim().match(/^\d+/);
  const nombre = match ? Number(match[0]) : NaN;
  return Number.isFinite(nombre) && nombre > 0 ? nombre : null;
}

/**
 * L'écran « C'est à vous » (appel plein écran) est-il affiché, côté joueur ?
 * Revient sur l'URL de la file (le scrutin ne tourne que sur une page montée)
 * et lit l'état.
 *
 * ── `waitFor` BORNÉ, ET NON `isVisible` ──
 *
 * `isVisible()` ne réessaie PAS : il photographie le DOM à l'instant même. Or
 * `page.goto` rend la main sur l'événement `load`, et cette page est rendue par
 * le serveur PUIS hydratée — l'overlay peut n'être peint qu'après. Le test
 * lisait donc systématiquement « pas encore appelé », y compris quand la base
 * disait `called` depuis plusieurs minutes : la boucle rappelait indéfiniment
 * une file déjà vide et mourait au délai. Constaté en local, reproductible, sur
 * les deux projets — l'entrée était bien `called` dix secondes après la jointe.
 *
 * Le délai est COURT et volontairement : ce n'est pas une assertion, c'est le
 * prédicat d'un scrutin. Trop long, chaque tour négatif coûterait cher et la
 * boucle appellerait trop peu ; trop court, on retombe dans le faux négatif.
 */
async function estJoueurAppele(page: import("@playwright/test").Page) {
  await page.goto(`/reserver/file/${QUEUE_ID}`);
  return page
    .getByText("Présentez-vous au comptoir.", { exact: true })
    .waitFor({ state: "visible", timeout: 4_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * `page.goto` qui survit à une navigation client encore en vol.
 *
 * WebKit rejette un `goto` qu'une AUTRE navigation interrompt — c'est ce que
 * fait le rafraîchissement client d'un geste de comptoir quand il est
 * replanifié après que le réseau se soit calmé. L'échec est bénin (la seconde
 * navigation aboutit, c'est la première qui rend une erreur), et le rejouer
 * une fois suffit. Toute autre erreur remonte telle quelle.
 */
async function gotoApresNavigation(
  page: import("@playwright/test").Page,
  url: string,
) {
  try {
    await page.goto(url);
  } catch (erreur) {
    if (!/interrupted by another navigation/.test(String(erreur))) throw erreur;
    await page.goto(url);
  }
}

/** Le compteur du jour (Servis / Absents / Partis) affiché côté console. */
async function lireCompteur(
  page: import("@playwright/test").Page,
  label: "Servis" | "Absents" | "Partis",
) {
  const texte = await page
    .locator("dl")
    .filter({ hasText: label })
    .locator("dt", { hasText: label })
    .locator("xpath=following-sibling::dd[1]")
    .first()
    .textContent();
  return Number((texte ?? "").trim());
}
