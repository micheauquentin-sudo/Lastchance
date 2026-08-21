import { describe, expect, it } from "vitest";

import {
  mapBandeMonVote,
  mapBandeNext,
  mapBandePackSaved,
  mapBandeParticipants,
  mapBandeRecap,
  mapBandeResultats,
  mapBandeReveal,
  mapBandeStart,
  mapBandeState,
  mapBandeVote,
} from "@/lib/bande";
import { BANDE_PACKS } from "@/lib/bande-packs";

/**
 * LES MAPPEURS DE PORTRAIT DE LA BANDE (L18).
 *
 * Ce qu'ils protègent n'est pas le cas nominal — PostgREST rend ce que la RPC a
 * construit, et pgTAP prouve déjà cette construction. Ce qu'ils protègent, c'est
 * le jour où la forme du document CHANGE sans que ce fichier le sache.
 *
 * Et UNE PROPRIÉTÉ DE SÉCURITÉ, qui n'est pas de la robustesse : sur un tour
 * OUVERT, aucun décompte n'atteint l'écran. La vraie garde est en SQL
 * (`bande_state` ne calcule `resultats` que sous un `if … revelee`) ; celle-ci
 * la redouble, pour que l'écran ne dépende que d'une promesse vérifiable ici.
 */

const MEMBRE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBRE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PARTIE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Une clé de question qui EXISTE vraiment — le texte doit se résoudre. */
const QUESTION_VIVANTE = BANDE_PACKS[0].questions[0];

function participant(member_id: string, pseudo: string, rang: number) {
  return { member_id, pseudo, rang, est_moi: false };
}

/** Le document d'un tour OUVERT, dans sa forme complète et saine. */
function ouvert(surcharge: Record<string, unknown> = {}) {
  return {
    state: "ok",
    partie: {
      pack: "amis",
      position: 2,
      nb_questions: 6,
      status: "en_cours",
    },
    tour: {
      position: 2,
      question_cle: QUESTION_VIVANTE.cle,
      status: "ouverte",
      denominateur: 5,
      votes_exprimes: 3,
    },
    mon_vote: null,
    participants: [
      participant(MEMBRE_A, "Léa", 1),
      participant(MEMBRE_B, "Sam", 2),
    ],
    resultats: null,
    salle_close: false,
    ...surcharge,
  };
}

describe("mapBandeParticipants — qui est à table", () => {
  it("lit les quatre clés et rend `estMoi` en camelCase", () => {
    expect(
      mapBandeParticipants([
        { member_id: MEMBRE_A, pseudo: "Léa", rang: 1, est_moi: true },
      ]),
    ).toEqual([{ memberId: MEMBRE_A, pseudo: "Léa", rang: 1, estMoi: true }]);
  });

  it("RE-TRIE par rang, même si le SQL rend les membres mélangés", () => {
    // L'ordre est ce que TOUTE la table a sous les yeux au même instant : des
    // noms qui sautent entre deux sondages feraient voter quelqu'un pour un nom
    // qui n'était plus là quand il a visé.
    const vue = mapBandeParticipants([
      participant(MEMBRE_B, "Sam", 2),
      participant(MEMBRE_A, "Léa", 1),
    ]);

    expect(vue.map((m) => m.pseudo)).toEqual(["Léa", "Sam"]);
  });

  it("saute la ligne sans identifiant, sans pseudo ou sans rang", () => {
    // `member_id` est EXIGÉ, contrairement à l'`item_id` d'un choix de L17 :
    // sans lui, il n'y a personne à nommer, donc rien à peindre.
    const vue = mapBandeParticipants([
      { pseudo: "Fantôme", rang: 3, est_moi: false },
      { member_id: MEMBRE_A, rang: 1, est_moi: false },
      { member_id: MEMBRE_B, pseudo: "Sam", est_moi: false },
      participant(MEMBRE_A, "Léa", 1),
      "pas un objet",
    ]);

    expect(vue).toEqual([
      { memberId: MEMBRE_A, pseudo: "Léa", rang: 1, estMoi: false },
    ]);
  });

  it("`est_moi` est un booléen EXACT — un « true » textuel ne passe pas", () => {
    const vue = mapBandeParticipants([
      { member_id: MEMBRE_A, pseudo: "Léa", rang: 1, est_moi: "true" },
    ]);

    expect(vue[0].estMoi).toBe(false);
  });

  it("un document qui n'est pas un tableau rend un tableau vide", () => {
    expect(mapBandeParticipants(null)).toEqual([]);
    expect(mapBandeParticipants({ membres: [] })).toEqual([]);
  });
});

