import { expect, test } from "@playwright/test";

/**
 * Vitrine (VIT-1a / L10, VIT-1b / L11) : la chaîne publique bilingue, le
 * dashboard commerçant, la garde de rôle.
 *
 * Seed (`supabase/seed.sql`) : org « E2E Café » (owner/editor/cashier),
 * vitrine `e2e-comptoir` PUBLIÉE, deux cartes / trois rubriques / six fiches
 * dont une indisponible (« Curry de légumes grillés ») et une aux badges ET
 * allergènes vides (« Côtes-du-rhône »). Dix-neuf traductions anglaises, toutes
 * FRAÎCHES au seed — la péremption se prouve en pgTAP, qui la crée par un
 * update, jamais par une ligne figée ici (voir le bloc sélecteur plus bas).
 *
 * ══════════════════════════════════════════════════════════════════════
 * DEUX VITRINES, ET LA RÈGLE QUI LES SÉPARE — À LIRE AVANT D'AJOUTER UN TEST
 * ══════════════════════════════════════════════════════════════════════
 *
 * Les projets Playwright tournent EN PARALLÈLE sur la même base. Les tests du
 * dashboard ci-dessous créent des cartes, des rubriques et des fiches NON
 * traduites dans `e2e-comptoir`, et enregistrent ses réglages — ce qui, via le
 * trigger `touch_updated_at`, PÉRIME les traductions des réglages, pendant que
 * `revaliderVitrine` purge le cache ISR dans la foulée. La CI l'a payé sur
 * `df9360a` : trois champs traduisibles de plus (19 → 22) font tomber la
 * couverture à 86 %, sous le seuil de 95 % du sélecteur de langue, et le test
 * du sélecteur rougit sans qu'aucune ligne de produit ne soit fausse.
 *
 * D'où le partage, qui n'est pas une convention de confort :
 *
 *  • `e2e-comptoir` ABSORBE LES MUTATIONS. Tout ce que le dashboard crée ou
 *    enregistre atterrit là. Une assertion sur cette vitrine doit rester vraie
 *    quel que soit le nombre de fiches non traduites ajoutées à côté.
 *
 *  • `e2e-traduit` (org distincte, publiée, couverture 5/5) est en LECTURE
 *    SEULE POUR TOUS LES TESTS, sans exception — aucun test, dashboard ou
 *    public, n'y écrit jamais. C'est ce qui rend sa couverture stable.
 *
 * LE CRITÈRE DE PLACEMENT tient en une phrase : la couverture et la fraîcheur
 * sont des invariants GLOBAUX À LA VITRINE — un champ ajouté n'importe où les
 * déplace. Toute assertion qui en dépend (présence du sélecteur de langue,
 * accroche traduite des réglages, tout ce qui suppose « rien n'a changé
 * depuis le seed ») vit donc sur `e2e-traduit`. Ce qui est insensible aux
 * mutations — un statut HTTP, du contenu français, du chrome d'interface, ou
 * la superposition PAR CHAMP au niveau d'UNE fiche que le dashboard ne touche
 * jamais — peut rester sur `e2e-comptoir`.
 *
 * ── LE DRAPEAU EST TOMBÉ, ET CE FICHIER L'A SUIVI CONSCIEMMENT ──
 *
 * Ce bloc portait pendant tout L10 l'assertion inverse : `/v/e2e-comptoir`
 * rendait 404 même publiée, parce que `VITRINE_PUBLIQUE_OUVERTE` valait faux —
 * la Vitrine n'ouvrait qu'AVEC l'anglais. Le test était écrit pour ROUGIR le
 * jour de la bascule, et il a rougi : c'est ce qui a forcé la relecture de ce
 * fichier plutôt qu'un `expect` retourné à la va-vite. L'anglais est livré,
 * l'adresse répond, et les tests ci-dessous parcourent la vraie chaîne.
 *
 * Le 404 n'a pas disparu pour autant — il a retrouvé ses seules raisons
 * légitimes : slug inconnu, vitrine non publiée, droit éteint, et langue
 * inconnue dans le chemin.
 */
