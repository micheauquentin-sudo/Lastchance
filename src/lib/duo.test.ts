import { describe, expect, it } from "vitest";

import {
  mapDuoChoix,
  mapDuoChoose,
  mapDuoOptions,
  mapDuoOptionsAdmin,
  mapDuoOptionsSaved,
  mapDuoStart,
  mapDuoState,
  mapDuoSuggestion,
  mapDuoSuggestionSaved,
} from "@/lib/duo";

/**
 * LES MAPPEURS DE DUO MIROIR (L17).
 *
 * Ce qu'ils protègent n'est pas le cas nominal — PostgREST rend ce que la RPC a
 * construit, et pgTAP prouve déjà cette construction. Ce qu'ils protègent, c'est
 * le jour où la forme du document CHANGE sans que ce fichier le sache.
 *
 * Et UNE PROPRIÉTÉ DE SÉCURITÉ, qui n'est pas de la robustesse : sur une manche
 * OUVERTE, le choix de l'autre ne peut pas atteindre l'écran. La vraie garde est
 * en SQL (`duo_state` ne le calcule que dans la branche `revelee`) ; celle-ci la
 * redouble, pour que l'écran ne dépende que d'une promesse vérifiable ici.
 */

const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ROUND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function option(item_id: string, nom: string, ordre: number) {
  return {
    item_id,
    nom,
    description: "Servi tiède",
    prix_affiche: "8 €",
    photo_path: null,
    ordre,
  };
}

describe("mapDuoOptions — le plateau", () => {
  it("lit une fiche complète, aux noms de la base", () => {
    // `prix_affiche` et `photo_path` gardent le nom de la colonne, motif
    // `VitrineFicheView` : le composant de fiche les consomme déjà tels quels.
    expect(mapDuoOptions([option(ITEM_A, "Tarte", 1)])).toEqual([
      {
        item_id: ITEM_A,
        nom: "Tarte",
        description: "Servi tiède",
        prix_affiche: "8 €",
        photo_path: null,
        ordre: 1,
      },
    ]);
  });

  it("RE-TRIE par ordre, même si le SQL rend les fiches mélangées", () => {
    // L'ordre est ce que les DEUX joueurs ont sous les yeux au même instant :
    // un `order by` perdu ferait sauter les cartes entre deux sondages, donc
    // cliquer sur une fiche qui n'était plus là quand on a visé.
    const vue = mapDuoOptions([
      option(ITEM_B, "Café", 2),
      option(ITEM_A, "Tarte", 1),
    ]);
    expect(vue.map((o) => o.nom)).toEqual(["Tarte", "Café"]);
  });

  it.each([
    ["document nul", null],
    ["objet au lieu d'un tableau", { item_id: ITEM_A }],
    ["chaîne", "surprise"],
  ])("%s → tableau vide, jamais une exception", (_cas, brut) => {
    expect(mapDuoOptions(brut)).toEqual([]);
  });

  it("saute la fiche sans identifiant ou sans nom, et garde les autres", () => {
    // Une fiche amputée ne produit ni bouton à cliquer ni choix à envoyer : la
    // sauter est plus honnête que peindre une carte dont la moitié dit
    // `undefined` — et l'écran ne doit pas tomber pour autant.
    const vue = mapDuoOptions([
      { nom: "Sans identifiant", ordre: 1 },
      { item_id: ITEM_A, ordre: 2 },
      option(ITEM_B, "Café", 3),
    ]);
    expect(vue).toHaveLength(1);
    expect(vue[0].item_id).toBe(ITEM_B);
  });
});

