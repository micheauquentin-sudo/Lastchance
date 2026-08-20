import { describe, expect, it } from "vitest";

import {
  cheminsPublicsVitrine,
  cheminVitrine,
  cheminVitrineLangue,
  estSlugVitrineReserve,
  formeSlugVitrineValide,
  libelleAllergene,
  libelleBadge,
  libelleBloc,
  libelleStyleCartes,
  mapSetVitrineSlug,
  mapThemeVitrine,
  mapVitrineCartes,
  mapVitrineDashboardState,
  mapVitrinePublicState,
  normaliserSlugVitrine,
  selecteurLanguesOuvert,
  SEUIL_COUVERTURE_SELECTEUR,
  urlVitrine,
  VITRINE_PUBLIQUE_OUVERTE,
} from "./vitrine";

/**
 * Ce que ces tests couvrent, et ce qu'ils ne couvrent PAS.
 *
 * Ils couvrent la LECTURE DÉFENSIVE des trois documents jsonb : un document
 * corrompu, tronqué ou écrit par une version antérieure ne doit jamais produire
 * un écran qui ment. Ils ne couvrent NI les vocabulaires (c'est
 * `vitrine-parity.test.ts`, qui lit la migration), NI les refus de la base (ce
 * sont les `check` et pgTAP).
 */

describe("le drapeau serveur", () => {
  it("la Vitrine publique est OUVERTE depuis L11", () => {
    // ÉPINGLÉ, et volontairement pénible à changer dans LES DEUX SENS : ce test
    // est la trace écrite d'une décision produit. L'ouverture a demandé de le
    // modifier — c'est-à-dire d'écrire, dans un commit, qu'on a bien voulu
    // ouvrir — et une fermeture d'urgence le demandera aussi. C'est exactement
    // ce qu'un drapeau d'environnement ne sait pas faire.
    expect(VITRINE_PUBLIQUE_OUVERTE).toBe(true);
  });
});

describe("les libellés — un slug inconnu se rend lui-même", () => {
  it("badges et allergènes ont leur libellé français", () => {
    expect(libelleBadge("vegan")).toBe("🌱 Vegan");
    expect(libelleAllergene("fruits_a_coque")).toBe("Fruits à coque");
    expect(libelleBloc("histoire")).toBe("Notre histoire");
    expect(libelleStyleCartes("magazine")).toBe("Magazine");
  });

  it("le français est le DÉFAUT du paramètre de langue", () => {
    // Les appelants d'avant L11 n'ont pas été touchés : `libelleBadge(x)` rend
    // toujours du français.
    expect(libelleBadge("fait_maison")).toBe(libelleBadge("fait_maison", "fr"));
    expect(libelleAllergene("sulfites")).toBe(
      libelleAllergene("sulfites", "fr"),
    );
  });

  it("l'anglais rend le vocabulaire de plateforme, émoji INCHANGÉ", () => {
    // Un pictogramme n'a pas de langue : le garder identique fait que le badge
    // occupe la même place et se reconnaît du même coup d'œil.
    expect(libelleBadge("fait_maison", "en")).toBe("🏠 Homemade");
    expect(libelleBadge("epice", "en")).toBe("🌶️ Spicy");
    // Les termes de l'annexe II elle-même, pas des traductions libres.
    expect(libelleAllergene("fruits_a_coque", "en")).toBe("Nuts");
    expect(libelleAllergene("crustaces", "en")).toBe("Crustaceans");
  });

  it("une valeur retirée du vocabulaire rend son slug, jamais du vide", () => {
    // Une case vide sur une fiche est un défaut que personne ne sait expliquer ;
    // le slug, lui, se cherche. Vrai DANS LES DEUX LANGUES : l'anglais n'a pas
    // de repli vers le français, qui aurait affiché un mot français sur une page
    // anglaise sans que personne sache d'où il vient.
    expect(libelleBadge("licorne")).toBe("licorne");
    expect(libelleBadge("licorne", "en")).toBe("licorne");
    expect(libelleAllergene("licorne")).toBe("licorne");
    expect(libelleAllergene("licorne", "en")).toBe("licorne");
    expect(libelleBloc("licorne")).toBe("licorne");
    expect(libelleStyleCartes("licorne")).toBe("licorne");
  });
});

