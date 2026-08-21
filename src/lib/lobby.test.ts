import { describe, expect, it } from "vitest";

import {
  mapCreateLobby,
  mapJoinLobby,
  mapLeaveLobby,
  mapLobbyMembres,
  mapLobbyState,
  mapLockLobby,
  LOBBY_CAPACITE_MAX,
} from "@/lib/lobby";

/**
 * LES MAPPEURS DU SOCLE DE LOBBY (L16).
 *
 * Ce qu'ils protègent n'est pas le cas nominal — PostgREST rend ce que la RPC a
 * construit, et pgTAP prouve déjà cette construction. Ce qu'ils protègent, c'est
 * le jour où la forme du document CHANGE sans que ce fichier le sache : une clé
 * renommée, une agrégation qui rend `null`, une capacité hors bornes. Sans eux,
 * ce jour-là produit un `undefined` au milieu d'un rendu, pas une erreur.
 *
 * Et une propriété de SÉCURITÉ, qui n'est pas de la robustesse : le refus est
 * INDISTINCT. Un état inconnu doit retomber sur `unavailable` — jamais être
 * propagé tel quel, jamais produire un message qui le distingue d'un autre refus.
 */

describe("mapCreateLobby", () => {
  it("lit une création complète", () => {
    expect(
      mapCreateLobby({
        state: "created",
        lobby_id: "11111111-1111-4111-8111-111111111111",
        join_code: "ABC234",
        expires_at: "2026-08-21T12:30:00Z",
      }),
    ).toEqual({
      state: "created",
      lobbyId: "11111111-1111-4111-8111-111111111111",
      joinCode: "ABC234",
      expiresAt: "2026-08-21T12:30:00Z",
    });
  });

  it("distingue le quota — c'est la garde 2 d'ADR-109 §A4, elle doit se dire", () => {
    // Le quota porte sur le COMMERCE, pas sur une salle : le replier sur
    // `unavailable` aurait envoyé le joueur réessayer un geste qui ne peut pas
    // réussir avant plusieurs minutes.
    expect(mapCreateLobby({ state: "quota" })).toEqual({ state: "quota" });
  });

  it.each([
    ["document nul", null],
    ["tableau", []],
    ["état inconnu", { state: "surprise" }],
    ["created sans lobby_id", { state: "created", join_code: "ABC234", expires_at: "x" }],
    [
      "created sans join_code",
      { state: "created", lobby_id: "11111111-1111-4111-8111-111111111111", expires_at: "x" },
    ],
    [
      "created sans expires_at",
      { state: "created", lobby_id: "11111111-1111-4111-8111-111111111111", join_code: "ABC234" },
    ],
  ])("%s → indisponible", (_cas, brut) => {
    // Un « created » amputé n'est pas une création utilisable : l'écran n'aurait
    // ni salle à ouvrir, ni code à montrer, ni date de mort à afficher.
    expect(mapCreateLobby(brut)).toEqual({ state: "unavailable" });
  });
});

describe("mapJoinLobby", () => {
  it("lit une entrée complète", () => {
    expect(
      mapJoinLobby({
        state: "joined",
        lobby_id: "22222222-2222-4222-8222-222222222222",
        kind: "bande",
        capacite: 6,
        rang: 3,
      }),
    ).toEqual({
      state: "joined",
      lobbyId: "22222222-2222-4222-8222-222222222222",
      kind: "bande",
      capacite: 6,
      rang: 3,
    });
  });

  it.each(["full", "locked"])("garde l'état « %s » distinct", (etat) => {
    // Ces deux-là SONT distincts dans le contrat SQL, et le rester est utile :
    // « complet » et « l'hôte a fermé » appellent des gestes différents. Ce qui
    // doit rester indistinct, c'est le trio inventé / expiré / clos, et la RPC
    // les a déjà fondus en `unavailable` avant d'arriver ici.
    expect(mapJoinLobby({ state: etat })).toEqual({ state: etat });
  });

  it.each([
    ["kind hors vocabulaire", { state: "joined", lobby_id: "id", kind: "trio", capacite: 3, rang: 1 }],
    [
      "capacité au-delà du plafond SQL",
      { state: "joined", lobby_id: "id", kind: "bande", capacite: LOBBY_CAPACITE_MAX + 1, rang: 1 },
    ],
    ["capacité sous le plancher", { state: "joined", lobby_id: "id", kind: "duo", capacite: 1, rang: 1 }],
    ["rang absent", { state: "joined", lobby_id: "id", kind: "duo", capacite: 2 }],
  ])("%s → indisponible", (_cas, brut) => {
    // La base ne PEUT pas produire ces documents (`check` sur kind et capacite) :
    // en lire un signifie qu'on ne lit pas ce qu'on croit. Un écran qui
    // dessinerait treize places sur une salle de douze est pire qu'un refus.
    expect(mapJoinLobby(brut)).toEqual({ state: "unavailable" });
  });
});