describe("mapDuoChoix / mapDuoSuggestion", () => {
  it("un choix se lit sur son identifiant ET son nom", () => {
    expect(mapDuoChoix({ item_id: ITEM_A, nom: "Tarte" })).toEqual({
      item_id: ITEM_A,
      nom: "Tarte",
    });
  });

  it.each([
    ["nul", null],
    ["sans nom", { item_id: ITEM_A }],
    ["sans identifiant", { nom: "Tarte" }],
  ])("choix %s → null", (_cas, brut) => {
    expect(mapDuoChoix(brut)).toBeNull();
  });

  it("la suggestion porte quatre clés, sans photo ni ordre", () => {
    // Ce que ce type n'a pas est aussi important que ce qu'il a : `duo_state`
    // ne rend ni `photo_path` ni `ordre` pour la proposition de la maison.
    expect(
      mapDuoSuggestion({
        item_id: ITEM_B,
        nom: "Café",
        description: null,
        prix_affiche: "2 €",
        photo_path: "/tricheur.jpg",
      }),
    ).toEqual({
      item_id: ITEM_B,
      nom: "Café",
      description: null,
      prix_affiche: "2 €",
    });
  });
});

describe("mapDuoStart — ouvrir le plateau", () => {
  const nominal = {
    state: "ok",
    round_id: ROUND_ID,
    options: [option(ITEM_A, "Tarte", 1), option(ITEM_B, "Café", 2)],
  };

  it("lit une ouverture complète", () => {
    const vue = mapDuoStart(nominal);
    expect(vue).toMatchObject({ state: "ok", roundId: ROUND_ID });
    expect(vue.state === "ok" && vue.options).toHaveLength(2);
  });

  it("`non_configure` reste DISTINCT d'`unavailable`", () => {
    // Les confondre enverrait les joueurs chercher une panne là où il n'y a
    // qu'une case à cocher, et chez quelqu'un d'autre : le commerçant.
    expect(mapDuoStart({ state: "non_configure" })).toEqual({
      state: "non_configure",
    });
  });

  it("un « ok » SOUS DEUX options est rendu `non_configure`", () => {
    // `duo_start` ne compte les fiches qu'à la CRÉATION : une manche déjà
    // ouverte est rendue telle quelle. Une cascade de suppression de fiche peut
    // donc produire un `ok` avec un plateau injouable — et l'écran peindrait un
    // jeu à un seul bouton. La MÊME règle, appliquée au second endroit où elle
    // s'observe, nomme exactement ce qui s'est produit.
    expect(
      mapDuoStart({ ...nominal, options: [option(ITEM_A, "Tarte", 1)] }),
    ).toEqual({ state: "non_configure" });
    expect(mapDuoStart({ ...nominal, options: [] })).toEqual({
      state: "non_configure",
    });
  });

  it.each([
    ["document nul", null],
    ["tableau", []],
    ["état inconnu", { state: "surprise" }],
    ["ok sans round_id", { state: "ok", options: nominal.options }],
  ])("%s → indisponible", (_cas, brut) => {
    expect(mapDuoStart(brut)).toEqual({ state: "unavailable" });
  });
});

describe("mapDuoChoose — sceller", () => {
  it("lit un sceau posé, avec la révélation qu'il a déclenchée", () => {
    expect(mapDuoChoose({ state: "ok", scelle: true, revelee: true })).toEqual({
      state: "ok",
      scelle: true,
      revelee: true,
    });
  });

  it("`scelle` (le REFUS) est un résultat traité, pas une panne", () => {
    // Piège du contrat SQL : le mot désigne deux choses opposées. L'état
    // `{"state":"scelle"}` dit « vous aviez déjà scellé un AUTRE item, rien n'a
    // été écrit » — c'est le refus, et il doit rester distinct d'`unavailable`
    // parce qu'il appelle un geste différent : regarder son propre choix, plutôt
    // que constater que la partie n'existe plus.
    expect(mapDuoChoose({ state: "scelle" })).toEqual({ state: "scelle" });
  });

  it.each([
    ["document nul", null],
    ["état inconnu", { state: "surprise" }],
    ["ok sans revelee", { state: "ok", scelle: true }],
    ["revelee textuel", { state: "ok", scelle: true, revelee: "true" }],
    ["ok avec scelle faux", { state: "ok", scelle: false, revelee: false }],
  ])("%s → indisponible", (_cas, brut) => {
    // `revelee` est le CONTENU de la réponse : c'est lui qui décide si l'écran
    // bascule sur le résultat. Le deviner à `false` ferait attendre un joueur
    // devant une manche déjà révélée.
    expect(mapDuoChoose(brut)).toEqual({ state: "unavailable" });
  });
});

