import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LES ACTIONS DE PORTRAIT DE LA BANDE (L18).
 *
 * Cinq propriétés y sont vérifiées, et aucune n'est du confort :
 *
 *   1. LE HASH EST CELUI DU LOBBY, PAS L'IDENTITÉ GLOBALE. Les six RPC de jeu
 *      exigent l'empreinte du cookie POSÉ PAR SALLE (L16, domaine `lobby:`).
 *      Présenter `lc-player` ou n'importe quelle autre dérivation ne lève
 *      AUCUNE erreur : la RPC ne trouve pas de membre et rend `unavailable`,
 *      partout, en silence. C'est le piège le plus cher du lot.
 *   2. LE PASSE EST UNE VALEUR, PAS UNE ABSENCE. `cible_member_id` vide ou
 *      absent part en `null` — la ligne de vote s'écrit et verrouille la
 *      question. Le confondre avec une erreur de formulaire aurait retiré du jeu
 *      le seul geste qui permet de ne nommer personne.
 *   3. LA GARDE PASSE LA PREMIÈRE sur le chemin commerçant. La RPC revérifie
 *      l'acteur, mais l'organisation, elle, est un PARAMÈTRE : sans la garde,
 *      elle viendrait du client — et le pack taquin est exactement le réglage
 *      qu'on ne veut pas voir allumé chez le voisin.
 *   4. UN REFUS DOUX N'EST PAS UNE PANNE, et il ne se classe JAMAIS par texte.
 *      « Déjà voté », « pack inconnu » voyagent dans un littéral typé ; le
 *      classement des erreurs SQL se fait sur le SQLSTATE.
 *   5. LE SONDAGE NE REVALIDE RIEN. Douze téléphones qui rappellent l'état
 *      toutes les deux secondes ne doivent pas purger le cache d'une route
 *      publique à chaque tic.
 */

const { etat } = vi.hoisted(() => ({
  etat: {
    /** Appels RPC observés : nom + arguments. */
    rpc: [] as Array<{ nom: string; args: Record<string, unknown> }>,
    /** Réponses par nom de RPC. `code` porte le SQLSTATE quand il compte. */
    reponses: {} as Record<
      string,
      { data: unknown; error: { message: string; code?: string } | null }
    >,
    /** Lectures de table observées : table + filtres. */
    tables: [] as Array<{ table: string; filtres: Record<string, unknown> }>,
    /** Réponse de la lecture de `bande_settings`. */
    reponseTable: { data: null, error: null } as {
      data: { pack: string } | null;
      error: { message: string } | null;
    },
    /** Cookies présents à l'ouverture de l'action. */
    cookies: {} as Record<string, string>,
    /** Cookies POSÉS par l'action — il ne doit jamais y en avoir ici. */
    poses: [] as Array<{ nom: string; valeur: string }>,
    /** Ce que rend `gardeEditeurJeuSalon`. */
    garde: {} as
      | { ok: true; organizationId: string; userId: string }
      | { ok: false; error: string },
    /** Chemins revalidés par l'action. */
    revalidations: [] as string[],
  },
}));

const reportErrorMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (nom: string) =>
      etat.cookies[nom] ? { name: nom, value: etat.cookies[nom] } : undefined,
    set: (nom: string, valeur: string) => {
      etat.poses.push({ nom, valeur });
    },
    delete: () => {},
  })),
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/cache", () => ({
  revalidatePath: (chemin: string) => {
    etat.revalidations.push(chemin);
  },
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: reportErrorMock,
  monitored: (_n: string, f: () => unknown) => f(),
}));
// La garde est DOUBLÉE, pas contournée : elle interroge une session et un
// abonnement que ce harnais n'a pas. Ce qu'on vérifie ici est qu'elle passe la
// PREMIÈRE, et que l'organisation comme l'acteur ne sortent que d'elle.
vi.mock("@/lib/salon-garde", () => ({
  // DUO-3b : la garde est celle du droit `bande`, plus celle de la Vitrine.
  gardeEditeurJeuSalon: vi.fn(async () => etat.garde),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      etat.rpc.push({ nom, args });
      return Promise.resolve(etat.reponses[nom] ?? { data: null, error: null });
    },
    from: (table: string) => {
      const filtres: Record<string, unknown> = {};
      const chaine = {
        select: () => chaine,
        eq: (colonne: string, valeur: unknown) => {
          filtres[colonne] = valeur;
          return chaine;
        },
        maybeSingle: () => {
          etat.tables.push({ table, filtres });
          return Promise.resolve(etat.reponseTable);
        },
      };
      return chaine;
    },
  })),
}));