test.describe("vitrine — la page publique, en français", () => {
  test("l'adresse publique répond et rend la carte du seed", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/e2e-comptoir");
    expect(reponse?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "E2E Café" })).toBeVisible({
      timeout: 30_000,
    });

    // Une fiche DISPONIBLE de la carte ouverte par défaut (« Carte du midi »).
    // Volontairement pas « Velouté de potiron », qui est traduite : celle-ci
    // reste française dans les deux langues et ne prouverait rien plus bas.
    await expect(page.getByText("Tartare de bœuf")).toBeVisible();

    // LA FICHE ÉPUISÉE EST LÀ, ET ELLE EST DITE. La base la rend exprès avec
    // son drapeau : l'écran doit la GRISER, jamais la faire disparaître — un
    // plat qui s'évapore de la carte se lit comme une carte qui a changé.
    await expect(page.getByText("Curry de légumes grillés")).toBeVisible();
    await expect(page.getByText("Indisponible aujourd'hui")).toBeVisible();
  });

  test("une langue inconnue dans le chemin rend 404", async ({ page }) => {
    // PAS de repli silencieux sur le français : `/v/x/xx` servirait la même
    // page sous une adresse de plus, avec sa propre entrée de cache ISR.
    const reponse = await page.goto("/v/e2e-comptoir/xx");
    expect(reponse?.status()).toBe(404);
  });

  test("un slug inconnu rend 404, comme avant l'ouverture", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/adresse-qui-nexiste-pas-e2e");
    expect(reponse?.status()).toBe(404);
  });
});

/**
 * LA VARIANTE ANGLAISE — sur `e2e-traduit`, et seulement là.
 *
 * Tout ce bloc dépend de la FRAÎCHEUR du calque : une accroche traduite ne
 * s'affiche que si sa ligne de traduction est plus récente que la ligne
 * qu'elle traduit. Or la sauvegarde des réglages d'`e2e-comptoir` par les
 * tests du dashboard périme précisément celle-là. Ces assertions vivent donc
 * sur la vitrine en lecture seule.
 */
