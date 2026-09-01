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

  /**
   * LES CONTENUS MIS EN AVANT (VIT-4) — sur `e2e-comptoir`, et c'est correct.
   *
   * Ils vivent dans `vitrine_contenus`, une table À PART qui ne porte AUCUN
   * champ traduisible : les ajouter ne change ni le total de champs
   * traduisibles ni leur fraîcheur, donc rien ici ne peut déplacer le seuil de
   * 95 % du sélecteur de langue. C'est exactement le critère de placement posé
   * en tête de ce fichier.
   *
   * AUCUN COMPTE EXACT n'est asserté : le test du dashboard plus bas pose puis
   * retire un troisième contenu sur cette même vitrine, et les projets
   * Playwright tournent en parallèle. Les deux contenus du seed, eux, ne sont
   * touchés par personne.
   */
  test("les contenus mis en avant du seed sont rendus, en https", async ({
    page,
  }) => {
    await page.goto("/v/e2e-comptoir");
    await expect(page.getByRole("heading", { name: "E2E Café" })).toBeVisible({
      timeout: 30_000,
    });

    await expect(
      page.getByRole("heading", { name: "À la une" }),
    ).toBeVisible();

    for (const [titre, url] of [
      ["Le comptoir en vidéo", "https://exemple.test/e2e/comptoir-video"],
      ["Notre torréfaction, expliquée", "https://exemple.test/e2e/torrefaction"],
    ] as const) {
      const lien = page.getByRole("link", { name: titre });
      await expect(lien).toBeVisible();
      // L'ADRESSE EST DITE EN ENTIER : le `check` de la table clôt le schéma à
      // `https`, et une régression qui laisserait passer `http:` ou
      // `javascript:` se verrait ici avant de se voir en salle.
      await expect(lien).toHaveAttribute("href", url);
      await expect(lien).toHaveAttribute("target", "_blank");
      await expect(lien).toHaveAttribute("rel", /noopener/);
      await expect(lien).toHaveAttribute("rel", /noreferrer/);
    }
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

/**
 * LES PORTES DES MODULES (VIT-3 / L13) — l'annuaire, des deux côtés du vide.
 *
 * ── POURQUOI CES DEUX VITRINES, ET PAS UNE ──
 *
 * Les deux blocs se masquent EUX-MÊMES quand leurs listes sont vides. Un test
 * qui ne verrait que la vitrine riche prouverait le rendu et jamais le masquage
 * — et c'est le masquage qui a le mode d'échec silencieux : un « Réserver »
 * suivi de rien sur la vitrine d'un commerce qui n'a activé aucun module.
 *
 *  • `e2e-comptoir` porte les quatre familles : deux activités actives, deux
 *    files ouvertes, une offre DANS sa fenêtre (« Tarte du jour E2E » ; « Drop
 *    du soir E2E » n'ouvre que dans deux heures et la RPC ne la rend pas), et
 *    le quiz `e2e-quiz`. Ses portes sont écrites en queue de son `ordre_blocs`.
 *
 *  • `e2e-traduit` est une AUTRE organisation, sans aucun module : les six
 *    listes reviennent vides, et les deux ancres ne doivent pas exister. C'est
 *    ce test-là qui rougirait si un jour un bloc se rendait « au cas où ».
 *
 * ── CE QUI EST ASSERTÉ, ET CE QUI NE L'EST PAS ──
 *
 * Les NOMS des portes viennent du seed et restent français sur les deux
 * variantes de langue (`portes` ne porte aucun champ traduisible). Les RANGS,
 * les compteurs et les fenêtres horaires n'en sont pas : la fenêtre est
 * formatée dans le fuseau du navigateur et deux projets Playwright peuvent
 * tourner sous des fuseaux différents. On vérifie donc la PORTE — son intitulé
 * et sa destination — et que la destination répond.
 *
 * AUCUNE ÉCRITURE : ce bloc n'entre dans aucune file, ne retient aucun créneau
 * et ne prend aucune unité de stock. Il ouvre des pages, et c'est tout —
 * `e2e-traduit` reste donc en lecture seule, comme la règle en tête l'exige.
 */
test.describe("vitrine — les portes des modules", () => {
  test("la vitrine riche annonce Réserver et les jeux, et les portes mènent quelque part", async ({
    page,
  }) => {
    await page.goto("/v/e2e-comptoir");
    await expect(page.getByRole("heading", { name: "E2E Café" })).toBeVisible({
      timeout: 30_000,
    });

    const reserver = page.locator("#bloc-reserver");
    await expect(reserver).toBeVisible();

    // Les trois groupes, par leur chrome français.
    await expect(reserver.getByText("Réserver une table")).toBeVisible();
    await expect(reserver.getByText("File d'attente")).toBeVisible();
    await expect(reserver.getByText("Offres du moment")).toBeVisible();

    // UNE PORTE DE CHAQUE FAMILLE, nommée par le seed et visée par sa
    // DESTINATION plutôt que par son rang : l'ordre est celui du nom, et une
    // activité ajoutée par un autre test le décalerait.
    await expect(
      reserver.getByRole("link", { name: "Dégustation du Comptoir E2E" }),
    ).toHaveAttribute("href", /^\/reserver\/[0-9a-f-]{36}$/);
    await expect(
      reserver.getByRole("link", { name: "Comptoir E2E", exact: true }),
    ).toHaveAttribute("href", /^\/reserver\/file\//);
    // « Tarte du jour E2E » est ouverte depuis une heure et pour trois : c'est
    // la seule offre du seed dont la fenêtre soit EN COURS.
    await expect(
      reserver.getByRole("link", { name: "Tarte du jour E2E" }),
    ).toHaveAttribute("href", /^\/reserver\/stock\//);

    // ── Le bloc des jeux, et sa promesse de lancement volontaire ──
    const experiences = page.locator("#bloc-experiences");
    await expect(experiences).toBeVisible();
    await expect(experiences.getByText(/À vous de jouer/)).toBeVisible();
    await expect(
      experiences.getByRole("link", { name: "Quiz du Comptoir E2E" }),
    ).toHaveAttribute("href", "/quiz/e2e-quiz");
  });

  test("la porte d'une file ouvre une page qui répond, sans y entrer", async ({
    page,
  }) => {
    await page.goto("/v/e2e-comptoir");
    const porte = page
      .locator("#bloc-reserver")
      .getByRole("link", { name: "Comptoir E2E", exact: true });
    await expect(porte).toBeVisible({ timeout: 30_000 });

    // L'ADRESSE EST LUE, PUIS OUVERTE EN DIRECT — et non cliquée. `goto` rend
    // le statut HTTP, ce qu'un clic ne donne pas : c'est la seule façon de
    // prouver que la porte ne mène pas à un 404, qui est précisément ce qu'un
    // annuaire mal câblé produit.
    const href = await porte.getAttribute("href");
    expect(href).toBeTruthy();
    const reponse = await page.goto(href!);
    expect(reponse?.status()).toBe(200);

    // RIEN N'EST CLIQUÉ SUR CETTE PAGE : entrer dans la file écrirait une
    // entrée, et `reserver-attente.spec.ts` tourne en parallèle sur la même
    // base. Le pied de page suffit — il n'existe que si la file a été chargée.
    await expect(page.getByText(/File d'accueil proposée par/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("une vitrine sans module ne rend aucune porte, pas même un titre vide", async ({
    page,
  }) => {
    const reponse = await page.goto("/v/e2e-traduit");
    expect(reponse?.status()).toBe(200);
    await expect(page.getByText("Le bar à vins du quai.")).toBeVisible({
      timeout: 30_000,
    });

    // L'ABSENCE DES ANCRES est l'assertion, et pas l'absence d'un texte : ce
    // sont elles que les QR contextuels peuvent viser (VIT-2), et un bloc rendu
    // vide se serait trahi ici avant de se trahir en boutique.
    await expect(page.locator("#bloc-reserver")).toHaveCount(0);
    await expect(page.locator("#bloc-experiences")).toHaveCount(0);
  });
});

test.describe("vitrine — dashboard commerçant", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });

  /**
   *  N EST PAS UN DETAIL, ET IL A ETE AJOUTE APRES UN ROUGE.
   *
   * Ces quatre assertions veulent dire « la page Vitrine est chargee », et
   * visaient son titre par son seul nom. Or  fait une
   * correspondance par SOUS-CHAINE : le jour ou VIT-14 a ajoute un bloc
   * « Supprimer la vitrine » en pied d ecran, le locator a resolu DEUX
   * elements et Playwright a refuse en mode strict — sur quatre tests qui
   * n avaient rien a voir avec la suppression.
   *
   * Le niveau 1 dit ce que ces assertions veulent vraiment dire : le titre de
   * la PAGE, dont il n existe qu un. Tout futur titre contenant « Vitrine »
   * passera desormais a cote sans rien casser.
   */
  test("réglages : adresse et thème affichés", async ({ page }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByLabel("Adresse", { exact: true }),
    ).toHaveValue("e2e-comptoir");
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

  /**
   * « À LA UNE » — LA PLACE 3, ET ELLE SEULE.
   *
   * Le seed occupe volontairement DEUX places sur trois (`vitrine_contenus`,
   * rangs 1 et 2) précisément pour laisser celle-ci libre : le test peut donc
   * poser puis retirer sans jamais toucher aux deux contenus que le test public
   * plus haut asserte. Il se referme sur lui-même — la place repart vide —, ce
   * qui le rend rejouable et laisse la base dans l'état du seed.
   *
   * Le compteur d'ouvertures est vérifié dans la foulée : il est sur le même
   * écran, il n'a aucune valeur stable (le beacon des tests publics
   * l'incrémente en parallèle), et c'est donc sa PHRASE qui est assertée, pas
   * son nombre.
   */
  test("à la une : poser un contenu à la place 3, puis le retirer", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(page.getByRole("heading", { name: "À la une (3 max)" })).toBeVisible(
      { timeout: 30_000 },
    );

    // Le compteur d'audience, sur le même écran : « N ouvertures de la page
    // publique », quel que soit N.
    await expect(
      page.getByText(/\d+ ouvertures? de la page publique/),
    ).toBeVisible();

    // Les étiquettes portent le numéro de place : aucun `nth()` à tenir
    // d'accord avec l'ordre du rendu, et « Adresse » seul aurait aussi
    // désigné le champ du slug plus haut sur la page.
    const champTitre = page.getByLabel("Titre de la place 3");
    const champUrl = page.getByLabel("Adresse de la place 3");

    const titre = `Notre menu de saison ${Date.now()}`;
    await champTitre.fill(titre);
    await champUrl.fill("https://exemple.test/e2e/place-trois");
    await page.getByRole("button", { name: "Mettre en avant" }).last().click();

    // Le bouton de retrait N'EXISTE QUE SUR UNE PLACE OCCUPÉE : sa présence est
    // la preuve que la ligne est en base, sans lire l'écran public (servi
    // depuis le cache ISR, il ne l'aurait pas encore montrée).
    const retirer = page.getByRole("button", { name: "Retirer la place 3" });
    await expect(retirer).toBeVisible({ timeout: 20_000 });
    await expect(champTitre).toHaveValue(titre);

    await retirer.click();
    await expect(retirer).toHaveCount(0, { timeout: 20_000 });
    await expect(champTitre).toHaveValue("");
  });

  test("créer une carte, une rubrique et une fiche avec badges et allergènes", async ({
    page,
  }) => {
    await page.goto("/dashboard/vitrine");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vitrine" }),
    ).toBeVisible({ timeout: 30_000 });

    // ── Carte ── `.first()` : le libellé « Nom de la carte » se répète
    // ensuite pour chaque carte existante (formulaire de renommage) — seul le
    // premier, dans le bloc de création, est ciblé ici.
    const nomCarte = `Brunch E2E ${Date.now()}`;

    // CE QU'ON VEUT PROUVER : créer une carte, une rubrique et une fiche
    // passe par des server actions — la page ne doit JAMAIS être rechargée.
    //
    // `framenavigated` ne le prouvait pas. Il se déclenche AUSSI pour les
    // navigations de MÊME DOCUMENT — `history.replaceState`, que le routeur
    // Next appelle de son propre chef — et WebKit en émet là où Chromium
    // n'en émet pas. Le compteur rougissait donc sur une PR qui ne touchait
    // QUE des fichiers de documentation, en désignant un défaut inexistant.
    //
    // On interroge donc le DOCUMENT lui-même. Un marqueur posé sur `window`
    // ne survit pas à un rechargement, et survit à tout le reste : c'est
    // exactement la propriété affirmée, et elle ne dépend d'aucun événement
    // du navigateur.
    await page.evaluate(() => {
      (window as unknown as { __sansRechargement?: number }).__sansRechargement =
        Date.now();
    });
    const documentIntact = () =>
      page.evaluate(
        () =>
          (window as unknown as { __sansRechargement?: number })
            .__sansRechargement ?? null,
      );
    await page.getByLabel("Nom de la carte").first().fill(nomCarte);
    await page.getByRole("button", { name: "Créer la carte" }).click();
    await expect(page.getByRole("heading", { name: nomCarte })).toBeVisible({
      timeout: 20_000,
    });
    // Le marqueur est toujours là : aucun rechargement depuis sa pose (carte).
    expect(await documentIntact()).not.toBeNull();

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
    // Le marqueur est toujours là : aucun rechargement depuis sa pose (rubrique).
    expect(await documentIntact()).not.toBeNull();

    // ── Fiche ──
    // `.last()` : les `li` sont imbriqués (carte > rubrique) et le filtre
    // par texte matche AUSSI le parent — le plus profond est le bon.
    // DEUX FILTRES, ET LE SECOND EST DEVENU NÉCESSAIRE : depuis L17, l'éditeur
    // du Duo Miroir liste les fiches avec leur chemin « Carte · Rubrique », donc
    // des `li` de CETTE page contiennent le nom de la rubrique sans être des
    // rubriques — et ils viennent APRÈS, donc `.last()` tombait sur eux (CI
    // L17). Le filtre `has` ancre sur ce qui définit vraiment une rubrique de
    // l'éditeur : son champ d'ajout de plat.
    const rubriqueLi = page
      .locator("li")
      .filter({ hasText: nomRubrique })
      .filter({ has: page.getByLabel("Nouveau plat") })
      .last();
    // HORODATÉ comme `nomCarte`, et pour la même raison : sur une base
    // accumulée (suite complète, reruns), un « Plat E2E » d'un run précédent
    // existe DÉJÀ — le `.last()` ancrait cette fiche-là, que le rechargement
    // post-création efface ensuite (« résolue mais hidden 20 s », trace L12).
    const nomFiche = `Plat E2E ${Date.now()}`;
    await rubriqueLi.getByLabel("Nouveau plat").fill(nomFiche);
    await rubriqueLi.getByRole("button", { name: "Ajouter" }).click();

    // Même précaution : la fiche fraîchement créée apparaît AUSSI dans la liste
    // à cocher de l'éditeur Duo. On vise celle qui porte son PLI.
    //
    // `has: locator("summary")` et NON `getByRole("button", …)` : le bouton
    // « Enregistrer la fiche » vit à l'intérieur du `<details>`, donc l'arbre
    // d'accessibilité le tient pour CACHÉ tant que le pli est fermé — et
    // `getByRole` ignore le caché par défaut, si bien que le filtre ne matchait
    // jamais (CI L17). Le `<summary>`, lui, est toujours visible, et la ligne à
    // cocher de l'éditeur Duo n'en a pas.
    const ficheLi = page
      .locator("li")
      .filter({ hasText: nomFiche })
      .filter({ has: page.locator("summary") })
      .last();
    await expect(ficheLi).toBeVisible({ timeout: 20_000 });
    // Le marqueur est toujours là : aucun rechargement depuis sa pose (fiche).
    expect(await documentIntact()).not.toBeNull();

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
    await expect(page.getByRole("heading", { level: 1, name: "Vitrine" })).toBeVisible({
      timeout: 30_000,
    });

    // LES NOMS COLLÉS SONT HORODATÉS, comme `nomCarte` — la trace CI l'a
    // prouvé : sur base accumulée, « Soupe E2E » existait DÉJÀ dans le
    // catalogue (importé par le run du projet précédent), et le `.last()` du
    // reclassement ancrait cette fiche-là — qui n'a pas de champ
    // « Classement » — au lieu de la ligne d'aperçu. 90 s d'attente sur un
    // locator qui ne pouvait pas résoudre.
    const marque = Date.now();
    const soupe = `Soupe E2E ${marque}`;
    const carte = [
      "ENTRÉES",
      `Houmous E2E ${marque} — pois chiches — 7 €`,
      `${soupe} — 6,50`,
      "PLATS",
      `Risotto E2E ${marque} — 18 €`,
    ].join("\n");
    const analyser = page.getByRole("button", { name: "Analyser ma carte" });

    // UN REMPLISSAGE AVANT L'HYDRATATION EST PERDU, ET LE REJOUER À L'IDENTIQUE
    // NE LE RATTRAPE PAS. La trace CI (mobile-safari) montre les deux moitiés
    // du piège : le `textarea` PORTE le texte, et « Analyser ma carte » reste
    // `disabled` — l'état React `texte` est vide, parce que l'événement `input`
    // du premier remplissage n'avait pas encore de gestionnaire. Les seize
    // reprises suivantes n'ont alors rien émis du tout : la valeur du DOM était
    // déjà celle qu'elles voulaient poser. Vider avant de remplir garantit une
    // vraie TRANSITION de valeur à chaque tentative — donc un vrai événement.
    await expect(async () => {
      const zone = page.getByLabel("Votre carte, en texte");
      await zone.fill("");
      await zone.fill(carte);
      await expect(analyser).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    // « Analyser » N'ENVOIE RIEN : il affiche. C'est la garantie que ce test
    // vérifie d'abord — l'aperçu existe avant qu'aucune carte n'ait été créée.
    await analyser.click();

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
    const ligneSoupe = page.locator("li").filter({ hasText: soupe }).last();
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
   * L'ÉCRAN DE TRADUCTION (VIT-5 / L15) — poser un anglais, puis le retirer.
   *
   * ── CE TEST NE TOUCHE QUE CE QU'IL A CRÉÉ, ET C'EST LA RÈGLE DU FICHIER ──
   *
   * Les dix-neuf traductions du seed sur `e2e-comptoir` sont un INVARIANT de
   * couverture, et `e2e-traduit` est en lecture seule pour tout le monde. Ce
   * test crée donc sa PROPRE fiche, horodatée, et ne pose puis ne retire un
   * anglais que sur elle. Aucune ligne du seed n'est lue, écrite ni comptée.
   *
   * Il n'asserte AUCUN compte exact non plus — ni dans la jauge, ni ailleurs :
   * les projets Playwright tournent en parallèle sur la même base, et chaque
   * fiche créée par les tests voisins déplace le total. C'est la FORME du
   * chiffre qui est vérifiée (« N champs sur M »), pas sa valeur, exactement
   * comme le compteur d'ouvertures plus haut.
   *
   * La fiche créée reste en base à la fin, non traduite — comme celles des
   * autres tests du dashboard. Seul l'anglais posé par ce test est repris, ce
   * qui laisse la couverture du seed strictement où elle était.
   */
  test("traductions : traduire le nom d'une fiche créée, puis retirer l'anglais", async ({
    page,
  }) => {
    const marque = Date.now();
    const nomCarte = `Traductions E2E ${marque}`;
    const nomRubrique = `Rubrique trad ${marque}`;
    const nomFiche = `Plat à traduire ${marque}`;

    // ── La matière : une carte, une rubrique, une fiche, par l'éditeur réel ──
    await page.goto("/dashboard/vitrine");
    await expect(page.getByRole("heading", { level: 1, name: "Vitrine" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel("Nom de la carte").first().fill(nomCarte);
    await page.getByRole("button", { name: "Créer la carte" }).click();
    await expect(page.getByRole("heading", { name: nomCarte })).toBeVisible({
      timeout: 20_000,
    });

    // Motif du test de création plus haut : deux conditions pour retomber sur
    // la `Card` de la carte et non sur le conteneur des flèches d'ordre.
    const carteCard = page
      .locator("div")
      .filter({ has: page.getByRole("heading", { name: nomCarte }) })
      .filter({ has: page.getByLabel("Nouvelle rubrique") })
      .last();

    await carteCard.getByLabel("Nouvelle rubrique").fill(nomRubrique);
    await carteCard.getByRole("button", { name: "Ajouter" }).first().click();
    await expect(carteCard.getByText(nomRubrique)).toBeVisible({
      timeout: 20_000,
    });

    // DEUX FILTRES, ET LE SECOND EST DEVENU NÉCESSAIRE : depuis L17, l'éditeur
    // du Duo Miroir liste les fiches avec leur chemin « Carte · Rubrique », donc
    // des `li` de CETTE page contiennent le nom de la rubrique sans être des
    // rubriques — et ils viennent APRÈS, donc `.last()` tombait sur eux (CI
    // L17). Le filtre `has` ancre sur ce qui définit vraiment une rubrique de
    // l'éditeur : son champ d'ajout de plat.
    const rubriqueLi = page
      .locator("li")
      .filter({ hasText: nomRubrique })
      .filter({ has: page.getByLabel("Nouveau plat") })
      .last();
    await rubriqueLi.getByLabel("Nouveau plat").fill(nomFiche);
    await rubriqueLi.getByRole("button", { name: "Ajouter" }).click();
    await expect(
      page.locator("li").filter({ hasText: nomFiche }).last(),
    ).toBeVisible({ timeout: 20_000 });

    // ── L'écran de traduction ──
    await page.goto("/dashboard/vitrine/traductions");
    await expect(
      page.getByRole("heading", { name: "Où en est votre anglais" }),
    ).toBeVisible({ timeout: 30_000 });

    // LA JAUGE PORTE DES CHIFFRES, et elle dit la règle du sélecteur. Les deux
    // sont assertés par leur FORME : la valeur bouge à chaque fiche créée par
    // les tests voisins.
    await expect(
      page.getByText(/\d+ champs? sur \d+ traduits? et à jour/),
    ).toBeVisible();
    await expect(
      page.getByText(/L'anglais se propose aux visiteurs à partir de \d+ %/),
    ).toBeVisible();

    // L'ÉTIQUETTE PORTE LE NOM FRANÇAIS DE LA FICHE, horodaté : elle est donc
    // unique sur un écran qui liste toutes les fiches du commerce, sans aucun
    // `nth()` à tenir d'accord avec l'ordre du rendu.
    const libelle = `Anglais : Nom — ${nomFiche}`;
    const saisie = page.getByLabel(libelle);
    await expect(saisie).toBeVisible({ timeout: 20_000 });

    // Le bloc du champ : ancré sur SA saisie, donc insensible aux autres
    // fiches — c'est lui qui porte le badge d'état.
    const bloc = page
      .locator("div")
      .filter({ has: page.getByLabel(libelle) })
      .last();
    await expect(bloc.getByText("Pas encore traduit")).toBeVisible();

    // Le retrait n'existe que sur une traduction posée : son ABSENCE est ici la
    // preuve qu'aucune ligne n'existe encore pour ce champ.
    const retirer = page.getByRole("button", {
      name: `Retirer l'anglais : Nom — ${nomFiche}`,
    });
    await expect(retirer).toHaveCount(0);

    // ── Traduire ──
    await saisie.fill(`Test dish ${marque}`);
    await bloc.getByRole("button", { name: "Traduire" }).click();

    // La traduction est FRAÎCHE d'emblée : elle vient d'être écrite sur le
    // français courant. Le bouton de retrait apparaît dans le même mouvement.
    await expect(retirer).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .locator("div")
        .filter({ has: page.getByLabel(libelle) })
        .last()
        .getByText("À jour"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(libelle)).toHaveValue(`Test dish ${marque}`);

    // ── Retirer, et retrouver l'état d'avant ──
    await retirer.click();
    await expect(retirer).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page
        .locator("div")
        .filter({ has: page.getByLabel(libelle) })
        .last()
        .getByText("Pas encore traduit"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(libelle)).toHaveValue("");
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
