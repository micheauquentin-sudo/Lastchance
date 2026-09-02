import { describe, expect, it } from "vitest";

import {
  VITRINE_ALLURE_BOOLEENS_DEFAUTS,
  VITRINE_ALLURE_BORNES,
  VITRINE_ALLURE_ENUMS,
  VITRINE_JEUX,
  VITRINE_PRESETS_SECTEUR,
  VITRINE_SECTEURS,
  asSecteurVitrine,
  mapThemeVitrine,
  type JeuVitrine,
} from "@/lib/vitrine";
import { resoudreThemeVitrine, variablesThemeVitrine } from "./theme";
import { textesVitrine, TEXTES_VITRINE } from "./langue";

/**
 * L'ALLURE ET LE SECTEUR (VIT-13) — ce que ce fichier garde.
 *
 * ── LE DÉFAUT EST LA MAQUETTE, ET C'EST LA PROMESSE DU LOT ──
 *
 * La demande était « que la vitrine ressemble EXACTEMENT à la carte de
 * référence ». La façon dont elle est tenue est que les vingt-cinq réglages ont
 * pour défaut les valeurs de cette carte : une vitrine à laquelle personne n'a
 * touché sort comme elle. Ces valeurs ne vivent nulle part ailleurs — aucun
 * écran ne les recopie — donc rien ne rougirait si elles dérivaient une par
 * une. C'est ce que ferme le premier bloc.
 *
 * ── ET LE SECTEUR NE DOIT JAMAIS TOUCHER À LA MISE EN PAGE ──
 *
 * C'est l'invariant qui garde le lot à UN écran au lieu de sept. Il est facile
 * à casser par inadvertance — il suffirait d'ajouter une clé d'allure à un
 * préréglage — et impossible à voir en relecture une fois les sept tables
 * écrites.
 */

describe("l'allure par défaut EST la maquette de référence", () => {
  // Les valeurs de `data-props` de la carte de référence, recopiées à la main.
  // Ce sont les seuls chiffres écrits en dur de ce fichier, et c'est le point :
  // ils viennent de la maquette, pas du code qu'ils gardent.
  const MAQUETTE = {
    motif: "diagonales",
    densite: "standard",
    style_fiche: "ombre",
    photo_taille: "standard",
    photo_position: "gauche",
    style_prix: "accent",
    style_onglets: "segmentes",
    style_chips: "pleines",
    style_rubrique: "carte",
    barre_basse: "flottante",
    carte_infos: "chevauche",
  } as const;

  const CHIFFRES_MAQUETTE = {
    motif_opacite: 0.4,
    rayon: 13,
    ombre: 0.6,
    echelle_texte: 1,
    hero_hauteur: 240,
    hero_taille_nom: 46,
    hero_voile: 0.4,
  } as const;

  it("les onze listes ont le défaut de la maquette", () => {
    for (const [cle, attendu] of Object.entries(MAQUETTE)) {
      expect(
        VITRINE_ALLURE_ENUMS[cle as keyof typeof MAQUETTE].defaut,
        `défaut de ${cle}`,
      ).toBe(attendu);
    }
  });

  it("les sept curseurs ont le défaut de la maquette", () => {
    for (const [cle, attendu] of Object.entries(CHIFFRES_MAQUETTE)) {
      expect(
        VITRINE_ALLURE_BORNES[cle as keyof typeof CHIFFRES_MAQUETTE].defaut,
        `défaut de ${cle}`,
      ).toBe(attendu);
    }
  });

  it("les sept interrupteurs sont allumés, comme la maquette", () => {
    // La maquette montre les compteurs, les capitales, le monogramme, la
    // recherche et l'en-tête collant. Un défaut à `false` rendrait une page
    // MOINS fournie que la référence, ce qui est l'inverse de la promesse.
    for (const [cle, valeur] of Object.entries(
      VITRINE_ALLURE_BOOLEENS_DEFAUTS,
    )) {
      expect(valeur, `défaut de ${cle}`).toBe(true);
    }
  });

  it("un thème vide rend exactement ces défauts", () => {
    const allure = resoudreThemeVitrine(null).allure;
    expect(allure.motif).toBe("diagonales");
    expect(allure.stylePrix).toBe("accent");
    expect(allure.rayon).toBe(13);
    expect(allure.heroHauteur).toBe(240);
    expect(allure.favoris).toBe(true);
  });

  it("un réglage du commerçant prime sur le défaut, les autres ne bougent pas", () => {
    const allure = resoudreThemeVitrine({
      allure: { style_prix: "pastille" },
    }).allure;
    expect(allure.stylePrix).toBe("pastille");
    // Les vingt-quatre autres restent la maquette : c'est ce qui rend le
    // stockage partiel sûr.
    expect(allure.motif).toBe("diagonales");
    expect(allure.rayon).toBe(13);
  });
});