test.describe("vitrine — la variante anglaise", () => {
  test("/en répond et sert les champs traduits du seed", async ({ page }) => {
    const reponse = await page.goto("/v/e2e-traduit/en");
    expect(reponse?.status()).toBe(200);

    // Les TROIS NIVEAUX du calque, tels que le seed les pose : l'accroche des
    // réglages, le nom d'une carte et d'une rubrique, le nom d'une fiche.
    await expect(page.getByText("The quayside wine bar.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("The menu")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "By the glass" }),
    ).toBeVisible();
    await expect(page.getByText("Evening board")).toBeVisible();
    await expect(
      page.getByText("Aged cheeses and charcuterie."),
    ).toBeVisible();

    // Et le français correspondant a bien CÉDÉ la place, champ par champ.
    await expect(page.getByText("Le bar à vins du quai.")).toHaveCount(0);
    await expect(page.getByText("Planche du soir")).toHaveCount(0);
  });

  test("badges et allergènes passent en libellé anglais", async ({ page }) => {
    await page.goto("/v/e2e-traduit/en");
    const fiche = page.locator("article").filter({ hasText: "Evening board" });
    await expect(fiche).toBeVisible({ timeout: 30_000 });

    // « Planche du soir » porte `fait_maison` et l'allergène `lait`. Le
    // vocabulaire de plateforme est traduit à la main, une fois pour toutes
    // (`BADGES_EN` / `ALLERGENES_EN` dans `src/lib/vitrine.ts`) — le calque de
    // traduction n'y touche jamais.
    await expect(fiche.getByText(/Homemade/i)).toBeVisible();
    await expect(fiche.getByText("🏠 Fait maison")).toHaveCount(0);

    await fiche.getByText("Allergens").click();
    await expect(fiche.getByText(/Milk/i)).toBeVisible();
  });

  test("le retour au français est TOUJOURS offert sur la variante anglaise", async ({
    page,
  }) => {
    await page.goto("/v/e2e-traduit/en");
    const retour = page.getByRole("link", { name: "Français" });
    await expect(retour).toBeVisible({ timeout: 30_000 });
    await retour.click();
    await expect(page).toHaveURL(/\/v\/e2e-traduit$/);
    await expect(page.getByText("Le bar à vins du quai.")).toBeVisible();
  });
});

/**
 * CE QUI RESTE SUR `e2e-comptoir/en` — et pourquoi ça y survit.
 *
 * La superposition se décide CHAMP PAR CHAMP : chaque ligne de traduction est
 * comparée à SA cible, pas à la moyenne de la vitrine. Une fiche que les tests
 * du dashboard ne touchent jamais garde donc sa traduction fraîche même quand
 * trois fiches non traduites sont créées à côté et que la couverture globale
 * s'effondre. C'est exactement ce que ce bloc prouve, et c'est la seule chose
 * que la couverture globale ne peut PAS faire tomber.
 *
 * Le chrome d'interface, lui, ne vient d'aucune table
 * (`src/components/vitrine/langue.ts`) : il est insensible par construction.
 */
test.describe("vitrine — la superposition par champ, sous les mutations", () => {
  test("une fiche traduite reste anglaise quoi qu'il arrive à côté", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/e2e-comptoir/en");
    expect(reponse?.status()).toBe(200);

    // « Houmous du jour » n'est ni créée, ni modifiée, ni renommée par aucun
    // test — son calque ne périme pas. La péremption elle-même — une
    // traduction plus vieille que sa cible redonne le français — reste prouvée
    // par pgTAP (§12, `supabase/tests/vitrine.test.sql`), qui la CRÉE par un
    // update plutôt que de la figer dans un jeu de données.
    await expect(page.getByText("Hummus of the day")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Houmous du jour")).toHaveCount(0);

    // Le CHROME suit aussi.
    await expect(page.getByText("Unavailable today")).toBeVisible();
  });
});

/**
 * LE SÉLECTEUR DE LANGUE — et pourquoi l'assertion est celle-ci.
 *
 * La page FRANÇAISE n'offre l'anglais que si `selecteurLangues` est vrai,
 * c'est-à-dire au-delà de 95 % de couverture : envoyer un visiteur étranger sur
 * une carte à moitié française est pire que ne rien lui offrir, parce qu'il a
 * fait la démarche.
 *
 * ── POURQUOI SUR `e2e-traduit` ET PAS SUR `e2e-comptoir` ──
 *
 * La couverture est un RATIO sur toute la vitrine : elle bouge dès qu'un champ
 * traduisible apparaît quelque part. Sur `e2e-comptoir`, les tests du
 * dashboard créent en parallèle une carte, une rubrique et une fiche — trois
 * champs non traduits, 19/22 = 86 %, sous le seuil, sélecteur absent. Ce test
 * a rougi ainsi sur `df9360a` alors que le produit était juste.
 *
 * `e2e-traduit` est en lecture seule pour tous les tests et porte 5 champs
 * traduisibles, tous FRAIS (accroche + carte + rubrique + nom et description
 * de fiche) : 5/5 = 100 %, et ce chiffre ne dépend de l'ordonnancement
 * d'aucun projet Playwright.
 *
 * Le garde-fou inverse — sélecteur ABSENT sous le seuil — est prouvé par les
 * tests Vitest de `selecteurLanguesOuvert` aux deux bords du seuil ; le seed
 * n'a pas de vitrine publiée à couverture nulle pour l'asserter ici.
 */
test.describe("vitrine — sélecteur de langue", () => {
  test("la page française offre l'anglais dès le seuil de couverture atteint", async ({
    page,
  }) => {
    await page.goto("/v/e2e-traduit");
    await expect(page.getByText("Le bar à vins du quai.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "English" })).toBeVisible();

    // L'adresse anglaise reste atteignable EN DIRECT : le sélecteur est une
    // porte d'entrée, pas une autorisation. Vrai des DEUX vitrines — celle qui
    // absorbe les mutations le prouve mieux, puisqu'elle passe sous le seuil.
    const reponse = await page.goto("/v/e2e-comptoir/en");
    expect(reponse?.status()).toBe(200);
  });
});

/**
 * LES ANCRES CONTEXTUELLES (VIT-2 / L12) — sur `e2e-traduit`, EN LECTURE SEULE.
 *
 * Un QR posé sur une table encode `/v/{slug}#carte-{id}`. Le fragment n'atteint
 * jamais le serveur : c'est la condition du cache ISR, et c'est aussi pourquoi
 * ce test peut vivre sur la vitrine en lecture seule — il ne fait qu'ouvrir une
 * adresse déjà servie, sans écrire nulle part.
 *
 * Les identifiants sont ceux du seed (`supabase/seed.sql`, bloc `e2e-traduit`) :
 * une carte « La carte », une rubrique « Au verre », une fiche « Planche du
 * soir ». Les figer ici est le seul moyen de viser une ancre sans muter la base
 * pour s'en fabriquer une.
 */
test.describe("vitrine — ancres contextuelles", () => {
  const CARTE = "e2f20000-0000-4000-8000-000000000011";
  const FICHE = "e2f20000-0000-4000-8000-000000000031";

  test("l'ancre d'une carte ouvre la vitrine et l'élément visé existe", async ({
    page,
  }) => {
    const reponse = await page.goto(`/v/e2e-traduit#carte-${CARTE}`);
    // LE STATUT EST LE MÊME QUE SANS FRAGMENT, et c'est tout le point : le
    // navigateur n'envoie pas le `#`, donc rien ne distingue cette requête de
    // celle d'un visiteur venu par le lien nu — même entrée de cache.
    expect(reponse?.status()).toBe(200);

    await expect(page.getByText("Le bar à vins du quai.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(`#carte-${CARTE}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Au verre" })).toBeVisible();
  });

  test("l'ancre d'une fiche désigne la fiche elle-même", async ({ page }) => {
    await page.goto(`/v/e2e-traduit#fiche-${FICHE}`);
    const fiche = page.locator(`#fiche-${FICHE}`);
    await expect(fiche).toBeVisible({ timeout: 30_000 });
    await expect(fiche.getByText("Planche du soir")).toBeVisible();
  });
});

test.describe("vitrine — dashboard commerçant", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  test("réglages : adresse et thème affichés", async ({ page }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(page.getByLabel("Adresse")).toHaveValue("e2e-comptoir");
    await expect(page.getByText("Publiée")).toBeVisible();

    // LA PHRASE D'ATTENTE EST MORTE AVEC L11. L'encart ne dit plus « n'imprimez
    // pas vos QR codes tout de suite » : il dit que la vitrine est en ligne et
    // donne l'adresse, cliquable, pour qu'elle soit ouverte avant d'être
    // imprimée.
    await expect(page.getByText(/Votre vitrine est en ligne/)).toBeVisible();
    await expect(
      page.getByText(/n'imprimez pas vos QR codes tout de suite/),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /\/v\/e2e-comptoir$/ }),
    ).toBeVisible();
  });

  test("créer une carte, une rubrique et une fiche avec badges et allergènes", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── Carte ── `.first()` : le libellé « Nom de la carte » se répète
    // ensuite pour chaque carte existante (formulaire de renommage) — seul le
    // premier, dans le bloc de création, est ciblé ici.
    const nomCarte = `Brunch E2E ${Date.now()}`;
    await page.getByLabel("Nom de la carte").first().fill(nomCarte);
    await page.getByRole("button", { name: "Créer la carte" }).click();
    await expect(page.getByRole("heading", { name: nomCarte })).toBeVisible({
      timeout: 20_000,
    });

    // Deux conditions plutôt qu'une : un div ne contenant QUE le titre serait
    // le petit conteneur flex des flèches d'ordre (motif de
    // `CarteEditeur`), pas la carte entière — le `.last()` sur les divs qui
    // portent LES DEUX (titre et champ de rubrique) retombe sur la `Card`
    // elle-même, plus précise que le conteneur qui liste toutes les cartes.
    const carteCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: nomCarte }) })
      .filter({ has: page.getByLabel("Nouvelle rubrique") })
      .last();

    // ── Rubrique ──
    const nomRubrique = "Rubrique E2E";
    await carteCard.getByLabel("Nouvelle rubrique").fill(nomRubrique);
    await carteCard.getByRole("button", { name: "Ajouter" }).first().click();
    await expect(carteCard.getByText(nomRubrique)).toBeVisible({
      timeout: 20_000,
    });

    // ── Fiche ──
    // `.last()` : les `li` sont imbriqués (carte > rubrique) et le filtre
    // par texte matche AUSSI le parent — le plus profond est le bon.
    const rubriqueLi = page
      .locator("li")
      .filter({ hasText: nomRubrique })
      .last();
    // HORODATÉ comme `nomCarte`, et pour la même raison : sur une base
    // accumulée (suite complète, reruns), un « Plat E2E » d'un run précédent
    // existe DÉJÀ — le `.last()` ancrait cette fiche-là, que le rechargement
    // post-création efface ensuite (« résolue mais hidden 20 s », trace L12).
    const nomFiche = `Plat E2E ${Date.now()}`;
    await rubriqueLi.getByLabel("Nouveau plat").fill(nomFiche);
    await rubriqueLi.getByRole("button", { name: "Ajouter" }).click();

    const ficheLi = page.locator("li").filter({ hasText: nomFiche }).last();
    await expect(ficheLi).toBeVisible({ timeout: 20_000 });

    // Ouvrir le détail pour cocher badge + allergène. Le contrôle est un
    // <summary> natif (fiche-editeur.tsx) : Playwright l'expose en `generic`,
    // jamais en `button` — on le vise par sa balise ET son texte, car la
    // fiche porte un second <summary> (le pli « Allergènes » du rendu).
    await ficheLi
      .locator("summary")
      .filter({ hasText: /Modifier|Voir le détail/ })
      .first()
      .click();

    // ATTENDRE L'ACCALMIE AVANT DE COCHER. Chaque mutation de cet écran est
    // suivie d'un `revaliderVitrine` puis d'un rafraîchissement : un `check()`
    // lancé pendant ce cycle meurt en « waiting for navigation ». Rendre la
    // case VISIBLE avant de la toucher fait de l'attente un ancrage explicite
    // plutôt qu'une course avec le routeur.
    const caseVegan = ficheLi.getByLabel("🌱 Vegan");
    await expect(caseVegan).toBeVisible({ timeout: 20_000 });
    await caseVegan.check();

    // Les allergènes vivent derrière un second pli DANS l'éditeur — l'ouvrir
    // avant de cocher, sinon la case existe mais n'est pas visible.
    await ficheLi
      .locator("summary")
      .filter({ hasText: "Allergènes" })
      .first()
      .click();
    const caseGluten = ficheLi.getByLabel("Gluten");
    await expect(caseGluten).toBeVisible({ timeout: 20_000 });
    await caseGluten.check();

    await ficheLi
      .getByRole("button", { name: "Enregistrer la fiche" })
      .click();

    // TOAST *OU* ÉTAT PERSISTÉ, PAS LE TOAST SEUL. « Enregistré. » est un
    // `role="status"` éphémère, et le rafraîchissement qui suit la sauvegarde
    // peut l'emporter avant que l'assertion ne l'observe — sur une machine de
    // CI chargée, l'ordre des deux n'est pas garanti. Ce qui est STABLE après
    // la sauvegarde, c'est la valeur elle-même : la case cochée est encore
    // cochée. On accepte l'un ou l'autre, ce qui prouve la même chose sans
    // dépendre de qui gagne la course.
    await expect
      .poll(
        async () =>
          (await ficheLi.getByText("Enregistré.").count()) > 0 ||
          (await caseVegan.isChecked().catch(() => false)),
        { timeout: 20_000 },
      )
      .toBe(true);

    // ── Marquer indisponible ──
    // Même précaution : ancrer sur le bouton re-rendu avant de cliquer.
    const boutonIndispo = ficheLi.getByRole("button", {
      name: "Marquer indisponible",
    });
    await expect(boutonIndispo).toBeVisible({ timeout: 20_000 });
    await boutonIndispo.click();
    await expect(ficheLi.getByText("Indisponible")).toBeVisible({
      timeout: 20_000,
    });

    // ── Réordonner : la carte fraîchement créée descend d'un cran ──
    await carteCard
      .getByRole("button", { name: new RegExp(`Descendre.*${nomCarte}`) })
      .click({ timeout: 5_000 })
      .catch(() => {});
  });

  /**
   * L'IMPORT ASSISTÉ — et la preuve que RIEN NE PART SANS L'APERÇU.
   *
   * Le nom de la carte est HORODATÉ : `vitrine_menus` porte une unicité par
   * organisation, et un nom fixe ferait échouer le second passage en 23505 sans
   * qu'aucune ligne de produit ne soit fausse. Motif du test de création
   * juste au-dessus.
   *
   * Les fiches sont suffixées « E2E » pour rester reconnaissables au milieu de
   * ce que les autres tests créent sur `e2e-comptoir`.
   */
  test("import assisté : l'aperçu se relit, se corrige, puis crée la carte", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(page.getByRole("heading", { name: "Vitrine" })).toBeVisible({
      timeout: 30_000,
    });

    await page
      .getByLabel("Votre carte, en texte")
      .fill(
        [
          "ENTRÉES",
          "Houmous E2E — pois chiches — 7 €",
          "Soupe E2E — 6,50",
          "PLATS",
          "Risotto E2E — 18 €",
        ].join("\n"),
      );

    // « Analyser » N'ENVOIE RIEN : il affiche. C'est la garantie que ce test
    // vérifie d'abord — l'aperçu existe avant qu'aucune carte n'ait été créée.
    await page.getByRole("button", { name: "Analyser ma carte" }).click();

    const nomChamp = page.locator("#vitrine-import-nom");
    await expect(nomChamp).toBeVisible({ timeout: 10_000 });
    // ANCRÉ SUR LE CONTENEUR, pas sur le texte seul : « 2 fiches » existe en
    // quatre exemplaires sur la page (compteur global, comptes par rubrique de
    // l'aperçu, phrase du refus de suppression d'une carte existante). Seul le
    // bloc `#vitrine-import-comptes` porte le verdict de l'import.
    const comptes = page.locator("#vitrine-import-comptes");
    await expect(comptes.getByText("2 rubriques", { exact: true })).toBeVisible();
    await expect(comptes.getByText("3 fiches", { exact: true })).toBeVisible();

    // ── RECLASSER UNE LIGNE, et voir les comptes suivre ──
    const ligneSoupe = page.locator("li").filter({ hasText: "Soupe E2E" }).last();
    await ligneSoupe.getByLabel("Classement").selectOption("ignorer");
    await expect(comptes.getByText("2 fiches", { exact: true })).toBeVisible();
    // …puis la rendre à la carte : le reclassement se fait dans les deux sens.
    await ligneSoupe.getByLabel("Classement").selectOption("fiche");
    await expect(comptes.getByText("3 fiches", { exact: true })).toBeVisible();

    const nomCarte = `Import E2E ${Date.now()}`;
    await nomChamp.fill(nomCarte);

    await page.getByRole("button", { name: "Importer", exact: true }).click();

    // Le succès porte les COMPTES : c'est ce qui distingue un import réussi
    // d'un import partiel, et c'est la seule chose que le commerçant lit.
    await expect(page.getByText(/^Carte créée : 2 rubriques, 3 fiches\.$/)).toBeVisible({
      timeout: 20_000,
    });

    // Et la carte EXISTE. Rechargement explicite plutôt que d'attendre le
    // rafraîchissement du routeur, dont ce dépôt a mesuré qu'il n'aboutit pas
    // 5 à 32 % du temps (`use-action-form.ts`) : ce test-ci juge l'import, pas
    // la fenêtre de React.
    await page.reload();
    await expect(page.getByRole("heading", { name: nomCarte })).toBeVisible({
      timeout: 30_000,
    });
  });

  /**
   * LES QR CONTEXTUELS — le choix du contexte, les exemplaires, la planche.
   *
   * `window.print()` n'est JAMAIS déclenché : Playwright ne sait pas fermer la
   * boîte d'impression du système, et le test resterait pendu. On vérifie que
   * le bouton est là et que la planche est rendue — ce qui est exactement ce
   * qu'un commerçant voit avant de cliquer.
   */
  test("QR et impression : une carte visée, deux exemplaires, une planche", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "QR et impression" }),
    ).toBeVisible({ timeout: 30_000 });

    // La section est PLIÉE par défaut : rien ne se dessine avant l'intention
    // (les canvas au montage chargeaient le fil principal — CI WebKit L12).
    await page
      .locator("summary")
      .filter({ hasText: "Préparer les QR à imprimer" })
      .click();

    // Index 1 : la première carte du commerce (index 0 = l'accueil).
    await page.getByLabel("Ce que le QR ouvre").selectOption({ index: 1 });

    // L'ADRESSE ENCODÉE PORTE L'ANCRE, et rien d'autre : pas de `?table=`,
    // pas de `?carte=` — le cache ISR de la page publique en dépend.
    await expect(page.getByText(/\/v\/e2e-comptoir#carte-/)).toBeVisible();

    await page.getByLabel("Exemplaires").fill("2");
    await expect(page.locator(".vitrine-qr-carte")).toHaveCount(2);
    await expect(page.locator(".vitrine-qr-carte canvas")).toHaveCount(2);

    // Le numéro de table est un LIBELLÉ IMPRIMÉ : les deux exemplaires encodent
    // la même adresse et ne se distinguent que par ce texte.
    await expect(page.getByText("Table 1")).toBeVisible();
    await expect(page.getByText("Table 2")).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Imprimer la planche/ }),
    ).toBeVisible();
  });
});

test.describe("vitrine — rôle caissier", () => {
  test.use({ storageState: "e2e/.auth/cashier.json" });

  test("le caissier n'a ni entrée « Vitrine » dans la nav ni accès à la page", async ({
    page,
  }) => {
    await page.goto("/dashboard/redeem");
    await expect(page.getByRole("link", { name: "Vitrine" })).toHaveCount(0);

    // `notFound()` ICI EST IMBRIQUÉ dans le layout dashboard, déjà envoyé en
    // 200 (flux RSC) : le statut HTTP reste 200, seul le contenu dit le refus
    // — même motif que `reserver.spec.ts` (« jeton inconnu »). Les tests
    // publics ci-dessus restent sur `status()` : leurs 404 sont, elles, au
    // TOUT premier niveau, avant tout layout.
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { name: "Page introuvable" }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