describe("mapDuoState — le cœur anti-triche", () => {
  const ouverte = {
    state: "ok",
    status: "ouverte",
    mon_choix: { item_id: ITEM_A, nom: "Tarte" },
    options: [option(ITEM_A, "Tarte", 1), option(ITEM_B, "Café", 2)],
    autre_a_choisi: true,
    autre_choix: null,
    suggestion: null,
    accord: null,
  };

  it("rend les huit clés d'une manche ouverte", () => {
    expect(mapDuoState(ouverte)).toEqual({
      state: "ok",
      status: "ouverte",
      monChoix: { item_id: ITEM_A, nom: "Tarte" },
      options: [
        {
          item_id: ITEM_A,
          nom: "Tarte",
          description: "Servi tiède",
          prix_affiche: "8 €",
          photo_path: null,
          ordre: 1,
        },
        {
          item_id: ITEM_B,
          nom: "Café",
          description: "Servi tiède",
          prix_affiche: "8 €",
          photo_path: null,
          ordre: 2,
        },
      ],
      autreAChoisi: true,
      autreChoix: null,
      suggestion: null,
      accord: null,
    });
  });

  it("rend le choix de l'autre et l'accord APRÈS la révélation", () => {
    const vue = mapDuoState({
      ...ouverte,
      status: "revelee",
      autre_choix: { item_id: ITEM_A, nom: "Tarte" },
      suggestion: {
        item_id: ITEM_B,
        nom: "Café",
        description: null,
        prix_affiche: "2 €",
      },
      accord: true,
    });

    expect(vue).toMatchObject({
      status: "revelee",
      autreChoix: { item_id: ITEM_A, nom: "Tarte" },
      suggestion: { item_id: ITEM_B, nom: "Café" },
      accord: true,
    });
  });

  it("FORCE `autre_choix` à null sur une manche ouverte — document corrompu", () => {
    // La RPC ne PEUT pas produire ce document : les trois valeurs réservées ne
    // sont lues que dans la branche `revelee`, sous un `if`. En lire une ici
    // signifie qu'on ne lit pas ce qu'on croit — RPC réécrite, cache qui rend un
    // vieux document, homonyme. Le mappeur ne propage pas ce qu'il ne comprend
    // pas : l'écran ne dépend que d'UNE promesse, « ouverte ⇒ autreChoix null »,
    // et celle-ci est tenue par du code qu'on peut lire.
    const vue = mapDuoState({
      ...ouverte,
      autre_choix: { item_id: ITEM_B, nom: "Café" },
      accord: false,
      suggestion: {
        item_id: ITEM_B,
        nom: "Café",
        description: null,
        prix_affiche: "2 €",
      },
    });

    expect(vue).toMatchObject({
      status: "ouverte",
      autreChoix: null,
      accord: null,
      suggestion: null,
    });
    // Et le nom de la fiche de l'autre n'a AUCUN chemin jusqu'à l'écran : il ne
    // reste dans le document rendu que parce qu'il est aussi sur le plateau,
    // visible de tous — jamais comme le choix de quelqu'un.
    expect(vue.state === "ok" && vue.autreChoix).toBeNull();
  });

  it("`mon_choix` reste lisible sur une manche ouverte — c'est le mien", () => {
    // La garde porte sur le choix de L'AUTRE. Masquer le sien aussi aurait
    // empêché l'écran de montrer un choix figé, donc de dire pourquoi il ne
    // peut plus être changé.
    const vue = mapDuoState(ouverte);
    expect(vue.state === "ok" && vue.monChoix).toEqual({
      item_id: ITEM_A,
      nom: "Tarte",
    });
  });

  it("`autre_a_choisi` est un booléen EXACT, et son repli est l'attente", () => {
    // Un « true » textuel vient d'un document qu'on ne comprend pas. Le repli
    // `false` — « on attend encore » — est le seul qui n'affirme rien.
    const vue = mapDuoState({ ...ouverte, autre_a_choisi: "true" });
    expect(vue.state === "ok" && vue.autreAChoisi).toBe(false);
  });

  it.each([
    ["document nul", null],
    ["état inconnu", { ...ouverte, state: "surprise" }],
    ["statut hors vocabulaire", { ...ouverte, status: "en_cours" }],
    ["statut absent", { ...ouverte, status: null }],
  ])("%s → indisponible", (_cas, brut) => {
    // Un statut qu'on ne sait pas peindre — ni « choisissez », ni « voici le
    // résultat » — vaut mieux refusé qu'affiché au hasard.
    expect(mapDuoState(brut)).toEqual({ state: "unavailable" });
  });

  it("un plateau illisible ne fait pas tomber l'écran de résultat", () => {
    const vue = mapDuoState({ ...ouverte, options: "surprise" });
    expect(vue.state === "ok" && vue.options).toEqual([]);
  });
});