describe("mapBandeResultats — le décompte", () => {
  it("rend le POURCENTAGE DU SERVEUR, sans le recalculer", () => {
    // 2 voix sur un dénominateur de 3 donneraient 66,67 → le serveur a arrondi
    // à 67. Le mappeur ne refait pas la division : deux arrondis finiraient par
    // différer d'un point, et deux écrans côte à côte n'afficheraient pas le
    // même chiffre.
    const vue = mapBandeResultats([
      {
        cible_member_id: MEMBRE_A,
        cible_pseudo: "Léa",
        voix: 2,
        pourcentage: 67,
      },
    ]);

    expect(vue).toEqual([
      { cibleMemberId: MEMBRE_A, ciblePseudo: "Léa", voix: 2, pourcentage: 67 },
    ]);
  });

  it("GARDE L'ORDRE DU SQL — voix décroissantes, ex æquo compris", () => {
    // Re-trier ici écrirait une seconde définition du classement, qui finirait
    // par diverger de celle qui a lu les votes.
    const vue = mapBandeResultats([
      { cible_member_id: MEMBRE_B, cible_pseudo: "Sam", voix: 3, pourcentage: 60 },
      { cible_member_id: MEMBRE_A, cible_pseudo: "Léa", voix: 3, pourcentage: 60 },
    ]);

    expect(vue.map((r) => r.ciblePseudo)).toEqual(["Sam", "Léa"]);
  });

  it("une cible PARTIE garde sa ligne — le nom gravé suffit", () => {
    // Remède L17 : `cible_pseudo` est gravé au moment du vote, la FK est en
    // `set null`. Exiger l'identifiant aurait effacé du décompte quelqu'un que
    // la tablée a bel et bien nommé.
    const vue = mapBandeResultats([
      { cible_member_id: null, cible_pseudo: "Sam", voix: 1, pourcentage: 20 },
    ]);

    expect(vue).toEqual([
      { cibleMemberId: null, ciblePseudo: "Sam", voix: 1, pourcentage: 20 },
    ]);
  });

  it("saute la ligne sans pourcentage plutôt que d'en inventer un", () => {
    const vue = mapBandeResultats([
      { cible_member_id: MEMBRE_A, cible_pseudo: "Léa", voix: 2 },
      { cible_member_id: MEMBRE_B, cible_pseudo: "Sam", pourcentage: 20 },
      { cible_member_id: MEMBRE_A, voix: 2, pourcentage: 40 },
      { cible_member_id: MEMBRE_B, cible_pseudo: "Zoé", voix: 1, pourcentage: 20 },
    ]);

    expect(vue).toEqual([
      { cibleMemberId: MEMBRE_B, ciblePseudo: "Zoé", voix: 1, pourcentage: 20 },
    ]);
  });
});

describe("mapBandeMonVote — le mien, et le PASSE", () => {
  it("distingue « pas encore voté » d'un PASSE scellé", () => {
    // Les confondre ferait redemander un bulletin à quelqu'un qui a déjà choisi
    // de ne nommer personne — un vote que la base refusera d'enregistrer deux
    // fois.
    expect(mapBandeMonVote(null)).toBeNull();
    expect(
      mapBandeMonVote({ cible_member_id: null, cible_pseudo: null }),
    ).toEqual({ cibleMemberId: null, ciblePseudo: null });
  });

  it("lit un vote nommé, et survit à la disparition de la cible", () => {
    expect(
      mapBandeMonVote({ cible_member_id: MEMBRE_A, cible_pseudo: "Léa" }),
    ).toEqual({ cibleMemberId: MEMBRE_A, ciblePseudo: "Léa" });
    expect(
      mapBandeMonVote({ cible_member_id: null, cible_pseudo: "Léa" }),
    ).toEqual({ cibleMemberId: null, ciblePseudo: "Léa" });
  });
});

