import { describe, expect, it } from "vitest";

import {
  mapCloseLobbyAsOrg,
  mapCreateLobby,
  mapJoinLobby,
  mapKickLobby,
  mapLeaveLobby,
  mapLobbyMembres,
  mapLobbyState,
  mapLockLobby,
  mapOrgLobbies,
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
      // SALON-1 — LE DOCUMENT DE RÉFÉRENCE N'A PAS DE CLÉ `habillage`, et c'est
      // exactement le cas d'un commerce qui n'a jamais ouvert l'écran de
      // réglages : `lobby_state` rend alors `habillage: null`. Le mappeur doit
      // le lire comme « pas de décor » et non comme un document tronqué.
      habillage: null,
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

  it("remonte l'habillage du commerce quand la base en rend un", () => {
    expect(
      mapLobbyState({
        ...nominal,
        habillage: {
          theme: "noel",
          fond_key: "aucun",
          nom: "Café des Sports",
          logo_url: "https://exemple.test/logo.png",
        },
      }),
    ).toMatchObject({
      state: "ok",
      habillage: {
        theme: "noel",
        // BRUT, pas résolu : `"aucun"` (« aucune image ») et `null` (« suivre
        // le thème ») ne doivent pas se confondre avant `fondChoisi`.
        fondKey: "aucun",
        nom: "Café des Sports",
        logoUrl: "https://exemple.test/logo.png",
      },
    });
  });

  it("un habillage illisible n'est pas un salon en panne", () => {
    // L'inverse des quatre mappeurs de refus, et c'est délibéré : le décor ne
    // porte rien dont l'écran ait besoin pour fonctionner. Mettre un salon en
    // « indisponible » pour une couleur qu'on ne comprend pas laisserait une
    // table entière devant un refus.
    for (const brut of [null, "noel", 42, []]) {
      expect(mapLobbyState({ ...nominal, habillage: brut })).toMatchObject({
        state: "ok",
        habillage: null,
      });
    }
  });

  it("un thème hors palette retombe sur « neutre » au lieu d'atteindre l'écran", () => {
    // Souple en LECTURE, strict à l'écriture. Une douzième clé, arrivée par un
    // `check` élargi que ce dépôt ne connaîtrait pas encore, n'a aucun lavis
    // mesuré : la peindre reviendrait à servir une couleur dont personne n'a
    // relevé le contraste.
    expect(
      mapLobbyState({
        ...nominal,
        habillage: { theme: "halloween", fond_key: null, nom: null, logo_url: null },
      }),
    ).toMatchObject({
      state: "ok",
      habillage: { theme: "neutre", fondKey: null, nom: null, logoUrl: null },
    });
  });

  it("l'identité tue par la base reste tue ici", () => {
    // `affiche_identite = false` fait rendre `nom` et `logo_url` à `null` PAR LE
    // SQL. Aucun drapeau ne traverse : le mappeur n'a donc rien à décider, et
    // c'est ce qui empêche un écran de « rétablir » ce que le commerçant a
    // choisi de taire.
    expect(
      mapLobbyState({
        ...nominal,
        habillage: { theme: "soldes", fond_key: "prairie", nom: null, logo_url: null },
      }),
    ).toMatchObject({
      state: "ok",
      habillage: { theme: "soldes", fondKey: "prairie", nom: null, logoUrl: null },
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
    // La prolongation à UNE HEURE EST le contenu de cette réponse : un
    // « locked » sans date ferait afficher un compte à rebours vide. (Quatre
    // heures jusqu'à la contrepartie E-1 — c'était devenu la durée de vie d'une
    // salle-squat, pour une partie qui dure quinze minutes.)
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

describe("mapKickLobby", () => {
  it("lit un retrait effectif", () => {
    expect(mapKickLobby({ state: "ok", kicked: true })).toEqual({
      state: "ok",
      kicked: true,
    });
  });

  it("garde `kicked:false` distinct — la place était DÉJÀ libre, ce n'est pas un refus", () => {
    // L'idempotence de `kick_player_lobby` : un clic sur une ligne dont
    // l'occupant venait de partir de lui-même. L'état voulu par l'hôte est
    // atteint, il n'y a rien à lui signaler — mais le replier sur « retiré »
    // affirmerait un geste qui n'a rien fait.
    expect(mapKickLobby({ state: "ok", kicked: false })).toEqual({
      state: "ok",
      kicked: false,
    });
  });

  it.each([
    ["refus explicite", { state: "unavailable" }],
    ["ok sans booléen", { state: "ok" }],
    ["booléen textuel", { state: "ok", kicked: "true" }],
    ["booléen numérique", { state: "ok", kicked: 1 }],
    ["état inconnu", { state: "surprise", kicked: true }],
    ["document nul", null],
    ["tableau", []],
  ])("%s → indisponible", (_cas, brut) => {
    // LE MOTIF DES QUATRE PREMIERS MAPPEURS, PAS CELUI DE `mapLeaveLobby` :
    // `kicked` EST le contenu de cette réponse. Le deviner à `false` ferait
    // afficher « ce rang était déjà libre » d'un retrait dont on ne sait rien,
    // et l'hôte recliquerait sur une ligne qui a peut-être déjà bougé — or les
    // rangs se DÉCALENT après un retrait.
    expect(mapKickLobby(brut)).toEqual({ state: "unavailable" });
  });
});

// ────────────────────────────────────────────────────────────
// LA SUPERVISION COMMERÇANT — contrepartie du finding E-1
// ────────────────────────────────────────────────────────────

/** Une ligne complète, telle que `org_player_lobbies` la construit. */
function ligne(surcharge: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "bande",
    status: "lobby",
    membres: 4,
    created_at: "2026-08-21T12:00:00Z",
    expires_at: "2026-08-21T12:30:00Z",
    ...surcharge,
  };
}

describe("mapOrgLobbies", () => {
  it("lit une liste complète, et n'invente aucune clé", () => {
    expect(mapOrgLobbies({ lobbies: [ligne()] })).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        kind: "bande",
        status: "lobby",
        membres: 4,
        createdAt: "2026-08-21T12:00:00Z",
        expiresAt: "2026-08-21T12:30:00Z",
      },
    ]);
  });

  it("ne fait remonter NI pseudo NI code de partage, même si la base en met", () => {
    // La propriété tient des deux côtés : la RPC refuse de les rendre, et le
    // mappeur refuse de leur donner une place où atterrir. Le code surtout —
    // le laisser passer ferait de cet écran un annuaire ouvrant toutes les
    // salles de la maison à un compte compromis.
    const vue = mapOrgLobbies({
      lobbies: [ligne({ join_code: "ABC234", pseudo: "Ana", token_hash: "ff" })],
    });
    expect(Object.keys(vue[0]).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "kind",
      "membres",
      "status",
    ]);
  });

  it("garde l'ordre du SQL — il porte un départage par identifiant", () => {
    // `created_at desc, id` : `now()` est constant dans une transaction, donc
    // des salles nées ensemble portent la MÊME date. Re-trier sur la seule date
    // jetterait le départage avec lequel le `limit 50` a coupé.
    const meme = { created_at: "2026-08-21T12:00:00Z" };
    const vue = mapOrgLobbies({
      lobbies: [ligne({ id: "b", ...meme }), ligne({ id: "a", ...meme })],
    });
    expect(vue.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it.each([
    ["clé absente", { lobbies: [ligne({ id: undefined })] }],
    ["format inconnu", { lobbies: [ligne({ kind: "trio" })] }],
    ["statut hors des deux vivants", { lobbies: [ligne({ status: "closed" })] }],
    ["statut expiré", { lobbies: [ligne({ status: "expired" })] }],
    ["comptage négatif", { lobbies: [ligne({ membres: -1 })] }],
    ["comptage textuel", { lobbies: [ligne({ membres: "4" })] }],
    ["date de naissance absente", { lobbies: [ligne({ created_at: null })] }],
    ["date de mort absente", { lobbies: [ligne({ expires_at: null })] }],
    ["ligne non objet", { lobbies: ["salon"] }],
  ])("saute la ligne illisible — %s", (_cas, brut) => {
    // Une ligne amputée ne peut rien produire d'utile : ni le résumé, ni le
    // bouton « Fermer », qui a besoin d'un identifiant. La sauter est plus
    // honnête que peindre une ligne dont la moitié dit `undefined`.
    expect(mapOrgLobbies(brut)).toEqual([]);
  });

  it("ne jette pas la liste entière pour une ligne corrompue", () => {
    const vue = mapOrgLobbies({
      lobbies: [ligne({ id: "bon" }), ligne({ kind: "trio" }), ligne({ id: "aussi" })],
    });
    expect(vue.map((s) => s.id)).toEqual(["bon", "aussi"]);
  });

  it.each([
    ["document nul", null],
    ["document sans clé `lobbies`", {}],
    ["`lobbies` nul", { lobbies: null }],
    ["`lobbies` scalaire", { lobbies: 3 }],
    ["racine en tableau", []],
    ["racine scalaire", "salons"],
  ])("%s → tableau vide, jamais `undefined`", (_cas, brut) => {
    // L'écran de supervision itère dessus : un `undefined` ici ferait tomber
    // le tableau de bord entier pour une lecture qui n'a rien renvoyé.
    expect(mapOrgLobbies(brut)).toEqual([]);
  });
});

describe("mapCloseLobbyAsOrg", () => {
  it("lit une fermeture effective", () => {
    expect(mapCloseLobbyAsOrg({ state: "ok", closed: true })).toEqual({
      state: "ok",
      closed: true,
    });
  });

  it("garde `closed:false` distinct — il n'y avait rien à fermer", () => {
    // L'idempotence de la RPC : salle déjà close, déjà morte. C'est un SUCCÈS
    // (l'état voulu est atteint) qui reste distinct, parce qu'il signale un
    // écran en retard sur la base plutôt qu'un geste effectif.
    expect(mapCloseLobbyAsOrg({ state: "ok", closed: false })).toEqual({
      state: "ok",
      closed: false,
    });
  });

  it.each([
    ["ok sans booléen", { state: "ok" }],
    ["booléen textuel", { state: "ok", closed: "true" }],
    ["booléen numérique", { state: "ok", closed: 1 }],
    ["état inconnu", { state: "surprise", closed: true }],
    ["document nul", null],
    ["tableau", []],
  ])("%s → indisponible", (_cas, brut) => {
    // Motif de `mapKickLobby` : `closed` est le CONTENU de cette réponse. Le
    // deviner à `false` ferait dire « déjà fermé » d'une fermeture dont on ne
    // sait rien, et le commerçant recliquerait sur une ligne peut-être partie.
    expect(mapCloseLobbyAsOrg(brut)).toEqual({ state: "unavailable" });
  });
});
