import { expect, test } from "@playwright/test";

/**
 * Expériences Signature (RES-5, lot L8) : le format « Moment Signature »
 * (page immersive, trois cartes numérotées) et le format « Atelier Duo » (une
 * réservation retient deux places, la jauge parle en paires) — au-dessus de
 * la même mécanique de réservation que `reserver.spec.ts` (créneaux, code,
 * annulation), qui ne bouge pas ici.
 *
 * Seed (`supabase/seed.sql`) :
 * - Activité SIGNATURE `e2ea0000-0000-4000-8000-000000000014`
 *   (« Moment Signature du Comptoir E2E »), trois étapes, un unique créneau
 *   `...0027` (+2h, capacité 4).
 * - Activité DUO `e2ea0000-0000-4000-8000-000000000015`
 *   (« Atelier Duo du Comptoir E2E »), un unique créneau `...0028` (+3h,
 *   capacité 6 personnes = 3 duos).
 *
 * Comme les specs sœurs : on prouve l'ÉTAT réel affiché à l'écran (le texte de
 * la jauge, la mention « pour N personnes », la pastille « 2 pers. » au
 * comptoir), jamais un simple message de succès flottant. Style et helpers
 * repris de `reserver.spec.ts` : `storageState: "e2e/.auth/owner.json"`,
 * sélection par `getByRole`, `reloadOnSuccess`, pas de `waitForTimeout`.
 */
const ACTIVITY_SIGNATURE = "e2ea0000-0000-4000-8000-000000000014";
const ACTIVITY_DUO = "e2ea0000-0000-4000-8000-000000000015";