const {
  getBandeRecap,
  getBandeState,
  nextBande,
  revealBande,
  setBandePack,
  startBande,
  voteBande,
} = await import("./bande");
// Le module de contexte de L16 est le VRAI : le nom du cookie et le hachage à
// domaine séparé doivent s'exécuter pour de bon, sinon les assertions
// d'identité ci-dessous ne prouveraient plus rien.
const { hashLobbyToken, lobbyTokenCookieName } = await import(
  "@/lib/lobby-context"
);
const { loadBandePack } = await import("@/lib/bande-context");
const { hashPlayerToken } = await import("@/lib/pronostics");
const { BANDE_PACK_DEFAUT, BANDE_PACKS } = await import("@/lib/bande-packs");

const LOBBY_ID = "11111111-1111-4111-8111-111111111111";
const AUTRE_LOBBY = "22222222-2222-4222-8222-222222222222";
const PARTIE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBRE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEMBRE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ACTEUR_ID = "44444444-4444-4444-8444-444444444444";
const QUESTION = BANDE_PACKS[0].questions[0];
/** Le refus indistinct du chemin joueur, sous sa forme TYPÉE. */
const REFUS_INDISPONIBLE = { ok: true, data: { etat: "indisponible" } };

function form(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  etat.rpc = [];
  etat.reponses = {};
  etat.tables = [];
  etat.reponseTable = { data: null, error: null };
  etat.cookies = {};
  etat.poses = [];
  etat.garde = { ok: true, organizationId: ORG_ID, userId: ACTEUR_ID };
  etat.revalidations = [];
});

// ════════════════════════════════════════════════════════════
// LE CHEMIN JOUEUR — l'identité est celle de la salle
// ════════════════════════════════════════════════════════════