describe("mapBandeStart — ouvrir la partie", () => {
  it("lit une ouverture complète", () => {
    expect(
      mapBandeStart({
        state: "ok",
        partie_id: PARTIE_ID,
        pack: "amis",
        position: 1,
        nb_questions: 6,
      }),
    ).toEqual({
      state: "ok",
      partieId: PARTIE_ID,
      pack: "amis",
      position: 1,
      nbQuestions: 6,
    });
  });

  it.each([
    ["sans partie", { state: "ok", pack: "amis", position: 1, nb_questions: 6 }],
    ["sans pack", { state: "ok", partie_id: PARTIE_ID, position: 1, nb_questions: 6 }],
    ["sans nombre de questions", { state: "ok", partie_id: PARTIE_ID, pack: "amis", position: 1 }],
    ["refus", { state: "unavailable" }],
    ["document vide", null],
  ])("%s → indisponible", (_cas, document) => {
    expect(mapBandeStart(document)).toEqual({ state: "unavailable" });
  });
});

describe("mapBandeVote — sceller son vote", () => {
  it("lit un sceau posé, avec la révélation qu'il a déclenchée", () => {
    expect(mapBandeVote({ state: "ok", scelle: true, revelee: true })).toEqual({
      state: "ok",
      scelle: true,
      revelee: true,
    });
  });

  it("`scelle` (le REFUS) reste un état distinct, pas une panne", () => {
    // Piège du contrat SQL : le mot désigne deux choses opposées. La clé
    // `scelle: true` d'un `ok` est un succès ; l'état `{"state":"scelle"}` est
    // le refus « vous aviez déjà voté autrement, rien n'a été écrit ».
    expect(mapBandeVote({ state: "scelle" })).toEqual({ state: "scelle" });
  });

  it.each([
    ["sans `revelee`", { state: "ok", scelle: true }],
    ["avec un `scelle` faux", { state: "ok", scelle: false, revelee: false }],
    ["avec un `revelee` textuel", { state: "ok", scelle: true, revelee: "true" }],
  ])("%s → indisponible", (_cas, document) => {
    // `revelee` est le CONTENU de la réponse : le deviner à `false` ferait
    // attendre celui-là même qui vient de déclencher la révélation.
    expect(mapBandeVote(document)).toEqual({ state: "unavailable" });
  });
});

describe("mapBandeReveal / mapBandeNext — les gestes de l'hôte", () => {
  it("la révélation exige `revelee` STRICTEMENT vrai", () => {
    expect(mapBandeReveal({ state: "ok", revelee: true })).toEqual({
      state: "ok",
      revelee: true,
    });
    expect(mapBandeReveal({ state: "ok" })).toEqual({ state: "unavailable" });
    expect(mapBandeReveal({ state: "ok", revelee: "true" })).toEqual({
      state: "unavailable",
    });
  });

  it("`next` distingue la question suivante de la fin de partie", () => {
    expect(mapBandeNext({ state: "ok", position: 3, status: "en_cours" })).toEqual(
      { state: "ok", position: 3, status: "en_cours" },
    );
    expect(mapBandeNext({ state: "ok", position: 6, status: "recap" })).toEqual({
      state: "ok",
      position: 6,
      status: "recap",
    });
  });

  it("un statut HORS VOCABULAIRE n'est pas un écran qu'on sait peindre", () => {
    // Un repli sur `en_cours` renverrait une table finie sur une question qui
    // n'existe plus.
    expect(mapBandeNext({ state: "ok", position: 3, status: "annulee" })).toEqual(
      { state: "unavailable" },
    );
    expect(mapBandeNext({ state: "ok", status: "recap" })).toEqual({
      state: "unavailable",
    });
  });
});