describe("le seuil du sélecteur de langue — la décision est ICI, pas en SQL", () => {
  it("95 % : la base compte, l'application tranche", () => {
    // Épinglé : la migration 20261012120000 rend `total_champs_traduisibles` et
    // `traduits_frais` et s'arrête là. Ce chiffre est l'arbitrage produit, et il
    // se règle sans migration.
    expect(SEUIL_COUVERTURE_SELECTEUR).toBe(0.95);
  });

  it("s'ouvre AU seuil, se ferme juste en dessous", () => {
    // 19/20 = 95 % pile : le sélecteur s'offre.
    expect(selecteurLanguesOuvert({ total: 20, frais: 19 })).toBe(true);
    // 18/20 = 90 % : il ne s'offre pas.
    expect(selecteurLanguesOuvert({ total: 20, frais: 18 })).toBe(false);
    expect(selecteurLanguesOuvert({ total: 100, frais: 95 })).toBe(true);
    expect(selecteurLanguesOuvert({ total: 100, frais: 94 })).toBe(false);
  });

  it("rien à traduire n'est PAS une couverture parfaite", () => {
    // 0/0 ferait 100 % par convention arithmétique. Proposer « English » sur une
    // page qui rendrait exactement les mêmes mots est une promesse creuse.
    expect(selecteurLanguesOuvert({ total: 0, frais: 0 })).toBe(false);
  });
});

describe("les chemins et le slug", () => {
  it("l'adresse publique est courte, parce qu'elle est imprimée", () => {
    expect(cheminVitrine("le-comptoir")).toBe("/v/le-comptoir");
    expect(urlVitrine("le-comptoir", "https://app.test/")).toBe(
      "https://app.test/v/le-comptoir",
    );
  });

  it("le français n'a PAS de segment de langue, l'anglais en a un", () => {
    // L'adresse est IMPRIMÉE : `/fr` l'aurait allongée et aurait créé deux URL
    // pour la même page française.
    expect(cheminVitrineLangue("le-comptoir", "fr")).toBe("/v/le-comptoir");
    expect(cheminVitrineLangue("le-comptoir", "en")).toBe("/v/le-comptoir/en");
  });

  it("les chemins publics à purger couvrent TOUTES les langues", () => {
    // Dérivés de `VITRINE_LANGUES` : une troisième langue serait sinon servie
    // par un cache que plus personne ne purge.
    expect(cheminsPublicsVitrine("le-comptoir")).toEqual([
      "/v/le-comptoir",
      "/v/le-comptoir/en",
    ]);
  });

  it("normalise comme le SQL : minuscules et détourage, RIEN D'AUTRE", () => {
    expect(normaliserSlugVitrine("  Le-Comptoir ")).toBe("le-comptoir");
    // Les espaces INTERNES ne sont pas transformés en silence : ils restent hors
    // forme, et sont refusés — même arbitrage qu'en SQL.
    expect(formeSlugVitrineValide(normaliserSlugVitrine("le comptoir"))).toBe(
      false,
    );
    expect(formeSlugVitrineValide(normaliserSlugVitrine("café"))).toBe(false);
  });

  it("reconnaît le vocabulaire réservé, majuscules comprises", () => {
    expect(estSlugVitrineReserve("Dashboard")).toBe(true);
    expect(estSlugVitrineReserve("  api  ")).toBe(true);
    expect(estSlugVitrineReserve("le-comptoir")).toBe(false);
  });

  it("borne la forme aux deux extrémités", () => {
    expect(formeSlugVitrineValide("ab")).toBe(false);
    expect(formeSlugVitrineValide("abc")).toBe(true);
    expect(formeSlugVitrineValide("a".repeat(60))).toBe(true);
    expect(formeSlugVitrineValide("a".repeat(61))).toBe(false);
  });
});