describe("startBande — ouvrir la partie", () => {
  beforeEach(() => {
    etat.reponses.bande_start = {
      data: {
        state: "ok",
        partie_id: PARTIE_ID,
        pack: "amis",
        position: 1,
        nb_questions: 6,
      },
      error: null,
    };
  });

  it("présente le hash du jeton DE CETTE SALLE, et rend la partie", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    const vue = await startBande(LOBBY_ID);

    expect(vue).toEqual({
      state: "ok",
      partieId: PARTIE_ID,
      pack: "amis",
      position: 1,
      nbQuestions: 6,
    });
    expect(etat.rpc).toEqual([
      {
        nom: "bande_start",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
        },
      },
    ]);
    // La forme EXACTE qu'exigent les `check` des six RPC : 64 hexadécimaux.
    expect(etat.rpc[0].args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("le hash est celui du DOMAINE `lobby:`, pas celui des autres modules", async () => {
    // LE PIÈGE LE PLUS CHER DU LOT. `hashLobbyToken` préfixe le secret avant de
    // le hacher. Présenter la mauvaise dérivation ne lève AUCUNE erreur : la RPC
    // ne trouve pas de membre et rend `unavailable`, partout et en silence.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await startBande(LOBBY_ID);

    expect(etat.rpc[0].args.p_token_hash).not.toBe(
      hashPlayerToken("jeton-membre"),
    );
  });

  it("l'identité GLOBALE `lc-player` n'est ni lue ni envoyée", async () => {
    // La propriété que L16 achète, et qui compte double sur un jeu où l'on dit
    // quelque chose de ses voisins de table.
    etat.cookies["lc-player"] = "identite-globale-du-porteur";

    expect(await startBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("SANS COOKIE DE CETTE SALLE, aucun appel", async () => {
    expect(await startBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.poses).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle n'ouvre rien ici", async () => {
    etat.cookies[lobbyTokenCookieName(AUTRE_LOBBY)] = "jeton-ailleurs";

    expect(await startBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("ne revalide RIEN, alors même qu'elle écrit", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await startBande(LOBBY_ID);

    expect(etat.revalidations).toHaveLength(0);
  });

  it("un identifiant qui n'est pas un UUID ne touche pas la base", async () => {
    expect(await startBande("pas-un-uuid")).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("une panne de lecture rend l'état muet, et ne fuit pas le message", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_start = {
      data: null,
      error: { message: 'function "bande_start" does not exist' },
    };

    expect(await startBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "bande.start",
      expect.stringContaining("bande_start"),
    );
  });
});

describe("voteBande — nommer, ou passer", () => {
  beforeEach(() => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_vote = {
      data: { state: "ok", scelle: true, revelee: false },
      error: null,
    };
  });

  it("envoie la salle, le hash du lobby et la cible", async () => {
    const verdict = await voteBande(
      null,
      form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B }),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "scelle", revelee: false },
    });
    expect(etat.rpc).toEqual([
      {
        nom: "bande_vote",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
          p_cible_member_id: MEMBRE_B,
        },
      },
    ]);
  });

  it.each([
    ["champ absent", { lobby_id: LOBBY_ID }],
    ["champ vide", { lobby_id: LOBBY_ID, cible_member_id: "" }],
  ])("%s = PASSE : la cible part à `null`, et le vote est scellé", async (
    _cas,
    champs,
  ) => {
    // ARBITRAGE 1. `null` n'est pas une absence : la ligne de vote s'écrit, elle
    // compte dans le verrouillage de la question, et elle ne donne sa voix à
    // personne. C'est l'écart le plus visible avec `chooseDuo` (L17), qui refuse
    // un item nul — là-bas, ne rien choisir n'était pas un coup jouable.
    const verdict = await voteBande(null, form(champs));

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "scelle", revelee: false },
    });
    expect(etat.rpc[0].args.p_cible_member_id).toBeNull();
  });

  it("un PASSE explicite n'est PAS traité comme un formulaire malformé", async () => {
    // La distinction vaut d'être tenue à part : un schéma `.optional()` aurait
    // confondu « j'ai choisi de ne nommer personne » avec « le formulaire est
    // arrivé amputé », et l'action aurait dû deviner lequel des deux elle tient.
    // Ici, le passe TOUCHE la base ; un `lobby_id` malformé, non.
    await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: "" }));
    expect(etat.rpc).toHaveLength(1);

    etat.rpc = [];
    expect(
      await voteBande(null, form({ lobby_id: "pas-un-uuid" })),
    ).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("rend `revelee` au joueur qui a posé le DERNIER vote attendu", async () => {
    // La révélation est dans la MÊME transaction que le dernier vote : celui qui
    // l'a déclenchée n'a pas à attendre un sondage pour l'apprendre.
    etat.reponses.bande_vote = {
      data: { state: "ok", scelle: true, revelee: true },
      error: null,
    };

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B })),
    ).toEqual({ ok: true, data: { etat: "scelle", revelee: true } });
  });

  it("le refus `scelle` devient `deja-vote` — un RÉSULTAT, pas une panne", async () => {
    // Piège du contrat SQL : le mot désigne deux choses opposées. La clé
    // `scelle: true` d'un `ok` est un succès ; l'état `{"state":"scelle"}` est
    // le refus « vous aviez déjà voté autrement, rien n'a été écrit ». Le
    // renommage empêche qu'un `if (etat === "scelle")` écrit de bonne foi traite
    // le refus comme le succès.
    etat.reponses.bande_vote = { data: { state: "scelle" }, error: null };

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_A })),
    ).toEqual({ ok: true, data: { etat: "deja-vote" } });
  });

  it("voter POUR SOI rend le même refus qu'une cible hors salle", async () => {
    // ARBITRAGE 2 : la lecture qui valide la cible porte trois conditions à la
    // fois, et les trois empruntent le même `return` par STRUCTURE. Distinguer
    // « vous ne pouvez pas voter pour vous » aurait donné, au passage, un oracle
    // sur les membres des salles d'à côté.
    etat.reponses.bande_vote = { data: { state: "unavailable" }, error: null };

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_A })),
    ).toEqual(REFUS_INDISPONIBLE);
  });

  it("SANS COOKIE DE CETTE SALLE, rien n'est tenté", async () => {
    etat.cookies = {};

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B })),
    ).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("aucun jeton ne peut venir du FORMULAIRE, même posté en toutes lettres", async () => {
    // `.strict()` refuserait la clé, mais elle n'a même pas de chemin pour
    // arriver : l'action ne lit que `lobby_id` et `cible_member_id`. Un jeton
    // reçu du client permettrait de voter à la place de quelqu'un d'autre.
    await voteBande(
      null,
      form({
        lobby_id: LOBBY_ID,
        cible_member_id: MEMBRE_B,
        token: "jeton-du-voisin",
        token_hash: "f".repeat(64),
      }),
    );

    expect(etat.rpc[0].args).toEqual({
      p_lobby_id: LOBBY_ID,
      p_token_hash: hashLobbyToken("jeton-membre"),
      p_cible_member_id: MEMBRE_B,
    });
  });

  it.each([
    ["salle absente", { cible_member_id: MEMBRE_B }],
    ["salle malformée", { lobby_id: "pas-un-uuid", cible_member_id: MEMBRE_B }],
    ["cible malformée", { lobby_id: LOBBY_ID, cible_member_id: "pas-un-uuid" }],
  ])("%s → refus indistinct, sans toucher la base", async (_cas, champs) => {
    expect(await voteBande(null, form(champs))).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un document illisible retombe sur le refus indistinct", async () => {
    etat.reponses.bande_vote = { data: { state: "ok", scelle: true }, error: null };

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B })),
    ).toEqual(REFUS_INDISPONIBLE);
  });

  it("une panne de transport reste une PANNE", async () => {
    etat.reponses.bande_vote = { data: null, error: { message: "timeout" } };

    expect(
      await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B })),
    ).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
  });

  it("ne revalide rien", async () => {
    await voteBande(null, form({ lobby_id: LOBBY_ID, cible_member_id: MEMBRE_B }));
    expect(etat.revalidations).toHaveLength(0);
  });
});