describe("mapDuoOptionsAdmin — l'écran du commerçant", () => {
  it("lit le plateau et la proposition", () => {
    const vue = mapDuoOptionsAdmin({
      options: [option(ITEM_A, "Tarte", 1)],
      suggestion: {
        item_id: ITEM_B,
        nom: "Café",
        description: null,
        prix_affiche: "2 €",
      },
    });
    expect(vue.options).toHaveLength(1);
    expect(vue.suggestion).toMatchObject({ item_id: ITEM_B, nom: "Café" });
  });

  it.each([
    ["document nul", null],
    ["document vide", {}],
    ["options illisibles", { options: "surprise", suggestion: "surprise" }],
  ])("%s → plateau vide, JAMAIS un refus", (_cas, brut) => {
    // C'est l'inverse de tous les autres mappeurs, et c'est le contrat de la
    // RPC : elle ne refuse pas. Fabriquer ici un `unavailable` qui n'existe pas
    // en face aurait obligé l'écran à distinguer « rien d'épinglé » de « lecture
    // impossible » — deux cas où il affiche la même chose.
    expect(mapDuoOptionsAdmin(brut)).toEqual({ options: [], suggestion: null });
  });
});

describe("mapDuoOptionsSaved / mapDuoSuggestionSaved — les écritures", () => {
  it("rend le compte écrit par la base", () => {
    expect(mapDuoOptionsSaved({ state: "ok", options: 4 })).toBe(4);
  });

  it.each([
    ["document nul", null],
    ["état inconnu", { state: "surprise", options: 4 }],
    ["compte absent", { state: "ok" }],
    ["compte textuel", { state: "ok", options: "4" }],
  ])("%s → null, et l'action remonte une panne", (_cas, brut) => {
    expect(mapDuoOptionsSaved(brut)).toBeNull();
  });

  it("distingue le RETRAIT réussi d'un document illisible", () => {
    // `null` est une valeur légitime ici — le commerçant retire sa proposition —
    // donc il ne peut pas servir de signal d'échec. Sans l'enveloppe, un retrait
    // et une panne se seraient lus pareil.
    expect(mapDuoSuggestionSaved({ state: "ok", suggestion: null })).toEqual({
      suggestion: null,
    });
    expect(mapDuoSuggestionSaved({ state: "ok" })).toBeNull();
    expect(mapDuoSuggestionSaved(null)).toBeNull();
  });

  it("rend la fiche posée", () => {
    expect(mapDuoSuggestionSaved({ state: "ok", suggestion: ITEM_A })).toEqual({
      suggestion: ITEM_A,
    });
  });
});