test.describe("réserver — Moment Signature (RES-5)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("promesse en exergue, trois cartes numérotées, préparation visible, réservation classique inchangée", async ({
    page,
  }) => {
    await page.goto(`/reserver/${ACTIVITY_SIGNATURE}`);
    await expect(
      page.getByRole("heading", { name: "Moment Signature du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── La promesse, en exergue, avant les créneaux. ──
    await expect(
      page.getByText(
        "Trente minutes hors du temps, entre le moulin et la tasse.",
      ),
    ).toBeVisible();
    // La durée annoncée en badge — le mot « Durée » vit DANS le badge.
    await expect(page.getByText("Durée 30 min")).toBeVisible();

    // ── Les trois étapes, sous forme de cartes numérotées (RES-5). ──
    const etapes = page.getByRole("region", { name: /vivre/i });
    await expect(
      etapes.getByRole("heading", { name: "On vous accueille" }),
    ).toBeVisible();
    await expect(
      etapes.getByRole("heading", { name: "On extrait ensemble" }),
    ).toBeVisible();
    await expect(
      etapes.getByRole("heading", { name: "On déguste" }),
    ).toBeVisible();
    // Trois cartes précisément, pas plus : la borne haute du format.
    await expect(etapes.locator("ol > li")).toHaveCount(3);

    // ── La section « préparation », rebaptisée pour un Moment Signature. ──
    await expect(
      page.getByRole("heading", { name: "Pour bien en profiter" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Venez cinq minutes en avance. Évitez le parfum : il couvre les arômes.",
      ),
    ).toBeVisible();

    // ── Une réservation classique fonctionne toujours sur cette page : même
    // mécanique qu'un format standard (`reserver.spec.ts`), un code affiché
    // sous « Confirmée ». ──
    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    await creneauxSection
      .locator("li")
      .first()
      .getByRole("button", { name: "Réserver ma place" })
      .click();

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
    expect((codeTexte ?? "").trim()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    // Format standard côté données : aucune mention « pour N personnes » sur
    // une réservation d'une seule place.
    await expect(page.getByText(/pour \d personnes/)).toHaveCount(0);
  });
});

test.describe("réserver — Atelier Duo (RES-5)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });
  // SÉRIEL, ET DÉLIBÉRÉMENT : les deux tests de ce bloc MUTENT la même jauge
  // partagée (créneau duo unique, capacité 6 = 3 duos) — le premier en
  // consomme un, le second épuise les trois. En parallèle (`fullyParallel`
  // par défaut), rien ne garantit que l'un s'exécute avant l'autre sur le
  // même worker, et une jauge lue pendant que l'autre test la fait bouger
  // donnerait un compte qui n'est ni l'un ni l'autre.
  test.describe.configure({ mode: "serial" });

  test("bandeau à deux, jauge en paires, confirmation pour 2 personnes, jauge décroît d'1 duo", async ({
    page,
    browser,
  }, testInfo) => {
    // UN SEUL créneau duo dans le seed (`...0028`), partagé par TOUS les
    // projets Playwright — contrairement à `...012`/`...013` de
    // `reserver.spec.ts`, qui en sème DEUX pour que `mobile-chrome` et
    // `mobile-safari` (exécutés EN PARALLÈLE, `fullyParallel`) ne se
    // disputent pas la même jauge. Ce test RÉSERVE et lit un compte exact
    // (« 3 » puis « 2 duos possibles ») : le laisser tourner sur deux
    // projets à la fois lui ferait lire le compte que l'AUTRE projet vient de
    // faire bouger. Un seul projet le fait ; les autres lisent son résultat
    // dans le test suivant (« 2 pers. » dans l'agenda), qui lui tolère
    // n'importe quel état de départ.
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "créneau duo unique et partagé — un seul projet mute sa jauge",
    );
    await page.goto(`/reserver/${ACTIVITY_DUO}`);
    await expect(
      page.getByRole("heading", { name: "Atelier Duo du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── Le bandeau « à deux », en haut de page, avant les créneaux. ──
    await expect(
      page.getByText(
        "Cette expérience se vit à deux : une réservation retient deux places.",
      ),
    ).toBeVisible();

    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    const carteCreneau = creneauxSection.locator("li").first();
    await expect(carteCreneau).toBeVisible();

    // ── La jauge parle en PAIRES, pas en places brutes : capacité 6
    // personnes = 3 duos, jamais « 6 places restantes ». ──
    // `exact` : sans lui, « 3 » matche aussi en sous-chaîne l'heure du
    // créneau (« …, 06:38 – 08:08 »), qui contient elle aussi un « 3 » —
    // mode strict, deux éléments, échec.
    await expect(carteCreneau.getByText("3", { exact: true })).toBeVisible();
    await expect(carteCreneau.getByText(/duos? possibles?/)).toBeVisible();
    await expect(carteCreneau.getByText(/places? restantes?/)).toHaveCount(0);

    // ── Le bouton dit « Réserver pour deux », pas « Réserver ma place ». ──
    await carteCreneau
      .getByRole("button", { name: "Réserver pour deux" })
      .click();

    // `reloadOnSuccess` : « Mes réservations »/« Ma réservation » apparaît,
    // avec la mention « pour 2 personnes » sous le code — sans elle, un
    // client relisant sa confirmation ne saurait pas qu'elle tient deux
    // places.
    await expect(
      page.getByRole("heading", { name: /Mes réservations|Ma réservation/ }),
    ).toBeVisible({ timeout: 30_000 });
    const carteReservation = page
      .locator("li")
      .filter({ hasText: "Confirmée" })
      .first();
    await expect(carteReservation).toBeVisible();
    await expect(carteReservation.getByText("pour 2 personnes")).toBeVisible();

    // ── La jauge décroît d'1 DUO, pas de 2 places : « 2 duos possibles ». ──
    //
    // PAS SUR `page` : `loadReserverPublicContext` ne rend, dans « Créneaux
    // disponibles », que les créneaux SANS réservation vivante de CE cookie
    // (motif `reserver.spec.ts` — une fois réservé, un créneau bascule
    // entièrement dans « Mes réservations »). Sur ce créneau UNIQUE, `page`
    // ne le reverrait donc plus du tout dans la liste, même s'il reste deux
    // duos ouverts à quelqu'un d'autre. Une identité NEUVE (nouveau contexte,
    // nouveau cookie) est le seul témoin qui voit encore le créneau parmi les
    // disponibles, et donc sa jauge.
    const contextTemoin = await browser.newContext();
    try {
      const pageTemoin = await contextTemoin.newPage();
      await pageTemoin.goto(`/reserver/${ACTIVITY_DUO}`);
      await expect(
        pageTemoin.getByRole("heading", {
          name: "Atelier Duo du Comptoir E2E",
        }),
      ).toBeVisible({ timeout: 30_000 });
      const creneauxApres = pageTemoin.getByRole("region", {
        name: "Créneaux disponibles",
      });
      const carteCreneauApres = creneauxApres.locator("li").first();
      await expect(
        carteCreneauApres.getByText("2", { exact: true }),
      ).toBeVisible();
      await expect(
        carteCreneauApres.getByText(/duos? possibles?/),
      ).toBeVisible();
    } finally {
      await contextTemoin.close();
    }
  });

  test("trois duos réservés (capacité 6) : le créneau affiche Complet", async ({
    page,
    browser,
  }, testInfo) => {
    // Même créneau duo unique et partagé que le test précédent — voir son
    // commentaire. Ce bloc est SÉRIEL (`test.describe.configure`) : le test
    // précédent a déjà pris UN duo sur les trois, donc il n'en reste que
    // DEUX à épuiser ici pour atteindre la capacité 6.
    test.skip(
      testInfo.project.name !== "mobile-chrome",
      "créneau duo unique et partagé — un seul projet mute sa jauge",
    );
    // TROIS contextes navigateur (main + B + C), chacun avec sa propre
    // navigation et son propre chargement de page : le défaut de 90 s serré
    // sous charge (CI, machine de dev partagée) coupait le test PENDANT la
    // fermeture des contextes plutôt que sur une assertion — un flake de
    // timing, pas un désaccord sur le résultat.
    test.setTimeout(180_000);
    // Deux identités distinctes (deux cookies), comme le fait
    // `reserver.spec.ts` pour la liste prioritaire : réserver deux fois avec
    // la MÊME identité ne redonnerait pas un second bouton, mais la
    // réservation déjà prise sur ce créneau.
    const reserverUnDuo = async (
      pageActive: import("@playwright/test").Page,
    ) => {
      await pageActive.goto(`/reserver/${ACTIVITY_DUO}`);
      await expect(
        pageActive.getByRole("heading", {
          name: "Atelier Duo du Comptoir E2E",
        }),
      ).toBeVisible({ timeout: 30_000 });
      const creneauxSection = pageActive.getByRole("region", {
        name: "Créneaux disponibles",
      });
      const carteCreneau = creneauxSection.locator("li").first();
      await carteCreneau
        .getByRole("button", { name: "Réserver pour deux" })
        .click();
      await expect(
        pageActive.getByRole("heading", {
          name: /Mes réservations|Ma réservation/,
        }),
      ).toBeVisible({ timeout: 30_000 });
    };

    // Navigateur A (identité de la spec, cookie du storageState owner) : le
    // DEUXIÈME duo — le premier vient du test précédent, dans le même worker
    // (mode serial).
    await reserverUnDuo(page);

    // Navigateur B : contexte neuf, sans storageState, pour une identité
    // séparée — le TROISIÈME et dernier duo, qui épuise la capacité.
    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await reserverUnDuo(pageB);

      // ── Capacité 6 = 3 duos, tous pris : le créneau affiche Complet, pour
      // TOUTE identité (y compris une troisième qui n'a rien réservé). ──
      const contextC = await browser.newContext();
      try {
        const pageC = await contextC.newPage();
        await pageC.goto(`/reserver/${ACTIVITY_DUO}`);
        await expect(
          pageC.getByRole("heading", {
            name: "Atelier Duo du Comptoir E2E",
          }),
        ).toBeVisible({ timeout: 30_000 });
        const creneauxSectionD = pageC.getByRole("region", {
          name: "Créneaux disponibles",
        });
        await expect(
          creneauxSectionD.locator("li").first().getByText("Complet"),
        ).toBeVisible();
        await expect(
          creneauxSectionD
            .locator("li")
            .first()
            .getByRole("button", { name: "Réserver pour deux" }),
        ).toHaveCount(0);
      } finally {
        await contextC.close();
      }
    } finally {
      await contextB.close();
    }
  });
});

test.describe("réserver — agenda commerçant, format et taille du groupe (RES-5)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("la liste des activités porte une pastille de format", async ({
    page,
  }) => {
    await page.goto("/dashboard/reservations");
    await expect(
      page.getByRole("heading", { name: "Réservations" }),
    ).toBeVisible({ timeout: 30_000 });

    // `exact` sur la pastille : sans lui, « Moment Signature » matche AUSSI
    // en sous-chaîne le nom de l'activité (« Moment Signature du Comptoir
    // E2E ») — mode strict, deux éléments, échec.
    const ligneSignature = page
      .locator("li")
      .filter({ hasText: "Moment Signature du Comptoir E2E" });
    await expect(
      ligneSignature.getByText("Moment Signature", { exact: true }),
    ).toBeVisible();

    const ligneDuo = page
      .locator("li")
      .filter({ hasText: "Atelier Duo du Comptoir E2E" });
    await expect(
      ligneDuo.getByText("Atelier Duo", { exact: true }),
    ).toBeVisible();
  });

  test("une réservation duo affiche 2 pers. sur sa ligne dans l'agenda", async ({
    page,
  }) => {
    // ── 1. Une réservation publique sur le créneau duo. ──
    await page.goto(`/reserver/${ACTIVITY_DUO}`);
    await expect(
      page.getByRole("heading", { name: "Atelier Duo du Comptoir E2E" }),
    ).toBeVisible({ timeout: 30_000 });
    const creneauxSection = page.getByRole("region", {
      name: "Créneaux disponibles",
    });
    const carteCreneau = creneauxSection.locator("li").first();
    const boutonReserver = carteCreneau.getByRole("button", {
      name: "Réserver pour deux",
    });
    // Le créneau est peut-être déjà complet si ce fichier a déjà tourné dans
    // ce projet Playwright (ordre non garanti entre fichiers) : dans ce cas
    // il porte déjà des réservations « 2 pers. », et ce test peut lire
    // directement l'agenda sans en ajouter une.
    if (await boutonReserver.isVisible().catch(() => false)) {
      await boutonReserver.click();
      await expect(
        page.getByRole("heading", {
          name: /Mes réservations|Ma réservation/,
        }),
      ).toBeVisible({ timeout: 30_000 });
    }

    // ── 2. L'agenda du commerçant : la ligne de réservation porte
    // « 2 pers. » — le comptoir doit savoir qu'un seul code ouvre la porte à
    // deux personnes. ──
    await page.goto(`/dashboard/reservations/${ACTIVITY_DUO}`);
    await expect(
      page.getByRole("heading", { name: "Créneaux" }),
    ).toBeVisible({ timeout: 30_000 });

    const plis = page.locator("details");
    const combien = await plis.count();
    for (let i = 0; i < combien; i++) {
      const pli = plis.nth(i);
      if ((await pli.getAttribute("open")) === null) {
        await pli.locator("> summary").click();
      }
    }

    await expect(page.locator("details li").getByText("2 pers.").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe("réserver — formulaire d'activité, préservation des étapes au toggle de format (RES-5)", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("une activité Signature créée avec 3 étapes les conserve après un aller-retour vers Standard", async ({
    page,
  }) => {
    const nomActivite = `Activité E2E Signature ${Date.now()}`;

    // ── 1. Création : format Signature, durée, et TROIS étapes. ──
    await page.goto("/dashboard/reservations");
    await expect(
      page.getByRole("heading", { name: "Réservations" }),
    ).toBeVisible({ timeout: 30_000 });

    const formulaireCreation = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Créer l'activité" }) });
    const champNom = formulaireCreation.getByLabel("Nom de l'activité");

    // LE CLIC QUI OUVRE LE FORMULAIRE PEUT PRÉCÉDER L'HYDRATATION. Le bouton
    // est déjà peint par le rendu serveur — visible, activé, cliquable au sens
    // de Playwright — mais React n'y a pas encore attaché de gestionnaire. Le
    // clic part alors dans le vide SANS ERREUR, le formulaire ne s'ouvre
    // jamais, et le `fill()` suivant attend 90 s un champ qui n'existe pas.
    // Vu en CI sur mobile-safari, une fois sur deux.
    //
    // On ne fait donc pas confiance au clic : on assure l'ÉTAT qu'il devait
    // produire. Le `if` est indispensable — recliquer un formulaire déjà
    // ouvert le refermerait, et la reprise se mordrait la queue.
    await expect(async () => {
      if (!(await champNom.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: "+ Nouvelle activité" }).click();
      }
      await expect(champNom).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await champNom.fill(nomActivite);
    await formulaireCreation
      .getByLabel("Format de l'activité")
      .selectOption("signature");

    await formulaireCreation
      .getByLabel(/Votre promesse/)
      .fill("Une promesse E2E, en une phrase.");
    await formulaireCreation
      .getByLabel("Durée annoncée (en minutes)")
      .fill("45");

    // Une étape existe déjà (la première, vide) : on en ajoute deux pour
    // atteindre le maximum (3), puis on remplit les trois.
    await formulaireCreation
      .getByRole("button", { name: "+ Ajouter une étape" })
      .click();
    await formulaireCreation
      .getByRole("button", { name: "+ Ajouter une étape" })
      .click();

    const titresEtapes = ["Étape un E2E", "Étape deux E2E", "Étape trois E2E"];
    const corpsEtapes = [
      "Ce qui se passe à l'étape un.",
      "Ce qui se passe à l'étape deux.",
      "Ce qui se passe à l'étape trois.",
    ];
    const champsTitre = formulaireCreation.getByLabel("Titre");
    const champsCorps = formulaireCreation.getByLabel("Ce qui s'y passe");
    for (let i = 0; i < 3; i++) {
      await champsTitre.nth(i).fill(titresEtapes[i]);
      await champsCorps.nth(i).fill(corpsEtapes[i]);
    }

    // `reloadOnSuccess` : la page se recharge, la nouvelle activité apparaît
    // dans la liste.
    await formulaireCreation
      .getByRole("button", { name: "Créer l'activité" })
      .click();
    const ligneActivite = page.getByRole("link", { name: new RegExp(nomActivite) });
    await expect(ligneActivite).toBeVisible({ timeout: 30_000 });
    await ligneActivite.click();

    // ── 2. Réglages : on bascule le type en Standard, on enregistre. ──
    await expect(
      page.getByRole("heading", { name: "Réglages de l'activité" }),
    ).toBeVisible({ timeout: 30_000 });
    const formulaireReglages = page
      .locator("form")
      .filter({ has: page.getByLabel("Format de l'activité") });

    await formulaireReglages
      .getByLabel("Format de l'activité")
      .selectOption("standard");
    // Les champs immersifs (promesse, durée, étapes) disparaissent avec le
    // format Standard — c'est la règle du panneau : masqués, pas effacés.
    await expect(formulaireReglages.getByLabel("Titre")).toHaveCount(0);

    await formulaireReglages.getByRole("button", { name: "Enregistrer" }).click();
    await expect(formulaireReglages.getByText("Enregistré.")).toBeVisible({
      timeout: 20_000,
    });

    // Un rechargement complet : la preuve porte sur ce que la BASE a gardé,
    // pas seulement sur l'état React encore monté dans l'onglet.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Réglages de l'activité" }),
    ).toBeVisible({ timeout: 30_000 });
    const formulaireApresReload = page
      .locator("form")
      .filter({ has: page.getByLabel("Format de l'activité") });
    await expect(
      await formulaireApresReload.getByLabel("Format de l'activité").inputValue(),
    ).toBe("standard");

    // ── 3. On rebascule en Signature : les trois étapes doivent ENCORE être
    // là — c'est le point qui aurait révélé un vrai bug produit si le
    // panneau avait effacé les colonnes au lieu de les masquer. ──
    await formulaireApresReload
      .getByLabel("Format de l'activité")
      .selectOption("signature");

    const champsTitreApres = formulaireApresReload.getByLabel("Titre");
    await expect(champsTitreApres).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(champsTitreApres.nth(i)).toHaveValue(titresEtapes[i]);
    }
    const champsCorpsApres = formulaireApresReload.getByLabel(
      "Ce qui s'y passe",
    );
    for (let i = 0; i < 3; i++) {
      await expect(champsCorpsApres.nth(i)).toHaveValue(corpsEtapes[i]);
    }
    await expect(
      formulaireApresReload.getByLabel(/Votre promesse/),
    ).toHaveValue("Une promesse E2E, en une phrase.");
  });
});