describe("ce que la base ne devrait pas laisser passer est ÉCARTÉ, pas raboté", () => {
  it("une valeur hors bornes retombe sur le défaut plutôt que d'être ramenée", () => {
    // Ramener 900 à 420 rendrait une page qui a l'air réglée alors qu'elle ne
    // l'est pas, et le commerçant chercherait longtemps pourquoi son curseur ne
    // fait rien.
    const theme = mapThemeVitrine({ allure: { hero_hauteur: 900 } });
    expect(theme.allure).toBeUndefined();
    expect(resoudreThemeVitrine(theme).allure.heroHauteur).toBe(240);
  });

  it("un mot hors vocabulaire est écarté", () => {
    expect(mapThemeVitrine({ allure: { motif: "zebre" } }).allure).toBeUndefined();
  });

  it("un booléen posté en texte est écarté", () => {
    expect(mapThemeVitrine({ allure: { favoris: "oui" } }).allure).toBeUndefined();
  });

  it("une allure sans aucune clé reconnue vaut `undefined`, jamais `{}`", () => {
    // `{}` serait posé sur `theme.allure` et ferait croire à un réglage — même
    // contrat que `couleurs` et `ordre_blocs`.
    expect(mapThemeVitrine({ allure: {} }).allure).toBeUndefined();
    expect(mapThemeVitrine({ allure: [] }).allure).toBeUndefined();
    expect(mapThemeVitrine({ allure: null }).allure).toBeUndefined();
  });

  it("les bornes sont inclusives des deux côtés", () => {
    for (const [cle, b] of Object.entries(VITRINE_ALLURE_BORNES)) {
      expect(mapThemeVitrine({ allure: { [cle]: b.min } }).allure).toBeDefined();
      expect(mapThemeVitrine({ allure: { [cle]: b.max } }).allure).toBeDefined();
    }
  });
});

describe("le secteur choisit les MOTS et la palette, jamais la mise en page", () => {
  it("aucun préréglage ne porte de réglage d'allure", () => {
    // L'INVARIANT DU LOT : sept métiers, un seul écran. Ajouter une clé
    // d'allure à un préréglage donnerait sept mises en page à tenir d'accord,
    // et c'est le genre d'ajout qui paraît anodin en revue.
    for (const secteur of VITRINE_SECTEURS) {
      expect(
        Object.keys(VITRINE_PRESETS_SECTEUR[secteur]).sort(),
        `préréglage ${secteur}`,
      ).toEqual(["body", "heading", "primary", "secondary"]);
    }
  });

  it("l'allure résolue est la même pour les sept métiers", () => {
    const references = JSON.stringify(resoudreThemeVitrine(null, "commerce").allure);
    for (const secteur of VITRINE_SECTEURS) {
      expect(
        JSON.stringify(resoudreThemeVitrine(null, secteur).allure),
        `allure de ${secteur}`,
      ).toBe(references);
    }
  });

  it("le préréglage remplit un vide — la couleur du commerçant gagne toujours", () => {
    const impose = resoudreThemeVitrine(
      { couleurs: { primary: "#123456" } },
      "hotel",
    );
    expect(impose.primary).toBe("#123456");
    // La couleur NON renseignée, elle, suit bien le métier.
    expect(impose.secondary).toBe(VITRINE_PRESETS_SECTEUR.hotel.secondary);
  });

  it("le restaurant part sur la palette exacte de la maquette", () => {
    const theme = resoudreThemeVitrine(null, "restaurant");
    expect(theme.primary).toBe("#7D3C11");
    expect(theme.secondary).toBe("#FAF6EC");
  });

  it("un secteur inconnu ou absent retombe sur le neutre", () => {
    expect(asSecteurVitrine("boucher")).toBe("commerce");
    expect(asSecteurVitrine(null)).toBe("commerce");
    expect(asSecteurVitrine(undefined)).toBe("commerce");
  });
});