describe("mapBandeState — le cœur anti-triche", () => {
  it("rend les sept clés d'un tour ouvert, question RÉSOLUE", () => {
    const vue = mapBandeState(ouvert());

    expect(vue).toEqual({
      state: "ok",
      partie: { pack: "amis", position: 2, nbQuestions: 6, status: "en_cours" },
      tour: {
        position: 2,
        questionCle: QUESTION_VIVANTE.cle,
        questionTexte: QUESTION_VIVANTE.texte,
        status: "ouverte",
        denominateur: 5,
        votesExprimes: 3,
      },
      monVote: null,
      participants: [
        { memberId: MEMBRE_A, pseudo: "Léa", rang: 1, estMoi: false },
        { memberId: MEMBRE_B, pseudo: "Sam", rang: 2, estMoi: false },
      ],
      resultats: null,
      salleClose: false,
    });
  });

  it("rend les résultats APRÈS la révélation", () => {
    const vue = mapBandeState(
      ouvert({
        tour: {
          position: 2,
          question_cle: QUESTION_VIVANTE.cle,
          status: "revelee",
          denominateur: 5,
          votes_exprimes: 5,
        },
        resultats: [
          { cible_member_id: MEMBRE_A, cible_pseudo: "Léa", voix: 3, pourcentage: 60 },
        ],
      }),
    );

    expect(vue).toMatchObject({
      state: "ok",
      resultats: [
        { cibleMemberId: MEMBRE_A, ciblePseudo: "Léa", voix: 3, pourcentage: 60 },
      ],
    });
  });

  it("FORCE `resultats` à null sur un tour OUVERT — document corrompu", () => {
    // LA PROPRIÉTÉ DE SÉCURITÉ DU LOT. La RPC ne peut PAS produire cela :
    // `v_resultats` naît `null` et n'est calculé que sous `if … revelee`. En
    // lire hors de cette branche signifie qu'on ne lit pas ce qu'on croit — un
    // `bande_state` réécrit, un cache qui rend un vieux document, une RPC
    // homonyme. L'écran ne doit dépendre que d'une promesse vérifiable ICI.
    const vue = mapBandeState(
      ouvert({
        resultats: [
          { cible_member_id: MEMBRE_A, cible_pseudo: "Léa", voix: 3, pourcentage: 60 },
        ],
      }),
    );

    expect(vue).toMatchObject({ state: "ok", resultats: null });
  });

  it("un tour révélé SANS résultats rend un tableau vide, pas `null`", () => {
    // Le cas est réel : une question où tout le monde a passé n'a aucune ligne
    // de décompte. `[]` dit « révélé, personne nommé » ; `null` dirait
    // « pas encore révélé », c'est-à-dire l'inverse.
    const vue = mapBandeState(
      ouvert({
        tour: {
          position: 2,
          question_cle: QUESTION_VIVANTE.cle,
          status: "revelee",
          denominateur: 5,
          votes_exprimes: 5,
        },
        resultats: [],
      }),
    );

    expect(vue).toMatchObject({ resultats: [] });
  });

  it("une QUESTION RETIRÉE du pack rend un texte nul, et la clé reste", () => {
    // Les packs vivent en TypeScript : une question retirée disparaît des
    // parties suivantes sans migration, mais un tour déjà joué garde sa clé.
    // L'écran doit le supporter — perdre le récapitulatif de la veille parce
    // qu'une question a été écartée ce matin serait le pire des deux mondes.
    const vue = mapBandeState(
      ouvert({
        tour: {
          position: 2,
          question_cle: "question-retiree-en-2027",
          status: "ouverte",
          denominateur: 5,
          votes_exprimes: 3,
        },
      }),
    );

    expect(vue).toMatchObject({
      tour: { questionCle: "question-retiree-en-2027", questionTexte: null },
    });
  });

  it("`mon_vote` reste lisible sur un tour ouvert — c'est le mien", () => {
    const vue = mapBandeState(
      ouvert({ mon_vote: { cible_member_id: MEMBRE_B, cible_pseudo: "Sam" } }),
    );

    expect(vue).toMatchObject({
      monVote: { cibleMemberId: MEMBRE_B, ciblePseudo: "Sam" },
    });
  });

  it("`salle_close` est un booléen EXACT, et son repli est « la salle vit »", () => {
    // Repli sûr : un document illisible qui déclarerait la partie finie
    // arrêterait un jeu en cours ; l'inverse ne coûte qu'un sondage de plus.
    expect(mapBandeState(ouvert({ salle_close: "true" }))).toMatchObject({
      salleClose: false,
    });
    expect(mapBandeState(ouvert({ salle_close: true }))).toMatchObject({
      salleClose: true,
    });
  });

  it.each([
    ["partie absente", { partie: undefined }],
    ["tour absent", { tour: undefined }],
    [
      "statut de partie hors vocabulaire",
      { partie: { pack: "amis", position: 2, nb_questions: 6, status: "annulee" } },
    ],
    [
      "statut de tour hors vocabulaire",
      {
        tour: {
          position: 2,
          question_cle: QUESTION_VIVANTE.cle,
          status: "close",
          denominateur: 5,
          votes_exprimes: 3,
        },
      },
    ],
    [
      "tour sans clé de question",
      {
        tour: {
          position: 2,
          status: "ouverte",
          denominateur: 5,
          votes_exprimes: 3,
        },
      },
    ],
    [
      "tour sans dénominateur",
      {
        tour: {
          position: 2,
          question_cle: QUESTION_VIVANTE.cle,
          status: "ouverte",
          votes_exprimes: 3,
        },
      },
    ],
  ])("%s → indisponible", (_cas, surcharge) => {
    // Ces valeurs SONT l'écran. « Question 3 sur 0 » ou une question sans clé ne
    // sont pas des affichages dégradés, ce sont des affirmations fausses.
    expect(mapBandeState(ouvert(surcharge))).toEqual({ state: "unavailable" });
  });

  it("un refus, ou un document vide, reste indisponible", () => {
    expect(mapBandeState({ state: "unavailable" })).toEqual({
      state: "unavailable",
    });
    expect(mapBandeState(null)).toEqual({ state: "unavailable" });
    expect(mapBandeState([])).toEqual({ state: "unavailable" });
  });

  it("des participants illisibles ne font pas tomber l'écran", () => {
    const vue = mapBandeState(ouvert({ participants: "cassé" }));

    expect(vue).toMatchObject({ state: "ok", participants: [] });
  });
});

