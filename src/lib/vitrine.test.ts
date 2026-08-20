import { describe, expect, it } from "vitest";

import {
  cheminVitrine,
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
  it("la Vitrine publique est FERMÉE tant que L11 n'a pas livré l'anglais", () => {
    // ÉPINGLÉ, et volontairement pénible à changer : ce test est la trace écrite
    // d'une décision produit. Le passer au vert après une ouverture demande de
    // le modifier — c'est-à-dire d'écrire, dans un commit, qu'on a bien voulu
    // ouvrir. C'est exactement ce qu'un drapeau d'environnement ne sait pas
    // faire.
    expect(VITRINE_PUBLIQUE_OUVERTE).toBe(false);
  });
});

describe("les libellés — un slug inconnu se rend lui-même", () => {
  it("badges et allergènes ont leur libellé français", () => {
    expect(libelleBadge("vegan")).toBe("🌱 Vegan");
    expect(libelleAllergene("fruits_a_coque")).toBe("Fruits à coque");
    expect(libelleBloc("histoire")).toBe("Notre histoire");
    expect(libelleStyleCartes("magazine")).toBe("Magazine");
  });

  it("une valeur retirée du vocabulaire rend son slug, jamais du vide", () => {
    // Une case vide sur une fiche est un défaut que personne ne sait expliquer ;
    // le slug, lui, se cherche.
    expect(libelleBadge("licorne")).toBe("licorne");
    expect(libelleAllergene("licorne")).toBe("licorne");
    expect(libelleBloc("licorne")).toBe("licorne");
    expect(libelleStyleCartes("licorne")).toBe("licorne");
  });
});

describe("les chemins et le slug", () => {
  it("l'adresse publique est courte, parce qu'elle est imprimée", () => {
    expect(cheminVitrine("le-comptoir")).toBe("/v/le-comptoir");
    expect(urlVitrine("le-comptoir", "https://app.test/")).toBe(
      "https://app.test/v/le-comptoir",
    );
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