describe("mapLobbyState", () => {
  const nominal = {
    state: "ok",
    status: "lobby",
    kind: "bande",
    capacite: 4,
    expires_at: "2026-08-21T12:30:00Z",
    join_code: "ABC234",
    membres: [
      { pseudo: "Hôte", rang: 1, est_moi: true },
      { pseudo: "Ami", rang: 2, est_moi: false },
    ],
  };

  it("lit l'état d'un hôte, code de partage compris", () => {
    expect(mapLobbyState(nominal)).toEqual({
      state: "ok",
      status: "lobby",
      kind: "bande",
      capacite: 4,
      expiresAt: "2026-08-21T12:30:00Z",
      joinCode: "ABC234",
      membres: [
        { pseudo: "Hôte", rang: 1, estMoi: true },
        { pseudo: "Ami", rang: 2, estMoi: false },
      ],
    });
  });

  it("un membre ordinaire reçoit joinCode à null, et la CLÉ EXISTE quand même", () => {
    // Forme stable : la clé est toujours là. Une clé qui apparaît et disparaît
    // se teste à chaque lecture ; une clé toujours présente se type une fois.
    const vue = mapLobbyState({ ...nominal, join_code: null });
    expect(vue).toMatchObject({ state: "ok", joinCode: null });
    expect(vue.state === "ok" && "joinCode" in vue).toBe(true);
  });

  it("rend « expired » tel que la lecture SQL l'a constaté", () => {
    // ADR-111 : l'expiration se constate, elle ne s'écrit pas. Le mappeur ne
    // recalcule rien à partir de `expires_at` — deux juges donneraient deux
    // verdicts dès que l'horloge du serveur et celle de la base divergent.
    expect(mapLobbyState({ ...nominal, status: "expired" })).toMatchObject({
      status: "expired",
    });
  });

  it.each([
    ["état non ok", { ...nominal, state: "unavailable" }],
    ["statut hors vocabulaire", { ...nominal, status: "en-cours" }],
    ["kind hors vocabulaire", { ...nominal, kind: "trio" }],
    ["expires_at absent", { ...nominal, expires_at: null }],
    ["document nul", null],
  ])("%s → indisponible", (_cas, brut) => {
    expect(mapLobbyState(brut)).toEqual({ state: "unavailable" });
  });

  it("des membres illisibles ne font pas tomber la salle", () => {
    // Cette lecture est rappelée toutes les trois secondes : un document tronqué
    // ne doit pas casser un écran qui itère dessus, il doit rendre ce qu'il sait.
    expect(mapLobbyState({ ...nominal, membres: null })).toMatchObject({
      state: "ok",
      membres: [],
    });
  });
});

describe("mapLobbyMembres", () => {
  it("écarte les entrées sans pseudo ou sans rang, garde les autres", () => {
    expect(
      mapLobbyMembres([
        { pseudo: "Ana", rang: 1, est_moi: true },
        { rang: 2, est_moi: false },
        { pseudo: "Bo", est_moi: false },
        "pas un objet",
        { pseudo: "Cy", rang: 3, est_moi: false },
      ]),
    ).toEqual([
      { pseudo: "Ana", rang: 1, estMoi: true },
      { pseudo: "Cy", rang: 3, estMoi: false },
    ]);
  });

  it("re-trie par rang même si l'agrégation les rend dans le désordre", () => {
    // Le `jsonb_agg` porte son `order by`, donc ce tri ne corrige rien
    // aujourd'hui. Il existe parce que l'ordre est ce que l'écran AFFICHE : une
    // agrégation qui perdrait son ordonnancement rendrait des places mélangées à
    // chaque sondage, sans qu'aucune erreur ne soit remontée nulle part.
    expect(
      mapLobbyMembres([
        { pseudo: "Cy", rang: 3, est_moi: false },
        { pseudo: "Ana", rang: 1, est_moi: false },
        { pseudo: "Bo", rang: 2, est_moi: true },
      ]).map((m) => m.pseudo),
    ).toEqual(["Ana", "Bo", "Cy"]);
  });

  it("`estMoi` n'est vrai que sur le booléen exact", () => {
    // `est_moi: "true"` viendrait d'un document qu'on ne comprend pas ; le lire
    // comme vrai désignerait le mauvais membre comme étant le porteur du cookie.
    expect(
      mapLobbyMembres([
        { pseudo: "Ana", rang: 1, est_moi: "true" },
        { pseudo: "Bo", rang: 2, est_moi: 1 },
      ]).every((m) => m.estMoi === false),
    ).toBe(true);
  });
});

describe("mapLockLobby", () => {
  it("lit le verrou et sa nouvelle date de mort", () => {
    expect(
      mapLockLobby({ state: "locked", expires_at: "2026-08-21T16:00:00Z" }),
    ).toEqual({ state: "locked", expiresAt: "2026-08-21T16:00:00Z" });
  });

  it.each([
    ["locked sans date", { state: "locked" }],
    ["refus", { state: "unavailable" }],
    ["document nul", null],
  ])("%s → indisponible", (_cas, brut) => {
    // La prolongation à quatre heures EST le contenu de cette réponse : un
    // « locked » sans date ferait afficher un compte à rebours vide.
    expect(mapLockLobby(brut)).toEqual({ state: "unavailable" });
  });
});

describe("mapLeaveLobby", () => {
  it("ne retient « locked » que sur un refus EXPLICITE", () => {
    expect(mapLeaveLobby({ state: "locked" })).toEqual({ state: "locked" });
  });

  it.each([
    ["sortie", { state: "left" }],
    ["document nul", null],
    ["état inconnu", { state: "surprise" }],
    ["tableau", []],
  ])("%s → left", (_cas, brut) => {
    // LE DÉFAUT EST `left`, ET C'EST L'INVERSE DES QUATRE AUTRES MAPPEURS.
    // « indisponible » n'existe pas dans ce contrat, et le fabriquer laisserait
    // un joueur bloqué dans une salle qu'il vient de quitter.
    expect(mapLeaveLobby(brut)).toEqual({ state: "left" });
  });
});