describe("mapThemeVitrine — fermé aux deux rangs, comme le validateur SQL", () => {
  it("lit un thème complet, sans renommer aucune clé", () => {
    expect(
      mapThemeVitrine({
        couleurs: { primary: "#AABBCC", secondary: "#001122" },
        polices: { heading: "elegant", body: "mono" },
        style_cartes: "magazine",
        ordre_blocs: ["cartes", "accroche"],
      }),
    ).toEqual({
      couleurs: { primary: "#AABBCC", secondary: "#001122" },
      polices: { heading: "elegant", body: "mono" },
      style_cartes: "magazine",
      ordre_blocs: ["cartes", "accroche"],
    });
  });

  it("OMET ce qu'il ne reconnaît pas plutôt que de le rendre tel quel", () => {
    // Le thème part dans des variables CSS : c'est le seul endroit de la vitrine
    // où laisser passer une valeur jamais vérifiée compte vraiment. La forme
    // courte `#abc` est refusée comme en SQL, et la clé `cta` — le passager
    // clandestin de la leçon L8 — ne ressort pas.
    expect(
      mapThemeVitrine({
        couleurs: { primary: "#abc", secondary: "rgb(1,2,3)" },
        polices: { heading: "comic", body: 12 },
        style_cartes: "carrousel",
        ordre_blocs: ["accroche", "menu-secret", "accroche"],
        cta: "https://exemple.test",
      }),
    ).toEqual({ ordre_blocs: ["accroche"] });
  });

  it("`ordre_blocs` absent n'est PAS posé — l'écran retombe sur l'ordre naturel", () => {
    expect(mapThemeVitrine({ style_cartes: "liste" })).toEqual({
      style_cartes: "liste",
    });
  });

  it("un thème absent ou illisible vaut le thème vide", () => {
    expect(mapThemeVitrine(null)).toEqual({});
    expect(mapThemeVitrine("magazine")).toEqual({});
    expect(mapThemeVitrine([])).toEqual({});
  });
});

describe("mapVitrineCartes — l'arbre, et ce qu'on refuse d'inventer", () => {
  const arbre = [
    {
      id: "c1",
      nom: "Midi",
      ordre: 0,
      active: true,
      categories: [
        {
          id: "r1",
          nom: "Entrées",
          ordre: 0,
          fiches: [
            {
              id: "f1",
              nom: "Soupe",
              description: null,
              prix_affiche: "à partir de 8 €",
              photo_path: null,
              badges: ["vegan", "vegan", "inconnu"],
              allergenes: ["gluten"],
              disponible: false,
              ordre: 2,
            },
            { id: "f2", nom: "Sans drapeau" },
          ],
        },
        { nom: "Rubrique sans id", ordre: 1, fiches: [] },
      ],
    },
    { id: "c2", ordre: 1, active: false, categories: [] },
  ];

  it("garde le nom `categories` de la base et lit les vocabulaires", () => {
    const cartes = mapVitrineCartes(arbre);
    expect(cartes).toHaveLength(1); // `c2` n'a pas de nom : elle est écartée.
    expect(cartes[0].categories).toHaveLength(1); // celle sans id est écartée.
    const fiches = cartes[0].categories[0].fiches;
    expect(fiches[0].badges).toEqual(["vegan"]); // doublon et intrus retirés
    expect(fiches[0].allergenes).toEqual(["gluten"]);
    expect(fiches[0].prix_affiche).toBe("à partir de 8 €");
  });

  it("le repli de `disponible` est FERMÉ", () => {
    // Un drapeau illisible affiche « indisponible » plutôt que de promettre un
    // plat que la cuisine n'a plus.
    const fiches = mapVitrineCartes(arbre)[0].categories[0].fiches;
    expect(fiches[0].disponible).toBe(false);
    expect(fiches[1].disponible).toBe(false);
  });

  it("un arbre absent vaut une liste vide, jamais une exception", () => {
    expect(mapVitrineCartes(null)).toEqual([]);
    expect(mapVitrineCartes({ cartes: [] })).toEqual([]);
  });
});

