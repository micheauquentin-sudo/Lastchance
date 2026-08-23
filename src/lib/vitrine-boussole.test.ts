// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  actionOuverte,
  hrefAction,
} from "@/lib/vitrine-action";
import {
  boussoleUtilisable,
  DIMENSIONS_BOUSSOLE,
  dimensionDeLaFacette,
  ficheCorrespond,
  fichesDeLaBoussole,
  QUESTIONS_BOUSSOLE,
} from "@/lib/vitrine-boussole";
import {
  VITRINE_ACTIONS,
  VITRINE_FACETTES,
  type FacetteVitrine,
  type PortesVitrineView,
  type VitrineFicheView,
} from "@/lib/vitrine";

/**
 * VIT-10 — la règle d'appariement, et la porte qui se ferme toute seule.
 *
 * DEUX PROPRIÉTÉS PORTENT TOUT LE LOT. Une fiche sans facette n'est jamais
 * proposée — sans quoi la Boussole rendrait la carte entière en prétendant
 * avoir choisi. Et une fiche NEUTRE sur une dimension y passe — sans quoi le
 * commerçant devrait cocher les onze cases sur chaque plat, ce que personne ne
 * fait, et la Boussole ne rendrait jamais rien.
 */

function fiche(
  facettes: FacetteVitrine[],
  extra: Partial<VitrineFicheView> = {},
): VitrineFicheView {
  return {
    id: `f-${facettes.join("-") || "vide"}`,
    nom: "Plat",
    description: null,
    prix_affiche: null,
    photo_path: null,
    photo_alt: null,
    facettes,
    action: null,
    badges: [],
    allergenes: [],
    disponible: true,
    ordre: 0,
    ...extra,
  };
}

describe("le vocabulaire et les questions restent d'accord", () => {
  it("chaque facette appartient à une dimension connue", () => {
    for (const facette of VITRINE_FACETTES) {
      expect(DIMENSIONS_BOUSSOLE).toContain(dimensionDeLaFacette(facette));
    }
  });

  it("chaque facette est proposée par exactement une question", () => {
    // La garde qui compte : une valeur ajoutée au vocabulaire et oubliée dans
    // les questions serait ENREGISTRABLE par le commerçant et INCHOISISSABLE
    // par le visiteur — un filtre qui exclut sur un critère invisible.
    const proposees = QUESTIONS_BOUSSOLE.flatMap((q) => q.choix);
    expect([...proposees].sort()).toEqual([...VITRINE_FACETTES].sort());
  });
});

describe("ficheCorrespond", () => {
  it("écarte une fiche sans aucune facette, même sans question posée", () => {
    expect(ficheCorrespond([], {})).toBe(false);
    expect(ficheCorrespond([], { occasion: "occasion_apero" })).toBe(false);
  });

  it("retient une fiche qui porte la valeur choisie", () => {
    expect(
      ficheCorrespond(["occasion_apero"], { occasion: "occasion_apero" }),
    ).toBe(true);
  });

  it("écarte une fiche qui porte une AUTRE valeur de la même dimension", () => {
    expect(
      ficheCorrespond(["occasion_repas"], { occasion: "occasion_apero" }),
    ).toBe(false);
  });

  it("retient une fiche NEUTRE sur la dimension interrogée", () => {
    // Elle est étiquetée ailleurs, donc elle existe pour la Boussole ; elle n'a
    // simplement pas d'avis sur l'occasion.
    expect(
      ficheCorrespond(["temps_rapide"], { occasion: "occasion_apero" }),
    ).toBe(true);
  });

  it("exige que TOUTES les dimensions répondues soient satisfaites", () => {
    const facettes: FacetteVitrine[] = ["occasion_apero", "temps_pose"];
    expect(
      ficheCorrespond(facettes, {
        occasion: "occasion_apero",
        temps: "temps_pose",
      }),
    ).toBe(true);
    expect(
      ficheCorrespond(facettes, {
        occasion: "occasion_apero",
        temps: "temps_rapide",
      }),
    ).toBe(false);
  });
});

describe("fichesDeLaBoussole", () => {
  it("garde l'ordre du catalogue — ce n'est pas un classement", () => {
    const a = fiche(["occasion_apero"], { id: "a", ordre: 0 });
    const b = fiche(["occasion_apero"], { id: "b", ordre: 1 });
    const retenues = fichesDeLaBoussole([a, b], {
      occasion: "occasion_apero",
    });
    expect(retenues.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("écarte les fiches indisponibles", () => {
    // Proposer ce que la cuisine n'a plus est le seul résultat pire qu'une
    // liste vide.
    const epuise = fiche(["occasion_apero"], {
      id: "epuise",
      disponible: false,
    });
    expect(
      fichesDeLaBoussole([epuise], { occasion: "occasion_apero" }),
    ).toHaveLength(0);
  });
});

describe("boussoleUtilisable", () => {
  it("reste fermée sur une carte dont rien n'est étiqueté", () => {
    expect(boussoleUtilisable([fiche([]), fiche([])])).toBe(false);
  });

  it("s'ouvre dès qu'une fiche disponible porte une facette", () => {
    expect(boussoleUtilisable([fiche([]), fiche(["envie_sucre"])])).toBe(true);
  });

  it("ignore une fiche étiquetée mais indisponible", () => {
    expect(
      boussoleUtilisable([fiche(["envie_sucre"], { disponible: false })]),
    ).toBe(false);
  });
});

describe("actionOuverte — la porte se ferme d'elle-même", () => {
  const vide: PortesVitrineView = {
    reserver: { activites: [], files: [], offres: [] },
    experiences: { quiz: [], duo: false },
  };

  it("refuse chaque module qui n'a rien d'ouvert", () => {
    for (const action of VITRINE_ACTIONS) {
      // `bande` est la seule exception, et elle est documentée : le Portrait de
      // la Bande n'a rien à configurer depuis que les salons sont au socle.
      expect(actionOuverte(action, vide, false)).toBe(action === "bande");
    }
  });

  it("ouvre Réserver dès une activité OU une file", () => {
    const avecActivite = {
      ...vide,
      reserver: { ...vide.reserver, activites: [{ id: "a", nom: "Table" }] },
    } as PortesVitrineView;
    expect(actionOuverte("reserver", avecActivite, false)).toBe(true);
    // Une offre à retirer n'est PAS une activité : les deux portes sont
    // distinctes même si elles mènent au même bloc.
    expect(actionOuverte("offre", avecActivite, false)).toBe(false);
  });

  it("suit l'état de la Boussole plutôt qu'un drapeau en base", () => {
    expect(actionOuverte("boussole", vide, true)).toBe(true);
    expect(actionOuverte("boussole", vide, false)).toBe(false);
  });
});

describe("hrefAction", () => {
  it("mène à un bloc de la MÊME page, jamais à une adresse profonde", () => {
    for (const action of VITRINE_ACTIONS) {
      expect(hrefAction(action)).toMatch(/^#vitrine-/);
    }
  });

  it("envoie les offres vers le bloc Réserver — c'est la même porte", () => {
    expect(hrefAction("offre")).toBe(hrefAction("reserver"));
  });
});