describe("getBandeState — le sondage", () => {
  const ouvert = {
    state: "ok",
    partie: { pack: "amis", position: 2, nb_questions: 6, status: "en_cours" },
    tour: {
      position: 2,
      question_cle: QUESTION.cle,
      status: "ouverte",
      denominateur: 5,
      votes_exprimes: 3,
    },
    mon_vote: null,
    participants: [
      { member_id: MEMBRE_A, pseudo: "Léa", rang: 1, est_moi: true },
    ],
    resultats: null,
    salle_close: false,
  };

  beforeEach(() => {
    etat.reponses.bande_state = { data: ouvert, error: null };
  });

  it("lit le cookie de CETTE salle et rend la vue mappée", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    const vue = await getBandeState(LOBBY_ID);

    expect(vue).toMatchObject({
      state: "ok",
      tour: { questionCle: QUESTION.cle, questionTexte: QUESTION.texte },
      participants: [{ memberId: MEMBRE_A, pseudo: "Léa", estMoi: true }],
      resultats: null,
    });
    expect(etat.rpc).toEqual([
      {
        nom: "bande_state",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
        },
      },
    ]);
  });

  it("des `resultats` arrivés sur un tour OUVERT n'atteignent pas l'écran", async () => {
    // La vraie garde est en SQL — la RPC ne calcule pas cette valeur hors de la
    // branche `revelee`. Celle-ci la redouble : le jour où le document change,
    // l'écran continue de ne dépendre que d'une promesse vérifiable ici. Tout le
    // jeu repose sur des votes scellés ; s'ils ne le sont que par politesse du
    // client, il n'y a plus de jeu.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_state = {
      data: {
        ...ouvert,
        resultats: [
          { cible_member_id: MEMBRE_B, cible_pseudo: "Sam", voix: 2, pourcentage: 40 },
        ],
      },
      error: null,
    };

    expect(await getBandeState(LOBBY_ID)).toMatchObject({ resultats: null });
  });

  it("rend le POURCENTAGE du serveur tel quel après la révélation", async () => {
    // 2 voix sur 3 → le serveur a arrondi à 67. Le recalculer côté client
    // donnerait un second arrondi, qui finirait par différer d'un point.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_state = {
      data: {
        ...ouvert,
        tour: { ...ouvert.tour, status: "revelee", votes_exprimes: 5 },
        resultats: [
          { cible_member_id: MEMBRE_B, cible_pseudo: "Sam", voix: 2, pourcentage: 67 },
        ],
      },
      error: null,
    };

    expect(await getBandeState(LOBBY_ID)).toMatchObject({
      resultats: [{ ciblePseudo: "Sam", voix: 2, pourcentage: 67 }],
    });
  });

  it("SANS COOKIE, aucun appel", async () => {
    expect(await getBandeState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle ne lit rien ici", async () => {
    etat.cookies[lobbyTokenCookieName(AUTRE_LOBBY)] = "jeton-ailleurs";

    expect(await getBandeState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("NE REVALIDE RIEN — c'est le point d'un sondage", async () => {
    // Douze téléphones à deux secondes purgeraient le cache de la route à chaque
    // tic, pour tous les visiteurs, à cause d'une lecture.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await getBandeState(LOBBY_ID);

    expect(etat.revalidations).toHaveLength(0);
  });

  it("une panne de lecture rend l'état muet, jamais une exception", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_state = { data: null, error: { message: "timeout" } };

    expect(await getBandeState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith("bande.state", "timeout");
  });
});

describe("revealBande / nextBande — les gestes de l'hôte", () => {
  beforeEach(() => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";
    etat.reponses.bande_reveal = {
      data: { state: "ok", revelee: true },
      error: null,
    };
    etat.reponses.bande_next = {
      data: { state: "ok", position: 3, status: "en_cours" },
      error: null,
    };
  });

  it("la révélation présente l'empreinte sous `p_creator_token_hash`", async () => {
    // C'EST LA MÊME EMPREINTE que partout ailleurs, celle du cookie de cette
    // salle : c'est la BASE qui la compare au `creator_token_hash` du lobby.
    // L'action ne sait pas, et n'a pas à savoir, qui est l'hôte.
    expect(await revealBande(LOBBY_ID)).toEqual({ state: "ok", revelee: true });
    expect(etat.rpc).toEqual([
      {
        nom: "bande_reveal",
        args: {
          p_lobby_id: LOBBY_ID,
          p_creator_token_hash: hashLobbyToken("jeton-hote"),
        },
      },
    ]);
  });

  it("un membre ORDINAIRE reçoit le refus générique, sans le savoir", async () => {
    etat.reponses.bande_reveal = { data: { state: "unavailable" }, error: null };

    expect(await revealBande(LOBBY_ID)).toEqual({ state: "unavailable" });
  });

  it("`next` rend la position et le statut, `recap` compris", async () => {
    expect(await nextBande(LOBBY_ID)).toEqual({
      state: "ok",
      position: 3,
      status: "en_cours",
    });

    etat.reponses.bande_next = {
      data: { state: "ok", position: 6, status: "recap" },
      error: null,
    };
    expect(await nextBande(LOBBY_ID)).toEqual({
      state: "ok",
      position: 6,
      status: "recap",
    });
    expect(etat.rpc[1].args.p_creator_token_hash).toBe(
      hashLobbyToken("jeton-hote"),
    );
  });

  it("SANS COOKIE DE CETTE SALLE, ni révélation ni suite", async () => {
    etat.cookies = {};

    expect(await revealBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(await nextBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("ni l'une ni l'autre ne revalide", async () => {
    await revealBande(LOBBY_ID);
    await nextBande(LOBBY_ID);

    expect(etat.revalidations).toHaveLength(0);
  });

  it("une panne rend le refus, et laisse une trace", async () => {
    etat.reponses.bande_next = { data: null, error: { message: "timeout" } };

    expect(await nextBande(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith("bande.next", "timeout");
  });
});

describe("getBandeRecap — le portrait de session", () => {
  beforeEach(() => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.bande_recap = {
      data: {
        state: "ok",
        portrait: [
          {
            cible_member_id: MEMBRE_A,
            cible_pseudo: "Léa",
            fois_nomme: 2,
            questions: [QUESTION.cle],
          },
        ],
      },
      error: null,
    };
  });

  it("lit le portrait et RÉSOUT les textes de questions", async () => {
    const vue = await getBandeRecap(LOBBY_ID);

    expect(vue).toEqual({
      state: "ok",
      portrait: [
        {
          cibleMemberId: MEMBRE_A,
          ciblePseudo: "Léa",
          foisNomme: 2,
          questions: [{ cle: QUESTION.cle, texte: QUESTION.texte }],
        },
      ],
    });
    expect(etat.rpc[0]).toEqual({
      nom: "bande_recap",
      args: {
        p_lobby_id: LOBBY_ID,
        p_token_hash: hashLobbyToken("jeton-membre"),
      },
    });
  });

  it("une question RETIRÉE du pack laisse la clé et un texte nul", async () => {
    // Les packs vivent en TypeScript : le récapitulatif de la veille ne doit pas
    // devenir illisible parce qu'une question a été écartée ce matin.
    etat.reponses.bande_recap = {
      data: {
        state: "ok",
        portrait: [
          {
            cible_member_id: MEMBRE_A,
            cible_pseudo: "Léa",
            fois_nomme: 1,
            questions: ["question-retiree-en-2027"],
          },
        ],
      },
      error: null,
    };

    expect(await getBandeRecap(LOBBY_ID)).toMatchObject({
      state: "ok",
      portrait: [
        { questions: [{ cle: "question-retiree-en-2027", texte: null }] },
      ],
    });
  });

  it("SANS COOKIE, aucun appel — et ne revalide rien", async () => {
    etat.cookies = {};

    expect(await getBandeRecap(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.revalidations).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// LE CHEMIN COMMERÇANT — la garde d'abord, la session ensuite
// ════════════════════════════════════════════════════════════

describe("loadBandePack — le commerçant VOIT son pack", () => {
  it("passe l'organisation de la SESSION, et rend la clé réglée", async () => {
    etat.reponseTable = { data: { pack: "taquin" }, error: null };

    expect(await loadBandePack()).toEqual({
      ok: true,
      organizationId: ORG_ID,
      pack: "taquin",
    });
    expect(etat.tables).toEqual([
      { table: "bande_settings", filtres: { organization_id: ORG_ID } },
    ]);
  });

  it("LA GARDE D'ABORD : refusée, la base n'est pas touchée", async () => {
    // La clé de service contourne la RLS : le filtre `organization_id` est la
    // SEULE chose qui borne cette lecture à un locataire, et il ne reçoit que
    // l'organisation de la session. Placer la garde après reviendrait à ne pas
    // l'avoir.
    etat.garde = { ok: false, error: "Votre offre ne comprend pas la Vitrine." };

    expect(await loadBandePack()).toEqual({
      ok: false,
      error: "Votre offre ne comprend pas la Vitrine.",
    });
    expect(etat.tables).toHaveLength(0);
  });

  it("aucun réglage = le pack POSITIF par défaut, jamais un refus", async () => {
    // La ligne naît de `set_bande_pack` : son absence est le cas ORDINAIRE d'un
    // commerce qui n'a rien choisi.
    expect(await loadBandePack()).toEqual({
      ok: true,
      organizationId: ORG_ID,
      pack: BANDE_PACK_DEFAUT,
    });
    expect(BANDE_PACK_DEFAUT).not.toBe("taquin");
  });

  it("une panne de lecture rend le DÉFAUT, jamais un refus de droit", async () => {
    // Motif `loadDuoOptions` : le commerçant a le droit, il n'a simplement rien
    // de réglé à afficher. Et le repli est le pack positif — un défaut
    // d'affichage ne doit pas faire croire que le taquin est actif chez lui.
    etat.reponseTable = { data: null, error: { message: "timeout" } };

    expect(await loadBandePack()).toMatchObject({ ok: true, pack: BANDE_PACK_DEFAUT });
    expect(reportErrorMock).toHaveBeenCalledWith("bande.pack_state", "timeout");
  });

  it("une clé INCONNUE de ce dépôt retombe sur le défaut", async () => {
    // Le `check` SQL et `BANDE_PACK_CLES` auraient divergé : cocher un sixième
    // nom dans une liste de cinq n'aurait rien affiché d'utile.
    etat.reponseTable = { data: { pack: "pack-fantome" }, error: null };

    expect(await loadBandePack()).toMatchObject({ pack: BANDE_PACK_DEFAUT });
  });
});

describe("setBandePack — choisir le ton du jeu", () => {
  beforeEach(() => {
    etat.reponses.set_bande_pack = {
      data: { state: "ok", pack: "taquin" },
      error: null,
    };
  });

  it("envoie le pack avec l'organisation ET l'acteur de la session", async () => {
    const verdict = await setBandePack(null, form({ pack: "taquin" }));

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "enregistre", pack: "taquin" },
    });
    expect(etat.rpc).toEqual([
      {
        nom: "set_bande_pack",
        args: {
          p_organization_id: ORG_ID,
          p_pack: "taquin",
          p_actor: ACTEUR_ID,
        },
      },
    ]);
    expect(etat.revalidations).toEqual([
      "/dashboard/salons/bande",
      // LE STUDIO, HORS DE `/dashboard` (VIT-48) : aucun chemin d'atelier ne
      // l'atteint, Next revalidant un CHEMIN et non une ressource.
      "/studio/salon/bande",
      "/dashboard/vitrine",
      // ET SON STUDIO, hors de `/dashboard` lui aussi (VIT-48). L'étape
      // « Ce qui paraît » y montre les jeux : sans ce jumeau, on règle son
      // plateau et l'écran qui l'affiche reste sur l'état d'hier.
      "/vitrine-studio",
    ]);
  });

  it("LA GARDE D'ABORD : refusée, ni lecture du formulaire ni appel", async () => {
    etat.garde = { ok: false, error: "Action non autorisée" };

    expect(await setBandePack(null, form({ pack: "taquin" }))).toEqual({
      ok: false,
      error: "Action non autorisée",
    });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.revalidations).toHaveLength(0);
  });

  it("L'ACTEUR ET L'ORGANISATION NE VIENNENT PAS DU FORMULAIRE", async () => {
    // La ligne d'audit `bande.pack_set` doit nommer qui a VRAIMENT allumé le
    // pack taquin : un acteur posté en ferait une déclaration sur l'honneur.
    const fd = form({ pack: "taquin" });
    fd.set("actor", "99999999-9999-4999-8999-999999999999");
    fd.set("organization_id", "org-du-voisin");

    await setBandePack(null, fd);

    expect(etat.rpc[0].args).toEqual({
      p_organization_id: ORG_ID,
      p_pack: "taquin",
      p_actor: ACTEUR_ID,
    });
  });

  it.each([
    ["pack inventé", "pack-fantome"],
    ["pack vide", ""],
  ])("refuse un %s AVANT la base, avec une phrase", async (_cas, pack) => {
    const verdict = await setBandePack(null, form({ pack }));

    expect(verdict).toEqual({
      ok: false,
      error: "Choisissez un pack de questions valide",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("la 22023 est un RÉSULTAT typé, classé sur le SQLSTATE et non sur le texte", async () => {
    // Le schéma a déjà écarté toute clé hors `BANDE_PACK_CLES` : ce code ne peut
    // plus dire qu'une chose, la liste TypeScript et le `check` SQL ont divergé.
    // C'est un état du dépôt, pas une faute du commerçant — lui dire « une
    // erreur est survenue » l'enverrait recliquer indéfiniment.
    etat.reponses.set_bande_pack = {
      data: null,
      error: { message: "unknown bande pack", code: "22023" },
    };

    expect(await setBandePack(null, form({ pack: "taquin" }))).toEqual({
      ok: true,
      data: { etat: "pack-inconnu" },
    });
    expect(etat.revalidations).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledWith(
      "bande.pack_set.refus",
      "unknown bande pack",
    );
  });

  it("la 42501 laisse une trace — elle couvre une clé de service mal configurée", async () => {
    etat.reponses.set_bande_pack = {
      data: null,
      error: { message: "not authorized", code: "42501" },
    };

    expect(await setBandePack(null, form({ pack: "taquin" }))).toEqual({
      ok: false,
      error: "Action non autorisée",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "bande.pack_set.refus",
      "not authorized",
    );
  });

  it("un document illisible reste une panne, et ne revalide pas", async () => {
    // Le PACK RENDU est le contenu de la réponse : le deviner en réaffichant le
    // formulaire annoncerait un réglage qui n'a peut-être pas été écrit.
    etat.reponses.set_bande_pack = { data: { state: "ok" }, error: null };

    expect(await setBandePack(null, form({ pack: "taquin" }))).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(etat.revalidations).toHaveLength(0);
  });

  it("une panne de transport ne fuit pas le message de la base", async () => {
    etat.reponses.set_bande_pack = {
      data: null,
      error: { message: 'function "set_bande_pack" does not exist' },
    };

    expect(await setBandePack(null, form({ pack: "amis" }))).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "bande.pack_set",
      expect.stringContaining("set_bande_pack"),
    );
  });
});