describe("mapVitrinePublicState — tout ce qui n'est pas « ok » est muet", () => {
  it("lit un état complet", () => {
    const etat = mapVitrinePublicState({
      state: "ok",
      slug: "le-comptoir",
      identite: {
        nom: "Le Comptoir",
        logo_url: "https://cdn.test/logo.png",
        accroche: "Bistrot de quartier",
        histoire: null,
        horaires_texte: "12h-14h",
        cover_path: null,
        theme: { style_cartes: "grille" },
      },
      liens: {
        google_review_url: "",
        instagram_url: null,
        tiktok_url: "https://tt",
      },
      cartes: [],
    });
    expect(etat.state).toBe("ok");
    if (etat.state !== "ok") return;
    expect(etat.identite.nom).toBe("Le Comptoir");
    expect(etat.identite.theme.style_cartes).toBe("grille");
    // `''` est RENDU TEL QUEL : c'est l'écran qui décide de ne rien afficher.
    expect(etat.liens.google_review_url).toBe("");
    expect(etat.liens.instagram_url).toBeNull();
  });

  it("lit la langue SERVIE, la couverture et le verdict du seuil", () => {
    const etat = mapVitrinePublicState({
      state: "ok",
      slug: "le-comptoir",
      lang: "en",
      lang_coverage: {
        lang: "en",
        total_champs_traduisibles: 20,
        traduits_frais: 19,
      },
      identite: {},
      liens: {},
      cartes: [],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    expect(etat.lang).toBe("en");
    // Les clés de la base (`total_champs_traduisibles`) deviennent celles de
    // l'application, et la clé `lang` du document est ignorée : il n'y a qu'une
    // langue traduisible.
    expect(etat.langCoverage).toEqual({ total: 20, frais: 19 });
    // 95 % pile : le sélecteur s'offre, et il est tranché ICI plutôt qu'à
    // l'écran — deux écrans auraient sinon deux réponses.
    expect(etat.selecteurLangues).toBe(true);
  });

  it("juste sous le seuil, le sélecteur ne s'offre pas", () => {
    const etat = mapVitrinePublicState({
      state: "ok",
      slug: "le-comptoir",
      lang: "fr",
      lang_coverage: { total_champs_traduisibles: 20, traduits_frais: 18 },
      identite: {},
      liens: {},
      cartes: [],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    // LE COMPTE EST RENDU SUR LA PAGE FRANÇAISE AUSSI : c'est là que l'écran
    // décide d'offrir l'anglais.
    expect(etat.lang).toBe("fr");
    expect(etat.selecteurLangues).toBe(false);
  });

  it("une langue inconnue ou absente vaut le FRANÇAIS, jamais elle-même", () => {
    const lire = (lang: unknown) =>
      mapVitrinePublicState({
        state: "ok",
        slug: "x-y-z",
        lang,
        identite: {},
        liens: {},
        cartes: [],
      });
    for (const lang of ["de", "EN", "", 42, null, undefined]) {
      const etat = lire(lang);
      if (etat.state !== "ok") throw new Error("état inattendu");
      // Repli FERMÉ, comme la RPC : un document d'avant L11 rend une page
      // française cohérente plutôt qu'un attribut de langue inventé.
      expect(etat.lang).toBe("fr");
    }
  });

  it("une couverture illisible ou incohérente n'ouvre JAMAIS le sélecteur", () => {
    const lire = (lang_coverage: unknown) =>
      mapVitrinePublicState({
        state: "ok",
        slug: "x-y-z",
        lang_coverage,
        identite: {},
        liens: {},
        cartes: [],
      });

    // Absente, illisible : zéro, donc fermé.
    for (const brut of [undefined, null, "beaucoup", []]) {
      const etat = lire(brut);
      if (etat.state !== "ok") throw new Error("état inattendu");
      expect(etat.langCoverage).toEqual({ total: 0, frais: 0 });
      expect(etat.selecteurLangues).toBe(false);
    }

    // `frais > total` est IMPOSSIBLE côté SQL (le `left join` part des champs
    // traduisibles) : ce cas est celui du document bricolé, et il ne doit pas
    // allumer le sélecteur sur une vitrine non traduite.
    const forge = lire({ total_champs_traduisibles: 2, traduits_frais: 99 });
    if (forge.state !== "ok") throw new Error("état inattendu");
    expect(forge.langCoverage).toEqual({ total: 2, frais: 2 });

    // Un total négatif ne descend pas sous zéro.
    const negatif = lire({
      total_champs_traduisibles: -5,
      traduits_frais: -5,
    });
    if (negatif.state !== "ok") throw new Error("état inattendu");
    expect(negatif.langCoverage).toEqual({ total: 0, frais: 0 });
    expect(negatif.selecteurLangues).toBe(false);
  });

  it("un nom illisible ne rend jamais un titre vide", () => {
    const etat = mapVitrinePublicState({
      state: "ok",
      slug: "x-y-z",
      identite: {},
      liens: {},
      cartes: [],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    expect(etat.identite.nom).toBe("Ce commerce");
  });

  it("un état sans slug est corrompu, donc indisponible", () => {
    expect(mapVitrinePublicState({ state: "ok" }).state).toBe("unavailable");
  });

  it("un refus, une absence ou un document illisible donnent le même mot", () => {
    expect(mapVitrinePublicState({ state: "unavailable" }).state).toBe(
      "unavailable",
    );
    expect(mapVitrinePublicState(null).state).toBe("unavailable");
    expect(mapVitrinePublicState("nope").state).toBe("unavailable");
  });
});

describe("mapVitrineDashboardState", () => {
  it("`settings` vaut null tant qu'aucune adresse n'a été choisie", () => {
    const etat = mapVitrineDashboardState({
      state: "ok",
      module_access: true,
      settings: null,
      cartes: [],
    });
    expect(etat.state).toBe("ok");
    if (etat.state !== "ok") return;
    expect(etat.settings).toBeNull();
    expect(etat.module_access).toBe(true);
  });

  it("une ligne de réglages sans identité est rendue comme « pas d'adresse »", () => {
    // Un formulaire prérempli de vide laisserait croire qu'il suffit
    // d'enregistrer ; « aucune adresse » est un premier pas que l'écran sait
    // proposer.
    const etat = mapVitrineDashboardState({
      state: "ok",
      module_access: true,
      settings: { published: true, accroche: "x" },
      cartes: [],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    expect(etat.settings).toBeNull();
  });

  it("`module_access` illisible vaut FAUX — le repli fermé", () => {
    const etat = mapVitrineDashboardState({
      state: "ok",
      settings: null,
      cartes: [],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    expect(etat.module_access).toBe(false);
  });

  it("lit une ligne complète, cartes INACTIVES comprises", () => {
    const etat = mapVitrineDashboardState({
      state: "ok",
      module_access: false,
      settings: {
        id: "s1",
        slug: "le-comptoir",
        published: true,
        accroche: null,
        histoire: null,
        horaires_texte: null,
        theme: {},
        cover_path: null,
        updated_at: "2026-08-20T10:00:00Z",
      },
      cartes: [
        { id: "c1", nom: "Midi", ordre: 0, active: false, categories: [] },
      ],
    });
    if (etat.state !== "ok") throw new Error("état inattendu");
    expect(etat.settings?.slug).toBe("le-comptoir");
    expect(etat.settings?.published).toBe(true);
    // L'ÉDITEUR VOIT TOUT : la RPC de dashboard ne filtre pas sur `active`.
    expect(etat.cartes[0].active).toBe(false);
  });
});

describe("mapSetVitrineSlug — quatre refus du contrat, un cinquième pour nous", () => {
  it("relaie les trois refus distincts", () => {
    expect(mapSetVitrineSlug({ state: "invalid_slug" }).state).toBe(
      "invalid_slug",
    );
    expect(mapSetVitrineSlug({ state: "reserved_slug" }).state).toBe(
      "reserved_slug",
    );
    expect(mapSetVitrineSlug({ state: "slug_taken" }).state).toBe("slug_taken");
  });

  it("lit un succès avec ses deux drapeaux", () => {
    expect(
      mapSetVitrineSlug({
        state: "ok",
        slug: "le-comptoir",
        created: true,
        changed: true,
      }),
    ).toEqual({
      state: "ok",
      slug: "le-comptoir",
      created: true,
      changed: true,
    });
  });

  it("un document illisible vaut `error`, JAMAIS `invalid_slug`", () => {
    // Le repli qui ment le moins : `invalid_slug` aurait envoyé le commerçant
    // corriger une adresse correcte.
    expect(mapSetVitrineSlug(null).state).toBe("error");
    expect(mapSetVitrineSlug({ state: "ok" }).state).toBe("error");
    expect(mapSetVitrineSlug({ state: "autre_chose" }).state).toBe("error");
  });
});
