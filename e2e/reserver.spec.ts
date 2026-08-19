import { expect, test } from "@playwright/test";

/**
 * Parcours « Réserver » (RES-1b / L4) : de la page publique de l'activité
 * jusqu'au comptoir des arrivées, et retour.
 *
 * Seed (`supabase/seed.sql`) : activité E2E « Dégustation du Comptoir E2E »
 * (e2ea0000-0000-4000-8000-000000000011) avec DEUX créneaux —
 * ...021 dans 2 jours (hors fenêtre de check-in) et ...022 dans 30 minutes
 * (fenêtre déjà ouverte, `starts_at - 1h`). Le créneau proche sert le
 * check-in ; le lointain reste libre pour ne pas interférer.
 *
 * Comme les specs jackpot/quiz sœurs : on prouve l'ÉTAT réel (le code affiché
 * dans « Mes réservations », le verdict du comptoir), jamais un simple
 * message de succès flottant.
 */
const ACTIVITY_ID = "e2ea0000-0000-4000-8000-000000000011";

test.describe("réserver — parcours public puis comptoir", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("réservation sans email, code affiché, arrivée enregistrée puis rejouée, annulation refusée", async ({
    page,
  }) => {
    // ── 1. Page publique de l'activité E2E : le créneau proche (30 min) est
    // celui dont la fenêtre de check-in est déjà ouverte — on le réserve.
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    const carteCreneauProche = creneauxSection
      .locator("li")
      .filter({ hasText: /place/ })
      .first();
    await expect(carteCreneauProche).toBeVisible();

    // ── 2. Réservation SANS email : le formulaire ne coche pas le
    // consentement, et le champ email reste vide.
    await carteCreneauProche
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    // `reloadOnSuccess` : la page se recharge et « Mes réservations » montre
    // la réservation fraîchement prise, avec son code.
    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });
    const carteReservation = page
      .locator("li")
      .filter({ hasText: "Confirmée" })
      .first();
    await expect(carteReservation).toBeVisible();
    const codeTexte = await carteReservation
      .locator("p.font-mono")
      .last()
      .textContent();
    const code = (codeTexte ?? "").trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // Aucun email ni jeton dans le HTML rendu : l'identité est le cookie.
    const contenu = await page.content();
    expect(contenu).not.toContain("@e2e.local");

    // ── 3. Comptoir : saisie du code → « arrivée enregistrée ».
    await page.goto("/dashboard/reservations");
    await expect(page.getByRole("heading", { name: "Arrivées" })).toBeVisible(
      { timeout: 30_000 },
    );
    const champCode = page.getByLabel("Code de réservation");
    await champCode.fill(code);
    await page.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    await expect(
      page.getByRole("status").getByText("Arrivée enregistrée"),
    ).toBeVisible({
      timeout: 20_000,
    });

    // ── 4. Re-saisie du MÊME code : verdict « déjà enregistrée », JAMAIS
    // « fenêtre refermée » — le statut prime sur la fenêtre (docstring
    // `CheckinVerdict`).
    await champCode.fill(code);
    await page.getByRole("button", { name: "Enregistrer l'arrivée" }).click();
    await expect(page.getByText("Déjà enregistrée")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Fenêtre d'arrivée refermée")).toHaveCount(0);

    // ── 5. Tentative d'annulation de la réservation arrivée : le bouton
    // d'annulation n'apparaît plus (une arrivée déjà enregistrée ne s'annule
    // plus — commentaire de `MaReservation`).
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    const carteArrivee = page
      .locator("li")
      .filter({ hasText: "Arrivé" })
      .first();
    await expect(carteArrivee).toBeVisible({ timeout: 30_000 });
    await expect(
      carteArrivee.getByRole("button", { name: "Annuler ma réservation" }),
    ).toHaveCount(0);
  });

  test("le commerçant libère une place : annulation staff depuis l'agenda", async ({
    page,
  }) => {
    // Ce que ce parcours prouve, et qui n'existait pas avant la migration
    // 20261003120000 : AUCUN geste commerçant ne libérait une place.
    // `cancel_reservation` exige l'empreinte du cookie du joueur, et
    // `reservations` n'a aucun grant `update` — un client qui annulait par
    // téléphone laissait son siège gelé jusqu'à l'heure du créneau.

    // ── 1. Une réservation publique sur le créneau LOINTAIN (2 jours) : le
    // bouton staff n'existe que sur un créneau qui n'a pas commencé, et le
    // créneau proche est réservé au parcours de check-in.
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
      .last()
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });
    const codeTexte = await page
      .locator("li")
      .filter({ hasText: "Confirmée" })
      .first()
      .locator("p.font-mono")
      .last()
      .textContent();
    const code = (codeTexte ?? "").trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // ── 2. L'agenda du commerçant. Les réservations vivent sous un pli
    // (`<details>`) : on l'ouvre avant de chercher la ligne.
    await page.goto(`/dashboard/reservations/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Créneaux" }),
    ).toBeVisible({ timeout: 30_000 });

    const ouvrirLesPlis = async () => {
      const plis = page.locator("details > summary");
      const combien = await plis.count();
      for (let i = 0; i < combien; i++) await plis.nth(i).click();
    };
    await ouvrirLesPlis();

    // `details li` et NON `li` : la carte du créneau est elle aussi un `<li>` et
    // contient le code — en mode strict, les deux se disputeraient le locator.
    // Les lignes de réservation, elles, ne vivent QUE sous le pli.
    const ligne = page.locator("details li").filter({ hasText: code }).first();
    await expect(ligne).toBeVisible();
    await expect(ligne.getByText("Confirmée", { exact: true })).toBeVisible();

    // ── 3. Confirmation en deux temps : le geste ne part que sur « oui ».
    page.once("dialog", (dialogue) => dialogue.accept());
    await ligne.getByRole("button", { name: "Annuler (staff)" }).click();

    // `reloadOnSuccess` : la page se recharge, les plis se referment.
    await expect(
      page.getByRole("heading", { name: "Créneaux" }),
    ).toBeVisible({ timeout: 30_000 });
    await ouvrirLesPlis();

    const ligneApres = page
      .locator("details li")
      .filter({ hasText: code })
      .first();
    // `exact` : le résumé du pli dit « … · 1 annulée » et la ligne « annulée le
    // … ». Seule la pastille vaut exactement « Annulée ».
    await expect(ligneApres.getByText("Annulée", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // Le bouton disparaît : il ne s'affiche que là où il peut aboutir.
    await expect(
      ligneApres.getByRole("button", { name: "Annuler (staff)" }),
    ).toHaveCount(0);

    // ── 4. LA PREUVE CÔTÉ JOUEUR : la place est réellement retournée au
    // créneau. `loadReserverPublicContext` ne rend que les réservations VIVANTES
    // — la carte disparaît donc entièrement, code compris, et le créneau
    // repasse dans la liste des créneaux réservables.
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(code)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toHaveCount(0);
  });

  test("email sans consentement coché : le formulaire refuse avec le message ciblé", async ({
    page,
  }) => {
    await page.goto(`/reserver/${ACTIVITY_ID}`);
    await expect(
      page.getByRole("heading", { name: "Dégustation du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    // Le créneau lointain (2 jours) : le scénario court n'a pas besoin de la
    // fenêtre de check-in, et laisse le créneau proche disponible à d'autres
    // exécutions.
    const carteCreneauLointain = creneauxSection
      .locator("li")
      .filter({ hasText: /place/ })
      .last();
    await expect(carteCreneauLointain).toBeVisible();

    await carteCreneauLointain
      .getByLabel(/Votre email/)
      .fill("client-e2e-sans-consentement@example.com");
    // La case de consentement n'est PAS cochée.
    await carteCreneauLointain
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    await expect(
      page.getByText(
        "Cochez la case pour recevoir votre confirmation par email, ou laissez l'adresse vide.",
      ),
    ).toBeVisible({ timeout: 20_000 });

    // Ni l'email saisi ni un jeton n'apparaissent dans la page rendue.
    const contenu = await page.content();
    expect(contenu).not.toContain("client-e2e-sans-consentement@example.com");
  });
});

/**
 * Liste prioritaire (RES-2, lot L5) : offre à échéance, prise, et FIFO.
 *
 * DEUX activités jumelles, UNE par projet Playwright — `mobile-chrome` et
 * `mobile-safari` exécutent ce fichier EN PARALLÈLE sur la même base seedée
 * (`fullyParallel`), et un unique créneau à capacité 1 partagé entre les deux
 * ferait échouer celui qui arrive en second : le bouton « Réserver ma place »
 * aurait déjà disparu, pris par l'autre projet. `...012` / `...025` sert
 * `mobile-chrome` (et tout projet non listé) ; `...013` / `...026` sert
 * `mobile-safari`.
 *
 * `...025` (comme `...026`) est UNE place, LIBRE, sans réservation ni entrée
 * de file pré-semées. Le créneau `...023` de l'activité `...012` porte lui
 * une entrée `waiting` posée avant tout navigateur E2E (`e2ea0000-…-000041`) :
 * y rejoindre la file ferait partir l'offre à ce concurrent seedé au FIFO,
 * jamais au navigateur de test — d'où des créneaux séparés, remplis et vidés
 * par CE test lui-même.
 */
const ACTIVITES_FILE: Record<
  string,
  { activityId: string; slotUnique: boolean }
> = {
  "mobile-safari": {
    activityId: "e2ea0000-0000-4000-8000-000000000013",
    // Cette activité n'a qu'UN créneau (pas de `...023` complet à côté) :
    // le premier `<li>` de la liste EST le créneau dédié, sans ambiguïté.
    slotUnique: true,
  },
};
const ACTIVITE_FILE_DEFAUT = {
  activityId: "e2ea0000-0000-4000-8000-000000000012",
  slotUnique: false,
};

test.describe("réserver — liste prioritaire (RES-2)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("un désistement offre la place au premier de la file, qui la prend", async ({
    page,
    browser,
  }, testInfo) => {
    const { activityId: ACTIVITY_ID_2, slotUnique } =
      ACTIVITES_FILE[testInfo.project.name] ?? ACTIVITE_FILE_DEFAUT;
    const nomActivite = slotUnique
      ? "Atelier privé du Comptoir E2E (bis)"
      : "Atelier privé du Comptoir E2E";

    // ── 1. Navigateur A : réserve la seule place du créneau dédié. Le seul
    // créneau de cette activité qui porte encore un bouton « Réserver ma
    // place » (l'autre, `...023` sur l'activité par défaut, est déjà complet
    // et n'affiche que la file).
    await page.goto(`/reserver/${ACTIVITY_ID_2}`);
    await expect(
      page.getByRole("heading", { name: nomActivite }),
    ).toBeVisible({ timeout: 30_000 });

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    const carteLibre = creneauxSection
      .locator("li")
      .filter({ has: page.getByRole("button", { name: "Réserver ma place" }) });
    await expect(carteLibre).toBeVisible();
    await carteLibre.getByRole("button", { name: "Réserver ma place" }).click();

    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator("li").filter({ hasText: "Confirmée" }).first(),
    ).toBeVisible();

    // ── 2. Navigateur B : identité séparée (nouveau contexte, nouveau
    // cookie). Sur l'activité jumelle (`slotUnique`), il n'y a qu'un seul
    // créneau — c'est le premier `<li>`. Sur l'activité par défaut, les deux
    // créneaux sont maintenant complets ; celui qui l'intéresse est le
    // dernier de la liste (tri par `starts_at` croissant — `...025` est le
    // plus tardif des deux).
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    try {
      await pageB.goto(`/reserver/${ACTIVITY_ID_2}`);
      await expect(
        pageB.getByRole("heading", { name: nomActivite }),
      ).toBeVisible({ timeout: 30_000 });

      const creneauxSectionB = pageB.getByRole("region", {
        name: "Créneaux disponibles",
      });
      const carteDediee = slotUnique
        ? creneauxSectionB.locator("li").first()
        : creneauxSectionB.locator("li").last();
      await expect(carteDediee.getByText("Complet")).toBeVisible();
      await carteDediee
        .getByRole("button", { name: "Rejoindre la liste d'attente" })
        .click();
      await carteDediee
        .getByRole("button", { name: "M'inscrire sur la liste" })
        .click();

      // `reloadOnSuccess` : « Ma file d'attente » apparaît, 1er sur la liste
      // puisque c'est la seule inscription sur ce créneau tout neuf.
      await expect(
        pageB.getByRole("heading", { name: "Ma file d'attente" }),
      ).toBeVisible({ timeout: 30_000 });
      // `exact` : la pastille dit « Sur la liste », la phrase en dessous dit
      // « Vous êtes 1er sur la liste. » — le substring ambiguë en mode strict.
      await expect(
        pageB.getByText("Sur la liste", { exact: true }),
      ).toBeVisible();
      await expect(pageB.getByText("1er")).toBeVisible();

      // ── 3. Navigateur A se désiste : la place revient, et RES-2 la
      // propose immédiatement au premier de la file (B), sous le même
      // verrou que la réservation.
      const carteReservationA = page
        .locator("li")
        .filter({ hasText: "Confirmée" })
        .first();
      await carteReservationA
        .getByRole("button", { name: "Annuler ma réservation" })
        .click();
      // `reloadOnSuccess` : `mesReservations` ne SELECTionne que
      // `confirmed`/`checked_in` (reserver-context.ts) — une fois annulée, la
      // réservation ne revit pas sous une pastille « Annulée » sur CETTE page
      // (contrairement à l'agenda du commerçant) : la carte, et la section
      // « Mes réservations » elle-même, disparaissent entièrement.
      await expect(
        page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
      ).toHaveCount(0, { timeout: 20_000 });

      // ── 4. Navigateur B recharge : l'offre est vivante, il la prend.
      await pageB.goto(`/reserver/${ACTIVITY_ID_2}`);
      await expect(
        pageB.getByRole("heading", { name: "Ma file d'attente" }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByText("Place proposée")).toBeVisible();
      await pageB.getByRole("button", { name: "Prendre la place" }).click();

      // `reloadOnSuccess` : la place devient une réservation, avec son code.
      await expect(
        pageB.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
      ).toBeVisible({ timeout: 30_000 });
      const carteReservationB = pageB
        .locator("li")
        .filter({ hasText: "Confirmée" })
        .first();
      await expect(carteReservationB).toBeVisible();
      const codeTexte = await carteReservationB
        .locator("p.font-mono")
        .last()
        .textContent();
      expect((codeTexte ?? "").trim()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      // La file, elle, ne montre plus B en attente : l'entrée est convertie.
      await expect(
        pageB.getByRole("heading", { name: "Ma file d'attente" }),
      ).toHaveCount(0);
    } finally {
      await contextB.close();
    }
  });
});

/**
 * Invitation privée (RES-2, lot L5) : jeton révélé une fois côté serveur,
 * jamais rendu au client.
 *
 * Seed dédiée : jeton clair `E2E-INVIT-TOKEN-0000000000000000` (32
 * caractères — `RESERVER_INVITATION_TOKEN_PATTERN` l'exige, voir
 * supabase/seed.sql), empreinte
 * SHA-256 en base sur l'invitation `...051`, ouvrant le créneau FERMÉ AU
 * PUBLIC `...024` (capacité 2) de la même activité `...012`. Capacité et
 * `max_uses` (5) couvrent large : ce test consomme UNE place, une fois par
 * projet Playwright exécuté (mobile-chrome + mobile-safari = 2, exactement la
 * capacité) — ne pas dupliquer ce scénario sans revoir la fixture.
 */
test.describe("réserver — invitation privée (RES-2)", () => {
  test("réservation via jeton, jamais rendu en clair dans la page", async ({
    page,
  }) => {
    await page.goto("/reserver/invitation/E2E-INVIT-TOKEN-0000000000000000");
    await expect(
      page.getByRole("heading", { name: "Atelier privé du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Invitation privée")).toBeVisible();

    const carteCreneau = page
      .getByRole("region", { name: /créneau/i })
      .locator("li")
      .first();
    await expect(carteCreneau).toBeVisible();
    await carteCreneau
      .getByRole("button", { name: "Réserver ma place" })
      .click();

    // `reloadOnSuccess` : « Votre place »/« Vos places » avec le code.
    await expect(
      page.getByRole("heading", { name: /Vos places|Votre place/ }),
    ).toBeVisible({ timeout: 30_000 });
    const carteReservation = page
      .locator("li")
      .filter({ hasText: "Confirmée" })
      .first();
    await expect(carteReservation).toBeVisible();
    const codeTexte = await carteReservation
      .locator("p.font-mono")
      .last()
      .textContent();
    expect((codeTexte ?? "").trim()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // LE JETON CLAIR N'APPARAÎT NULLE PART dans la page de succès — il est
    // révélé une fois côté serveur (au commerçant qui crée l'invitation) et
    // ne revit jamais côté client.
    const contenu = await page.content();
    expect(contenu).not.toContain("E2E-INVIT-TOKEN-0000000000000000");
  });

  test("jeton inconnu : 404 générique, aucun oracle sur son existence", async ({
    page,
  }) => {
    // Un jeton qui n'a jamais existé se résout AVANT tout rendu client
    // (`notFound()` côté serveur, docstring de `InvitationPage`) : même 404
    // générique que n'importe quelle autre page absente — pas de message
    // dédié qui apprendrait à qui tape des jetons au hasard que la route
    // existe.
    await page.goto("/reserver/invitation/ce-jeton-nexiste-pas");
    await expect(
      page.getByRole("heading", { name: "Page introuvable" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