describe("mapBandeRecap — le portrait de session", () => {
  it("lit une ligne complète et résout les textes de questions", () => {
    const vue = mapBandeRecap({
      state: "ok",
      portrait: [
        {
          cible_member_id: MEMBRE_A,
          cible_pseudo: "Léa",
          fois_nomme: 2,
          questions: [QUESTION_VIVANTE.cle, "question-retiree"],
        },
      ],
    });

    expect(vue).toEqual({
      state: "ok",
      portrait: [
        {
          cibleMemberId: MEMBRE_A,
          ciblePseudo: "Léa",
          foisNomme: 2,
          questions: [
            { cle: QUESTION_VIVANTE.cle, texte: QUESTION_VIVANTE.texte },
            { cle: "question-retiree", texte: null },
          ],
        },
      ],
    });
  });

  it("saute la ligne sans nom ou sans compte, et garde les autres", () => {
    // Le récapitulatif est le dernier écran de la soirée : le faire tomber en
    // entier pour une ligne illisible perdrait le portrait de tous.
    const vue = mapBandeRecap({
      state: "ok",
      portrait: [
        { cible_member_id: MEMBRE_A, fois_nomme: 2, questions: [] },
        { cible_member_id: MEMBRE_B, cible_pseudo: "Sam", questions: [] },
        {
          cible_member_id: null,
          cible_pseudo: "Zoé",
          fois_nomme: 1,
          questions: [QUESTION_VIVANTE.cle],
        },
      ],
    });

    expect(vue).toMatchObject({
      state: "ok",
      portrait: [{ cibleMemberId: null, ciblePseudo: "Zoé", foisNomme: 1 }],
    });
  });

  it("un portrait VIDE est un résultat, pas un refus", () => {
    // Personne n'a été nommé : c'est possible (tout le monde a passé), et ce
    // n'est pas une panne.
    expect(mapBandeRecap({ state: "ok", portrait: [] })).toEqual({
      state: "ok",
      portrait: [],
    });
  });

  it("un refus reste indisponible", () => {
    expect(mapBandeRecap({ state: "unavailable" })).toEqual({
      state: "unavailable",
    });
    expect(mapBandeRecap(null)).toEqual({ state: "unavailable" });
  });
});

describe("mapBandePackSaved — le réglage écrit", () => {
  it("rend la clé écrite par la base", () => {
    expect(mapBandePackSaved({ state: "ok", pack: "taquin" })).toBe("taquin");
  });

  it("refuse un pack que ce dépôt ne connaît pas", () => {
    // Le `check` SQL et `BANDE_PACK_CLES` auraient divergé : afficher la clé
    // promettrait au commerçant un pack dont personne ici ne peut lire les
    // questions.
    expect(mapBandePackSaved({ state: "ok", pack: "inconnu" })).toBeNull();
  });

  it("un document illisible rend `null`", () => {
    expect(mapBandePackSaved({ state: "ok" })).toBeNull();
    expect(mapBandePackSaved({ pack: "amis" })).toBeNull();
    expect(mapBandePackSaved(null)).toBeNull();
  });
});