describe("le vocabulaire public suit le métier", () => {
  it("un coiffeur ne parle jamais de plats", () => {
    const t = textesVitrine("fr", "coiffeur");
    expect(t.nosCartes).toBe("Nos prestations");
    expect(t.aucunPlat).toContain("prestation");
    expect(t.aucunPlat).not.toContain("plat");
    expect(t.reserverActivites).toBe("Prendre rendez-vous");
  });

  it("un hôtel parle de chambres, un spa de soins", () => {
    expect(textesVitrine("fr", "hotel").nosCartes).toBe("Nos chambres");
    expect(textesVitrine("fr", "spa").nosCartes).toBe("Nos soins");
    expect(textesVitrine("en", "hotel").nosCartes).toBe("Our rooms");
  });

  it("le neutre ne ressemble pas à un restaurant par défaut", () => {
    // Une vitrine dont le commerçant n'a pas dit le métier ne doit pas annoncer
    // « Aucun plat » à un client de quincaillerie.
    const t = textesVitrine("fr");
    expect(t.nosCartes).toBe("Notre catalogue");
    expect(t.aucunPlat).toContain("article");
  });

  it("le chrome NEUTRE ne bouge pas d'un métier à l'autre", () => {
    // Ce qui ne nomme pas la marchandise reste identique partout : c'est ce qui
    // rend la fusion `Partial` sûre. Sept dictionnaires complets auraient laissé
    // « Nous suivre » diverger entre un bar et un spa au premier oubli.
    for (const secteur of VITRINE_SECTEURS) {
      const t = textesVitrine("fr", secteur);
      expect(t.liens).toBe(TEXTES_VITRINE.fr.liens);
      expect(t.allergenes).toBe(TEXTES_VITRINE.fr.allergenes);
      expect(t.histoire).toBe(TEXTES_VITRINE.fr.histoire);
      expect(t.indisponible).toBe(TEXTES_VITRINE.fr.indisponible);
    }
  });

  it("les deux langues sont servies pour les sept métiers", () => {
    // La garde de la garde : un métier oublié dans `MOTS_SECTEUR` lèverait ici
    // plutôt que de rendre `undefined` au milieu d'une page publique.
    for (const secteur of VITRINE_SECTEURS) {
      for (const lang of ["fr", "en"] as const) {
        const t = textesVitrine(lang, secteur);
        expect(t.nosCartes, `${secteur}/${lang}`).toBeTruthy();
        expect(t.recherchePlaceholder, `${secteur}/${lang}`).toBeTruthy();
      }
    }
  });
});

