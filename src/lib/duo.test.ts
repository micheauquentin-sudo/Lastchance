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
/** La PLACE — clé primaire de `duo_options`, rendue par `duo_state` (DUO-4). */
const OPTION_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function option(item_id: string, nom: string, ordre: number) {
  return {
    option_id: `op-${item_id}`,
    item_id,
    nom,
    description: "Servi tiède",
    prix_affiche: "8 €",
    photo_path: null,
    ordre,
  };
}

/**
 * UNE OPTION SAISIE À LA MAIN (DUO-1) — pas de fiche, pas de prix, pas de photo.
 *
 * C'est le document que `duo_options_json` sert depuis que sa jointure est
 * EXTERNE : `nom` vient du `libelle`, et les trois champs de fiche sont nuls.
 */
function optionSaisie(option_id: string, nom: string, ordre: number) {
  return {
    option_id,
    item_id: null,
    nom,
    description: null,
    prix_affiche: null,
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
        option_id: `op-${ITEM_A}`,
        item_id: ITEM_A,
        nom: "Tarte",
        description: "Servi tiède",
        prix_affiche: "8 €",
        photo_path: null,
        ordre: 1,
      },
    ]);
  });

  it("GARDE UN PLATEAU ENTIÈREMENT SAISI, qui était jeté en silence (DUO-1)", () => {
    // C'ÉTAIT LE DÉFAUT BLOQUANT DU LOT. Ce mappeur exigeait `item_id` ET
    // `nom` : une option écrite à la main — la seule forme possible pour un
    // commerçant sans Vitrine — ressortait ÉCARTÉE, sans erreur et sans trace.
    // La base la servait (jointure externe, `option_id`), l'application la
    // perdait : le plateau paraissait vide avec `duo_jouable` à vrai, c'est-à-
    // dire une porte publique ouverte sur un jeu qui refuse de démarrer.
    const vue = mapDuoOptions([
      optionSaisie("op-1", "Un café gourmand", 1),
      optionSaisie("op-2", "Une part de tarte", 2),
      optionSaisie("op-3", "Un chocolat chaud", 3),
    ]);

    expect(vue).toHaveLength(3);
    expect(vue.map((o) => o.nom)).toEqual([
      "Un café gourmand",
      "Une part de tarte",
      "Un chocolat chaud",
    ]);
    // L'ORIGINE RESTE LISIBLE : `item_id` nul dit « ceci n'est pas une fiche »,
    // ce dont l'écran joueur a besoin — `duo_choose` ne sait valider qu'une
    // fiche, et un bouton qui ne peut rien sceller ne doit pas être cliquable.
    expect(vue.every((o) => o.item_id === null)).toBe(true);
  });

  it("lit un plateau MIXTE sans confondre les deux origines", () => {
    const vue = mapDuoOptions([
      option(ITEM_A, "Tarte", 1),
      optionSaisie("op-2", "Un café gourmand", 2),
    ]);

    expect(vue.map((o) => o.item_id)).toEqual([ITEM_A, null]);
    expect(vue.map((o) => o.option_id)).toEqual([`op-${ITEM_A}`, "op-2"]);
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

  it("saute la place sans identifiant ou sans nom, et garde les autres", () => {
    // Une place amputée ne produit ni bouton à cliquer ni choix à envoyer : la
    // sauter est plus honnête que peindre une carte dont la moitié dit
    // `undefined` — et l'écran ne doit pas tomber pour autant.
    //
    // CE QUI EST EXIGÉ A CHANGÉ AVEC DUO-1 : c'est `option_id`, la PLACE, et
    // non plus `item_id`, la fiche. Une ligne sans `item_id` est désormais
    // parfaitement valable — c'est une proposition saisie.
    const vue = mapDuoOptions([
      { nom: "Sans identifiant de place", ordre: 1 },
      { option_id: "op-sans-nom", ordre: 2 },
      option(ITEM_B, "Café", 3),
    ]);
    expect(vue).toHaveLength(1);
    expect(vue[0].item_id).toBe(ITEM_B);
  });
});

describe("mapDuoChoix / mapDuoSuggestion", () => {
  it("un choix se lit sur ses identifiants ET son nom", () => {
    expect(
      mapDuoChoix({ option_id: OPTION_A, item_id: ITEM_A, nom: "Tarte" }),
    ).toEqual({ option_id: OPTION_A, item_id: ITEM_A, nom: "Tarte" });
  });

  it("UN CHOIX SAISI N'A PAS DE FICHE, et c'est la PLACE qui le nomme", () => {
    // DUO-5, le cas neuf. Une proposition écrite à la main n'a pas d'`item_id` :
    // avant que `option_id` ne voyage, l'écran n'avait aucun moyen de savoir
    // LAQUELLE des places saisies avait été scellée, et les surlignait toutes.
    expect(
      mapDuoChoix({ option_id: OPTION_A, item_id: null, nom: "Un café" }),
    ).toEqual({ option_id: OPTION_A, item_id: null, nom: "Un café" });
  });

  it("UN CHOIX SURVIT À LA DISPARITION DE SA FICHE — le nom suffit", () => {
    // C'est la moitié applicative du remède M-1 : `duo_choices` grave le nom au
    // moment du geste et sa FK est passée en `set null`. Un commerçant qui
    // nettoie sa carte pendant la partie efface le LIEN, pas le choix. Exiger
    // l'identifiant ici jetterait le choix survivant et rendrait la révélation
    // muette pour ce joueur — c'est-à-dire exactement ce que le SQL vient
    // d'empêcher.
    expect(mapDuoChoix({ item_id: null, nom: "Tarte" })).toEqual({
      option_id: null,
      item_id: null,
      nom: "Tarte",
    });
    expect(mapDuoChoix({ nom: "Tarte" })).toEqual({
      option_id: null,
      item_id: null,
      nom: "Tarte",
    });
  });

  it("UN SCEAU D'AVANT DUO-4 N'A PAS DE PLACE, et se lit quand même", () => {
    // `option_id` est nulle sur tout sceau posé avant la migration
    // 20261128120000, et sur un plateau remplacé pendant la manche (`on delete
    // set null`). En faire une condition d'affichage aurait rendu muettes les
    // révélations des parties en cours au moment du déploiement.
    expect(mapDuoChoix({ item_id: ITEM_A, nom: "Tarte" })).toEqual({
      option_id: null,
      item_id: ITEM_A,
      nom: "Tarte",
    });
  });

  it.each([
    ["nul", null],
    ["sans nom", { item_id: ITEM_A }],
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
    mon_choix: { option_id: OPTION_A, item_id: ITEM_A, nom: "Tarte" },
    options: [option(ITEM_A, "Tarte", 1), option(ITEM_B, "Café", 2)],
    autre_a_choisi: true,
    autre_choix: null,
    suggestion: null,
    accord: null,
  };

  it("rend les neuf clés d'une manche ouverte", () => {
    expect(mapDuoState(ouverte)).toEqual({
      state: "ok",
      status: "ouverte",
      monChoix: { option_id: OPTION_A, item_id: ITEM_A, nom: "Tarte" },
      options: [
        {
          option_id: `op-${ITEM_A}`,
          item_id: ITEM_A,
          nom: "Tarte",
          description: "Servi tiède",
          prix_affiche: "8 €",
          photo_path: null,
          ordre: 1,
        },
        {
          option_id: `op-${ITEM_B}`,
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
      // La NEUVIÈME, arrivée en conscience (contre-revue L17, R-2) : le
      // document ne la portait pas, et le repli sûr est « la salle vit » — un
      // document illisible qui déclarerait la partie finie arrêterait un jeu
      // en cours.
      salleClose: false,
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
      option_id: OPTION_A,
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