describe("les jeux sur la carte : l'absence vaut « affiché » (VIT-16, VIT-32)", () => {
  /** Le vocabulaire ENTIER à `true` : ce que l'absence doit rendre. */
  const tout = (patch: Partial<Record<JeuVitrine, boolean>> = {}) =>
    Object.fromEntries(
      VITRINE_JEUX.map((cle) => [cle, patch[cle] ?? true]),
    ) as Record<JeuVitrine, boolean>;

  it("un thème sans choix affiche TOUT ce que la base ouvre", () => {
    // C'EST TOUTE LA COMPATIBILITÉ DES DEUX LOTS. Une vitrine publiée avant
    // VIT-16 n'a pas de clé `jeux`, une publiée avant VIT-32 n'en a que deux :
    // faire valoir `false` à l'absence aurait retiré les salons de toutes les
    // pages en ligne au premier lot, et leurs quiz, calendriers, pronostics et
    // passeports au second — en silence. Le piège exact du vocabulaire de
    // secteur, et sa gravité a été multipliée par trois.
    expect(resoudreThemeVitrine(null).jeux).toEqual(tout());
    expect(resoudreThemeVitrine({}).jeux).toEqual(tout());
    // LE CAS QUI COMPTE VRAIMENT DEPUIS VIT-32 : un thème écrit par VIT-16, avec
    // ses deux seules clés. Les quatre nouvelles doivent y valoir « affiché ».
    expect(
      resoudreThemeVitrine({ jeux: { duo: true, bande: true } }).jeux,
    ).toEqual(tout());
  });

  it("un seul jeu décoché ne masque que celui-là", () => {
    expect(resoudreThemeVitrine({ jeux: { duo: false } }).jeux).toEqual(
      tout({ duo: false }),
    );
    // Et cela vaut pour les quatre mots que VIT-32 ajoute, pas seulement pour
    // les deux salons.
    expect(resoudreThemeVitrine({ jeux: { loyalty: false } }).jeux).toEqual(
      tout({ loyalty: false }),
    );
  });

  it("tout décoché se lit bien comme autant de refus", () => {
    const rien = Object.fromEntries(
      VITRINE_JEUX.map((cle) => [cle, false]),
    ) as Record<JeuVitrine, boolean>;
    expect(resoudreThemeVitrine({ jeux: rien }).jeux).toEqual(rien);
  });

  it("une clé inconnue ou non booléenne est écartée, et le défaut reprend", () => {
    expect(mapThemeVitrine({ jeux: { duo: "oui" } }).jeux).toBeUndefined();
    expect(mapThemeVitrine({ jeux: {} }).jeux).toBeUndefined();
    expect(mapThemeVitrine({ jeux: [] }).jeux).toBeUndefined();
  });
});

describe("les variables CSS traduisent l'allure en pixels", () => {
  /**
   * Les variables, en chaînes — SANS aucun cast.
   *
   * `variablesThemeVitrine` rend un `CSSProperties`, dont les propriétés
   * personnalisées `--vitrine-*` ne sont pas indexables au type. Le double cast
   * qu'on écrit d'instinct ici aurait ouvert la porte que garde
   * `scripts/check-unsafe-casts.mjs`, et pour rien : `Object.entries` donne
   * exactement la même chose, et `String()` normalise au passage un éventuel
   * nombre — ce qu'un cast aurait laissé passer en mentant sur le type.
   *
   * (Cette garde est TEXTUELLE : elle compte les occurrences dans le fichier,
   * commentaires compris. Citer la construction pour l'expliquer suffisait à
   * faire rougir la CI — d'où la périphrase.)
   */
  const vars = (theme = resoudreThemeVitrine(null)): Record<string, string> =>
    Object.fromEntries(
      Object.entries(variablesThemeVitrine(theme)).map(([cle, valeur]) => [
        cle,
        String(valeur),
      ]),
    );

  it("le composant n'a aucune multiplication à refaire", () => {
    const v = vars();
    expect(v["--vitrine-rad"]).toBe("13px");
    expect(v["--vitrine-pad"]).toBe("14px");
    expect(v["--vitrine-hero-h"]).toBe("240px");
    expect(v["--vitrine-photo-l"]).toBe("130px");
    expect(v["--vitrine-photo-h"]).toBe("92px");
  });

  it("le rayon intérieur d'une photo n'est JAMAIS négatif", () => {
    // Un `border-radius` négatif fait ignorer la propriété ENTIÈRE par le
    // navigateur : la photo redeviendrait carrée dans une carte arrondie, et
    // seulement pour les petits rayons.
    const v = vars(resoudreThemeVitrine({ allure: { rayon: 2 } }));
    expect(v["--vitrine-rad-photo"]).toBe("0px");
  });

  it("« sans photo » ne réserve pas de cadre vide", () => {
    // La taille retombe sur `standard` mais le composant ne rend rien : ces
    // variables ne sont lues par personne. Ce qui compte est qu'elles restent
    // des longueurs valides plutôt que `NaNpx`, qui casserait la règle voisine.
    const v = vars(resoudreThemeVitrine({ allure: { photo_taille: "aucune" } }));
    expect(v["--vitrine-photo-l"]).toBe("130px");
    expect(v["--vitrine-photo-h"]).toBe("92px");
  });

  it("la position de la photo pilote le sens de la carte", () => {
    const gauche = vars(resoudreThemeVitrine({ allure: { photo_position: "gauche" } }));
    const droite = vars(resoudreThemeVitrine({ allure: { photo_position: "droite" } }));
    const pleine = vars(resoudreThemeVitrine({ allure: { photo_position: "pleine" } }));
    // Le TEXTE est le premier enfant dans le DOM : « photo à gauche » est donc
    // un `row-reverse`, et la lecture au clavier reste celle du texte d'abord.
    expect(gauche["--vitrine-carte-flex"]).toBe("row-reverse");
    expect(droite["--vitrine-carte-flex"]).toBe("row");
    expect(pleine["--vitrine-carte-flex"]).toBe("column-reverse");
    expect(pleine["--vitrine-photo-l"]).toBe("100%");
  });

  it("le motif « aucun » ne pose pas d'image de fond", () => {
    expect(vars(resoudreThemeVitrine({ allure: { motif: "aucun" } }))["--vitrine-motif"]).toBe(
      "none",
    );
    expect(vars()["--vitrine-motif"]).toContain("repeating-linear-gradient");
  });

  it("le style de fiche choisit fond, bord et ombre — jamais les trois à la fois", () => {
    const ombre = vars(resoudreThemeVitrine({ allure: { style_fiche: "ombre" } }));
    expect(ombre["--vitrine-carte-bord"]).toBe("0px");
    expect(ombre["--vitrine-carte-ombre"]).not.toBe("none");

    const contour = vars(resoudreThemeVitrine({ allure: { style_fiche: "contour" } }));
    expect(contour["--vitrine-carte-bord"]).toBe("1px");
    expect(contour["--vitrine-carte-ombre"]).toBe("none");

    const plein = vars(resoudreThemeVitrine({ allure: { style_fiche: "plein" } }));
    expect(plein["--vitrine-carte-fond"]).toContain("rgba");
    expect(plein["--vitrine-carte-ombre"]).toBe("none");
  });

  it("l'en-tête collant s'éteint en `static`, il ne disparaît pas", () => {
    expect(vars()["--vitrine-collant"]).toBe("sticky");
    expect(
      vars(resoudreThemeVitrine({ allure: { entete_collant: false } }))["--vitrine-collant"],
    ).toBe("static");
  });

  it("la carte d'infos remonte le bas du hero quand elle le chevauche", () => {
    // Sans cette remontée, le nom du commerce et la carte se superposent.
    const chevauche = vars(resoudreThemeVitrine({ allure: { carte_infos: "chevauche" } }));
    expect(chevauche["--vitrine-infos-mt"]).toBe("-38px");
    expect(chevauche["--vitrine-hero-bas"]).toBe("52px");

    const dessous = vars(resoudreThemeVitrine({ allure: { carte_infos: "dessous" } }));
    expect(dessous["--vitrine-infos-mt"]).toBe("12px");
    expect(dessous["--vitrine-hero-bas"]).toBe("22px");
  });
});
