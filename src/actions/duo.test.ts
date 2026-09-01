import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LES ACTIONS DE DUO MIROIR (L17).
 *
 * Quatre propriétés y sont vérifiées, et aucune n'est du confort :
 *
 *   1. LE HASH EST CELUI DU LOBBY, PAS L'IDENTITÉ GLOBALE. Les trois RPC de jeu
 *      exigent l'empreinte du cookie POSÉ PAR SALLE (L16, domaine `lobby:`).
 *      Présenter `lc-player` ou n'importe quelle autre dérivation ne lève
 *      AUCUNE erreur : la RPC ne trouve pas de membre et rend `unavailable`,
 *      partout, en silence. C'est le piège le plus cher du lot.
 *   2. LA GARDE PASSE LA PREMIÈRE sur le chemin commerçant. Les deux RPC
 *      d'écriture revérifient l'acteur, mais l'organisation, elle, est un
 *      PARAMÈTRE : sans la garde, elle viendrait du client.
 *   3. UN REFUS DOUX N'EST PAS UNE PANNE, et il ne se classe JAMAIS par texte.
 *      « Déjà scellé », « non configuré », « sélection refusée » voyagent dans
 *      un littéral typé ; le classement des erreurs SQL se fait sur le SQLSTATE.
 *   4. LE SONDAGE NE REVALIDE RIEN. Deux téléphones qui rappellent l'état
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
    /** Cookies présents à l'ouverture de l'action. */
    cookies: {} as Record<string, string>,
    /** Cookies POSÉS par l'action — il ne doit jamais y en avoir ici. */
    poses: [] as Array<{ nom: string; valeur: string }>,
    /** Ce que rend `gardeEditeurJeuSalon`. */
    garde: {} as
      | { ok: true; organizationId: string; userId: string }
      | { ok: false; error: string },
    /** Le jeu que la garde a été priée de trancher — `duo`, et jamais autre. */
    gardeJeux: [] as string[],
    /** Chemins revalidés par l'action. */
    revalidations: [] as string[],
    /** Écritures de TABLE observées (le chemin des options saisies). */
    table: [] as Array<{ geste: string; valeur: unknown }>,
    /** Erreurs à rendre sur le chemin de table, par geste. */
    tableErreurs: {} as Record<
      string,
      { message: string; code?: string } | null
    >,
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
// PREMIÈRE, qu'elle est appelée sur le droit DU JEU (DUO-3b) et non plus sur
// celui de la Vitrine, et que l'organisation comme l'acteur ne sortent que
// d'elle.
vi.mock("@/lib/salon-garde", () => ({
  gardeEditeurJeuSalon: vi.fn(async (jeu: string) => {
    etat.gardeJeux.push(jeu);
    return etat.garde;
  }),
}));
// LE CLIENT DE SESSION — le chemin d'écriture des options SAISIES. Il n'est pas
// la clé de service, et c'est le point : la RLS `duo_options: editor write`
// tranche en base, là où la clé de service l'aurait contournée.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      delete: () => ({
        eq: (colonne: string, valeur: unknown) => {
          etat.table.push({ geste: `delete ${table} ${colonne}`, valeur });
          return Promise.resolve({ error: etat.tableErreurs.delete ?? null });
        },
      }),
      insert: (lignes: unknown) => {
        etat.table.push({ geste: `insert ${table}`, valeur: lignes });
        return Promise.resolve({ error: etat.tableErreurs.insert ?? null });
      },
    }),
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      etat.rpc.push({ nom, args });
      return Promise.resolve(etat.reponses[nom] ?? { data: null, error: null });
    },
  })),
}));

const {
  chooseDuo,
  getDuoState,
  setDuoOptions,
  setDuoSuggestion,
  startDuo,
} = await import("./duo");
// Le module de contexte de L16 est le VRAI : le nom du cookie et le hachage à
// domaine séparé doivent s'exécuter pour de bon, sinon les assertions
// d'identité ci-dessous ne prouveraient plus rien.
const { hashLobbyToken, lobbyTokenCookieName } = await import(
  "@/lib/lobby-context"
);
const { loadDuoOptions } = await import("@/lib/duo-context");
const { hashPlayerToken } = await import("@/lib/pronostics");

const LOBBY_ID = "11111111-1111-4111-8111-111111111111";
const AUTRE_LOBBY = "22222222-2222-4222-8222-222222222222";
const ROUND_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ITEM_C = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ACTEUR_ID = "44444444-4444-4444-8444-444444444444";
/** Le refus indistinct du chemin joueur, sous sa forme TYPÉE. */
const REFUS_INDISPONIBLE = { ok: true, data: { etat: "indisponible" } };

function option(item_id: string, nom: string, ordre: number) {
  return {
    // `option_id` est la PLACE, et c'est elle que le mappeur exige depuis
    // DUO-1 : `item_id` n'existe pas pour une option saisie à la main.
    option_id: `op-${item_id}`,
    item_id,
    nom,
    description: null,
    prix_affiche: null,
    photo_path: null,
    ordre,
  };
}

function form(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  etat.rpc = [];
  etat.reponses = {};
  etat.cookies = {};
  etat.poses = [];
  etat.garde = { ok: true, organizationId: ORG_ID, userId: ACTEUR_ID };
  etat.gardeJeux = [];
  etat.revalidations = [];
  etat.table = [];
  etat.tableErreurs = {};
});

// ════════════════════════════════════════════════════════════
// LE CHEMIN JOUEUR — l'identité est celle de la salle
// ════════════════════════════════════════════════════════════

describe("startDuo — ouvrir le plateau", () => {
  beforeEach(() => {
    etat.reponses.duo_start = {
      data: {
        state: "ok",
        round_id: ROUND_ID,
        options: [option(ITEM_A, "Tarte", 1), option(ITEM_B, "Café", 2)],
      },
      error: null,
    };
  });

  it("présente le hash du jeton DE CETTE SALLE, et rend le plateau", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    const vue = await startDuo(LOBBY_ID);

    expect(vue).toMatchObject({ state: "ok", roundId: ROUND_ID });
    expect(etat.rpc).toEqual([
      {
        nom: "duo_start",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
        },
      },
    ]);
    // La forme EXACTE qu'exige le `check` des trois RPC : 64 hexadécimaux.
    expect(etat.rpc[0].args.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("le hash est celui du DOMAINE `lobby:`, pas celui des autres modules", async () => {
    // LE PIÈGE LE PLUS CHER DU LOT. `hashLobbyToken` préfixe le secret avant de
    // le hacher, si bien qu'une empreinte de lobby ne peut jamais coïncider avec
    // celle d'un autre module. Présenter la mauvaise dérivation ne lève AUCUNE
    // erreur : la RPC ne trouve pas de membre et rend `unavailable`, partout et
    // en silence. Ce test est ce qui rendrait la régression bruyante.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await startDuo(LOBBY_ID);

    expect(etat.rpc[0].args.p_token_hash).not.toBe(
      hashPlayerToken("jeton-membre"),
    );
  });

  it("l'identité GLOBALE `lc-player` n'est ni lue ni envoyée", async () => {
    // La propriété que L16 achète : un téléphone prêté le temps d'une partie ne
    // lie pas deux identités, et la base ne peut pas recoudre les salles.
    etat.cookies["lc-player"] = "identite-globale-du-porteur";

    const vue = await startDuo(LOBBY_ID);

    expect(vue).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("SANS COOKIE DE CETTE SALLE, aucun appel", async () => {
    // Fabriquer une empreinte pour l'occasion écrirait une identité à quelqu'un
    // qui n'a rien rejoint (motif `getLobbyState`).
    expect(await startDuo(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.poses).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle n'ouvre rien ici", async () => {
    etat.cookies[lobbyTokenCookieName(AUTRE_LOBBY)] = "jeton-ailleurs";

    expect(await startDuo(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("`non_configure` reste DISTINCT d'`unavailable`", async () => {
    // Ce n'est pas un refus de sécurité : il faut déjà être membre d'une salle
    // verrouillée pour le lire. Le confondre avec `unavailable` enverrait les
    // joueurs chercher une panne là où il y a une case à cocher côté commerçant.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.duo_start = { data: { state: "non_configure" }, error: null };

    expect(await startDuo(LOBBY_ID)).toEqual({ state: "non_configure" });
  });

  it("ne revalide RIEN, alors même qu'elle écrit", async () => {
    // Elle insère une manche la première fois — mais elle est appelée par chaque
    // téléphone de la table, et rien de ce qu'elle écrit n'est rendu par une
    // page serveur. Revalider ferait payer à tous les visiteurs du commerce le
    // prix d'une manche qui s'ouvre.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await startDuo(LOBBY_ID);

    expect(etat.revalidations).toHaveLength(0);
  });

  it("un identifiant qui n'est pas un UUID ne touche pas la base", async () => {
    expect(await startDuo("pas-un-uuid")).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("une panne de lecture rend l'état muet, et ne fuit pas le message", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.duo_start = {
      data: null,
      error: { message: 'function "duo_start" does not exist' },
    };

    expect(await startDuo(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "duo.start",
      expect.stringContaining("duo_start"),
    );
  });
});

describe("chooseDuo — sceller son choix", () => {
  beforeEach(() => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.duo_choose = {
      data: { state: "ok", scelle: true, revelee: false },
      error: null,
    };
  });

  it("envoie la salle, le hash du lobby et la fiche choisie", async () => {
    const verdict = await chooseDuo(
      null,
      form({ lobby_id: LOBBY_ID, item_id: ITEM_A }),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "scelle", revelee: false },
    });
    expect(etat.rpc).toEqual([
      {
        nom: "duo_choose",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
          p_item_id: ITEM_A,
        },
      },
    ]);
  });

  it("rend `revelee` au joueur qui a posé le SECOND sceau", async () => {
    // La révélation est dans la MÊME transaction que le second choix : celui qui
    // l'a déclenchée n'a pas à attendre un sondage pour l'apprendre.
    etat.reponses.duo_choose = {
      data: { state: "ok", scelle: true, revelee: true },
      error: null,
    };

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_A })),
    ).toEqual({ ok: true, data: { etat: "scelle", revelee: true } });
  });

  it("le refus `scelle` devient `deja-scelle` — un RÉSULTAT, pas une panne", async () => {
    // Piège du contrat SQL : le mot désigne deux choses opposées. La clé
    // `scelle: true` d'un `ok` est un succès ; l'état `{"state":"scelle"}` est le
    // refus « vous aviez déjà scellé un AUTRE item, rien n'a été écrit ». Le
    // renommage empêche qu'un `if (etat === "scelle")` écrit de bonne foi
    // traite le refus comme le succès.
    etat.reponses.duo_choose = { data: { state: "scelle" }, error: null };

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_B })),
    ).toEqual({ ok: true, data: { etat: "deja-scelle" } });
  });

  it("une fiche HORS PLATEAU rend le refus indistinct", async () => {
    // Fiche inexistante, fiche d'un autre commerce, fiche non épinglée : la RPC
    // les fond en un seul `unavailable` par STRUCTURE. Les distinguer ferait de
    // ce chemin un oracle sur le catalogue d'en face.
    etat.reponses.duo_choose = { data: { state: "unavailable" }, error: null };

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_C })),
    ).toEqual(REFUS_INDISPONIBLE);
  });

  it("SANS COOKIE DE CETTE SALLE, rien n'est tenté", async () => {
    etat.cookies = {};

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_A })),
    ).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("aucun jeton ne peut venir du FORMULAIRE, même posté en toutes lettres", async () => {
    // `.strict()` refuserait la clé, mais elle n'a même pas de chemin pour
    // arriver : l'action ne lit que `lobby_id` et `item_id`. Un jeton reçu du
    // client permettrait de sceller à la place de l'autre joueur.
    await chooseDuo(
      null,
      form({
        lobby_id: LOBBY_ID,
        item_id: ITEM_A,
        token: "jeton-de-lautre",
        token_hash: "f".repeat(64),
      }),
    );

    expect(etat.rpc[0].args).toEqual({
      p_lobby_id: LOBBY_ID,
      p_token_hash: hashLobbyToken("jeton-membre"),
      p_item_id: ITEM_A,
    });
  });

  it.each([
    ["salle absente", { item_id: ITEM_A }],
    ["fiche absente", { lobby_id: LOBBY_ID }],
    ["salle malformée", { lobby_id: "pas-un-uuid", item_id: ITEM_A }],
    ["fiche malformée", { lobby_id: LOBBY_ID, item_id: "pas-un-uuid" }],
  ])("%s → refus indistinct, sans toucher la base", async (_cas, champs) => {
    expect(await chooseDuo(null, form(champs))).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un document illisible retombe sur le refus indistinct", async () => {
    // `revelee` est le CONTENU de la réponse : le deviner ferait attendre un
    // joueur devant une manche déjà révélée.
    etat.reponses.duo_choose = { data: { state: "ok", scelle: true }, error: null };

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_A })),
    ).toEqual(REFUS_INDISPONIBLE);
  });

  it("une panne de transport reste une PANNE", async () => {
    etat.reponses.duo_choose = { data: null, error: { message: "timeout" } };

    expect(
      await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_A })),
    ).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
  });

  it("ne revalide rien", async () => {
    await chooseDuo(null, form({ lobby_id: LOBBY_ID, item_id: ITEM_A }));
    expect(etat.revalidations).toHaveLength(0);
  });
});

describe("getDuoState — le sondage", () => {
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

  beforeEach(() => {
    etat.reponses.duo_state = { data: ouverte, error: null };
  });

  it("lit le cookie de CETTE salle et rend la vue mappée", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    const vue = await getDuoState(LOBBY_ID);

    expect(vue).toMatchObject({
      state: "ok",
      status: "ouverte",
      autreAChoisi: true,
      autreChoix: null,
    });
    expect(etat.rpc).toEqual([
      {
        nom: "duo_state",
        args: {
          p_lobby_id: LOBBY_ID,
          p_token_hash: hashLobbyToken("jeton-membre"),
        },
      },
    ]);
  });

  it("un `autre_choix` arrivé sur une manche OUVERTE n'atteint pas l'écran", async () => {
    // La vraie garde est en SQL — la RPC ne calcule pas cette valeur hors de la
    // branche `revelee`. Celle-ci la redouble : le jour où le document change,
    // l'écran continue de ne dépendre que d'une promesse vérifiable ici.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.duo_state = {
      data: { ...ouverte, autre_choix: { item_id: ITEM_B, nom: "Café" }, accord: false },
      error: null,
    };

    const vue = await getDuoState(LOBBY_ID);

    expect(vue).toMatchObject({ autreChoix: null, accord: null });
  });

  it("SANS COOKIE, aucun appel", async () => {
    expect(await getDuoState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle ne lit rien ici", async () => {
    etat.cookies[lobbyTokenCookieName(AUTRE_LOBBY)] = "jeton-ailleurs";

    expect(await getDuoState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("NE REVALIDE RIEN — c'est le point d'un sondage", async () => {
    // Deux téléphones à deux secondes purgeraient le cache de la route à chaque
    // tic, pour tous les visiteurs, à cause d'une lecture.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await getDuoState(LOBBY_ID);

    expect(etat.revalidations).toHaveLength(0);
  });

  it("une panne de lecture rend l'état muet, jamais une exception", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.duo_state = { data: null, error: { message: "timeout" } };

    expect(await getDuoState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith("duo.state", "timeout");
  });
});

// ════════════════════════════════════════════════════════════
// LE CHEMIN COMMERÇANT — la garde d'abord, la session ensuite
// ════════════════════════════════════════════════════════════

describe("loadDuoOptions — le commerçant VOIT son plateau", () => {
  beforeEach(() => {
    etat.reponses.duo_options_state = {
      data: {
        options: [option(ITEM_A, "Tarte", 1)],
        suggestion: {
          item_id: ITEM_B,
          nom: "Café",
          description: null,
          prix_affiche: "2 €",
        },
      },
      error: null,
    };
  });

  it("passe l'organisation de la SESSION, et rend le plateau lu", async () => {
    const ctx = await loadDuoOptions();

    expect(ctx).toMatchObject({
      ok: true,
      organizationId: ORG_ID,
      plateau: { options: [{ item_id: ITEM_A, nom: "Tarte" }] },
    });
    expect(etat.rpc).toEqual([
      { nom: "duo_options_state", args: { p_organization_id: ORG_ID } },
    ]);
  });

  it("LA GARDE D'ABORD : refusée, la base n'est pas touchée", async () => {
    // `duo_options_state` n'interroge AUCUNE appartenance — elle rend le plateau
    // de l'organisation qu'on lui NOMME. C'est cette garde, et elle seule, qui
    // tient l'appartenance : la placer après la lecture reviendrait à ne pas
    // l'avoir.
    etat.garde = { ok: false, error: "Votre offre ne comprend pas la Vitrine." };

    expect(await loadDuoOptions()).toEqual({
      ok: false,
      error: "Votre offre ne comprend pas la Vitrine.",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("une panne de lecture rend le plateau VIDE, jamais un refus de droit", async () => {
    // Motif `loadOrgLobbies` : le commerçant a le droit, il n'a simplement rien
    // à afficher. Confondre les deux lui ferait croire que son abonnement a
    // changé.
    etat.reponses.duo_options_state = {
      data: null,
      error: { message: 'function "duo_options_state" does not exist' },
    };

    expect(await loadDuoOptions()).toMatchObject({
      ok: true,
      organizationId: ORG_ID,
      plateau: { options: [], suggestion: null },
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "duo.options_state",
      expect.stringContaining("duo_options_state"),
    );
  });
});

describe("setDuoOptions — composer le plateau", () => {
  beforeEach(() => {
    etat.reponses.set_duo_options = {
      data: { state: "ok", options: 3 },
      error: null,
    };
  });

  /**
   * Le formulaire tel que l'écran le poste : `places` RÉPÉTÉ, dans l'ordre,
   * chaque valeur préfixée par son ORIGINE (DUO-1). Une place est soit une
   * fiche de la carte, soit un libellé saisi, et un champ nu ne saurait plus
   * dire laquelle des deux.
   */
  function formPlaces(valeurs: string[]): FormData {
    const fd = new FormData();
    for (const valeur of valeurs) fd.append("places", valeur);
    return fd;
  }

  /** Les plateaux de FICHES, qui restent le chemin de la RPC journalisée. */
  function formOptions(ids: string[]): FormData {
    return formPlaces(ids.map((id) => `fiche:${id}`));
  }

  it("envoie les fiches DANS L'ORDRE POSTÉ, avec l'acteur de la session", async () => {
    // `set_duo_options` écrit `ordre` = position dans le tableau reçu : l'ordre
    // du DOM EST l'ordre du plateau, sans champ caché à tenir d'accord avec
    // l'affichage — donc sans possibilité qu'ils se contredisent.
    const verdict = await setDuoOptions(
      null,
      formOptions([ITEM_C, ITEM_A, ITEM_B]),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "enregistre", options: 3 },
    });
    expect(etat.rpc).toEqual([
      {
        nom: "set_duo_options",
        args: {
          p_organization_id: ORG_ID,
          p_item_ids: [ITEM_C, ITEM_A, ITEM_B],
          p_actor: ACTEUR_ID,
        },
      },
    ]);
    // LES DEUX ÉCRANS QUI MONTRENT LE PLATEAU (DUO-3b) : celui du module, où
    // il se règle, et celui de la Vitrine, dont l'étape « Les jeux » et la
    // vérification finale comptent les mêmes options. N'en revalider qu'un
    // laisserait l'autre annoncer un état d'hier.
    expect(etat.revalidations).toEqual([
      "/dashboard/salons/duo",
      "/dashboard/vitrine",
    ]);
    // LA GARDE EST CELLE DU JEU, plus celle de la Vitrine : un commerçant qui
    // achète le Duo seul (DUO-2) était verrouillé hors de son propre plateau.
    expect(etat.gardeJeux).toEqual(["duo"]);
  });

  it("LA GARDE D'ABORD : refusée, ni lecture du formulaire ni appel", async () => {
    etat.garde = { ok: false, error: "Action non autorisée" };

    expect(await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_C]))).toEqual(
      { ok: false, error: "Action non autorisée" },
    );
    expect(etat.rpc).toHaveLength(0);
    expect(etat.revalidations).toHaveLength(0);
  });

  it("L'ACTEUR ET L'ORGANISATION NE VIENNENT PAS DU FORMULAIRE", async () => {
    // La ligne d'audit `duo.options_set` doit nommer qui a VRAIMENT changé le
    // plateau : un acteur posté en ferait une déclaration sur l'honneur.
    const fd = formOptions([ITEM_A, ITEM_B, ITEM_C]);
    fd.set("actor", "99999999-9999-4999-8999-999999999999");
    fd.set("organization_id", "org-du-voisin");

    await setDuoOptions(null, fd);

    expect(etat.rpc[0].args).toEqual({
      p_organization_id: ORG_ID,
      p_item_ids: [ITEM_A, ITEM_B, ITEM_C],
      p_actor: ACTEUR_ID,
    });
  });

  it.each([
    ["deux fiches", [ITEM_A, ITEM_B]],
    ["aucune fiche", []],
  ])("refuse %s AVANT la base — le cahier dit trois", async (_cas, ids) => {
    // L'écart assumé avec le SQL : la base accepte DEUX, l'écran en exige TROIS.
    // La base ne refuse que ce qui rend le jeu impossible, parce qu'une
    // sélection peut TOMBER à deux toute seule par cascade de suppression de
    // fiche — refuser deux en base aurait fait échouer une partie en cours pour
    // une modification faite au comptoir.
    const verdict = await setDuoOptions(null, formOptions(ids));

    expect(verdict).toEqual({
      ok: false,
      error: "Composez au moins 3 propositions",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("refuse SEPT fiches avant la base", async () => {
    const sept = [ITEM_A, ITEM_B, ITEM_C, ITEM_A, ITEM_B, ITEM_C, ITEM_A];
    const verdict = await setDuoOptions(null, formOptions(sept));

    expect(verdict).toEqual({
      ok: false,
      error: "Composez au plus 6 propositions",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("refuse un DOUBLON avec une phrase, là où la base lèverait une 22023", async () => {
    // Aucune règle ajoutée : `set_duo_options` lève `duplicate duo option item`.
    // Ce qui change est la forme du refus — une phrase, pas une exception.
    const verdict = await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_A]));

    expect(verdict).toEqual({
      ok: false,
      error: "Une même fiche ne peut pas occuper deux places",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("la 22023 est un RÉSULTAT typé, classé sur le SQLSTATE et non sur le texte", async () => {
    // Cardinal et doublon sont déjà impossibles ici (le schéma les a tranchés) :
    // ce code ne peut plus signifier qu'une chose, une fiche disparue de la
    // carte entre l'affichage et le clic. Rien à réparer, un écran à
    // rafraîchir — d'où l'issue typée plutôt qu'une phrase de panne.
    etat.reponses.set_duo_options = {
      data: null,
      error: { message: "unknown duo option item", code: "22023" },
    };

    expect(await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_C]))).toEqual({
      ok: true,
      data: { etat: "selection-refusee" },
    });
    expect(etat.revalidations).toHaveLength(0);
    expect(reportErrorMock).toHaveBeenCalledWith(
      "duo.options_set.refus",
      "unknown duo option item",
    );
  });

  it("la 42501 laisse une trace — elle couvre une clé de service mal configurée", async () => {
    // La garde vient pourtant de passer : il reste deux causes, un commerçant
    // rétrogradé entre-temps ou une clé mal configurée. La seconde rendrait
    // « non autorisé » à tout le monde et pour toujours sans qu'aucune alerte ne
    // parte (motif `closeOrgLobby`, contre-revue L16).
    etat.reponses.set_duo_options = {
      data: null,
      error: { message: "not authorized", code: "42501" },
    };

    expect(await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_C]))).toEqual({
      ok: false,
      error: "Action non autorisée",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "duo.options_set.refus",
      "not authorized",
    );
  });

  it("un document illisible reste une panne, et ne revalide pas", async () => {
    // Le COMPTE est le contenu de la réponse : le deviner ferait afficher un
    // nombre de fiches qui n'a été écrit nulle part.
    etat.reponses.set_duo_options = { data: { state: "ok" }, error: null };

    expect(await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_C]))).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(etat.revalidations).toHaveLength(0);
  });

  it("une panne de transport ne fuit pas le message de la base", async () => {
    etat.reponses.set_duo_options = {
      data: null,
      error: { message: 'function "set_duo_options" does not exist' },
    };

    expect(await setDuoOptions(null, formOptions([ITEM_A, ITEM_B, ITEM_C]))).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "duo.options_set",
      expect.stringContaining("set_duo_options"),
    );
  });

  // ══════════════════════════════════════════════════════════
  // DUO-1 — LE PLATEAU QUI NE VIENT PAS DE LA CARTE
  //
  // Le Duo se vend sans la Vitrine (DUO-2) : un commerçant sans carte n'a
  // aucune fiche à épingler, et compose son plateau en ÉCRIVANT. La base était
  // prête depuis 20261126120000 ; l'application, elle, exigeait encore une
  // fiche des deux côtés — le mappeur jetait les options saisies, et cette
  // action n'avait aucun moyen de les écrire.
  // ══════════════════════════════════════════════════════════

  it("un plateau ENTIÈREMENT SAISI s'écrit par la table, pas par la RPC", async () => {
    // `set_duo_options` ne connaît que des tableaux de fiches et remplace le
    // plateau EN ENTIER : l'appeler ici aurait effacé les libellés au premier
    // enregistrement. La migration renvoie explicitement leur écriture à la
    // table (RLS + grants de colonnes).
    const verdict = await setDuoOptions(
      null,
      formPlaces([
        "libelle:Un café gourmand",
        "libelle:Une part de tarte",
        "libelle:Un chocolat chaud",
      ]),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "enregistre", options: 3 },
    });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.table).toEqual([
      { geste: "delete duo_options organization_id", valeur: ORG_ID },
      {
        geste: "insert duo_options",
        // L'ORDRE POSTÉ EST L'ORDRE DU PLATEAU, comme dans la RPC : `ordre` est
        // la position dans le tableau reçu, et le navigateur poste les champs
        // dans l'ordre du document.
        valeur: [
          {
            organization_id: ORG_ID,
            item_id: null,
            libelle: "Un café gourmand",
            ordre: 1,
          },
          {
            organization_id: ORG_ID,
            item_id: null,
            libelle: "Une part de tarte",
            ordre: 2,
          },
          {
            organization_id: ORG_ID,
            item_id: null,
            libelle: "Un chocolat chaud",
            ordre: 3,
          },
        ],
      },
    ]);
    expect(etat.revalidations).toEqual([
      "/dashboard/salons/duo",
      "/dashboard/vitrine",
    ]);
  });

  it("un plateau MIXTE passe aussi par la table, et garde chaque origine", async () => {
    // Une seule place saisie suffit à sortir du chemin de la RPC : la faire
    // passer par `set_duo_options` aurait silencieusement effacé cette place.
    await setDuoOptions(
      null,
      formPlaces([`fiche:${ITEM_A}`, "libelle:Un café gourmand", `fiche:${ITEM_B}`]),
    );

    expect(etat.rpc).toHaveLength(0);
    expect(etat.table[1].valeur).toEqual([
      { organization_id: ORG_ID, item_id: ITEM_A, libelle: null, ordre: 1 },
      {
        organization_id: ORG_ID,
        item_id: null,
        libelle: "Un café gourmand",
        ordre: 2,
      },
      { organization_id: ORG_ID, item_id: ITEM_B, libelle: null, ordre: 3 },
    ]);
  });

  it("un libellé qui contient un deux-points traverse INTACT", async () => {
    // La coupe se fait sur le PREMIER deux-points : « Menu du jour : entrée,
    // plat » est un nom de plat parfaitement légitime, et le tronquer aurait
    // servi aux joueurs une proposition amputée.
    await setDuoOptions(
      null,
      formPlaces([
        "libelle:Menu du jour : entrée, plat",
        "libelle:Une part de tarte",
        "libelle:Un chocolat chaud",
      ]),
    );

    expect(
      (etat.table[1].valeur as Array<{ libelle: string | null }>)[0].libelle,
    ).toBe("Menu du jour : entrée, plat");
  });

  it.each([
    ["vide", ""],
    ["blanc de bord", " Un café"],
    ["blanc doublé", "Un  café"],
    ["sans alphanumérique", "———"],
    ["codet invisible", "Un caf\u200bé"],
  ])(
    "refuse un libellé %s AVANT la base — le check lèverait une 23514",
    async (_cas, texte) => {
      const verdict = await setDuoOptions(
        null,
        formPlaces([`libelle:${texte}`, "libelle:Une tarte", "libelle:Un thé"]),
      );

      expect(verdict).toMatchObject({ ok: false });
      expect(etat.table).toHaveLength(0);
      expect(etat.rpc).toHaveLength(0);
    },
  );

  it("refuse DEUX LIBELLÉS IDENTIQUES, comme l'index unique partiel", async () => {
    // Deux places du même nom rendraient l'accord du jeu indécidable : le jeu
    // demande « avez-vous choisi la même chose », et deux « Tiramisu » ne
    // savent pas y répondre.
    const verdict = await setDuoOptions(
      null,
      formPlaces(["libelle:Tiramisu", "libelle:Tiramisu", "libelle:Un thé"]),
    );

    expect(verdict).toEqual({
      ok: false,
      error: "Deux propositions ne peuvent pas porter le même nom",
    });
    expect(etat.table).toHaveLength(0);
  });

  it("une place SANS ORIGINE LISIBLE est refusée, jamais repliée sur un libellé", async () => {
    // La replier aurait transformé un envoi cassé en proposition affichée aux
    // joueurs — et « aaaa-bbbb » n'est pas ce que le commerçant a écrit.
    const verdict = await setDuoOptions(
      null,
      formPlaces(["n-importe-quoi", "libelle:Une tarte", "libelle:Un thé"]),
    );

    expect(verdict).toMatchObject({ ok: false });
    expect(etat.table).toHaveLength(0);
  });

  it("la 23503 du chemin de table est un RÉSULTAT : la fiche a quitté la carte", async () => {
    // La FK COMPOSITE `(item_id, organization_id)` tient le locataire même sans
    // la RPC : une fiche disparue, ou d'un autre commerce, ne s'insère pas. Le
    // cas est le même que la 22023 d'en face — rien à réparer, un écran à
    // rafraîchir.
    etat.tableErreurs.insert = { message: "violates foreign key", code: "23503" };

    expect(
      await setDuoOptions(
        null,
        formPlaces([`fiche:${ITEM_A}`, "libelle:Une tarte", "libelle:Un thé"]),
      ),
    ).toEqual({ ok: true, data: { etat: "selection-refusee" } });
    expect(etat.revalidations).toHaveLength(0);
  });

  it("un insert en panne le DIT : le plateau est vide, et le geste à faire est nommé", async () => {
    // Le `delete` et l'`insert` sont deux allers : une panne entre les deux
    // laisse le plateau VIDE — pas corrompu, pas mélangé. Un « une erreur est
    // survenue » enverrait chercher une panne alors que le geste est immédiat.
    etat.tableErreurs.insert = { message: "deadlock detected", code: "40P01" };

    const verdict = await setDuoOptions(
      null,
      formPlaces(["libelle:Un café", "libelle:Une tarte", "libelle:Un thé"]),
    );

    expect(verdict).toMatchObject({ ok: false });
    expect((verdict as { error: string }).error).toContain("vide");
    expect(etat.revalidations).toHaveLength(0);
  });

  it("un delete en panne ne perd RIEN : le plateau d'hier est intact", async () => {
    etat.tableErreurs.delete = { message: "permission denied", code: "42501" };

    expect(
      await setDuoOptions(
        null,
        formPlaces(["libelle:Un café", "libelle:Une tarte", "libelle:Un thé"]),
      ),
    ).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
    // L'`insert` n'est jamais parti : on ne remplace pas ce qu'on n'a pas su
    // retirer.
    expect(etat.table).toHaveLength(1);
  });
});

describe("setDuoSuggestion — la proposition de la maison", () => {
  beforeEach(() => {
    etat.reponses.set_duo_suggestion = {
      data: { state: "ok", suggestion: ITEM_A },
      error: null,
    };
  });

  it("pose la proposition, avec l'acteur de la session, et revalide", async () => {
    const verdict = await setDuoSuggestion(null, form({ item_id: ITEM_A }));

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "enregistre", suggestion: ITEM_A },
    });
    expect(etat.rpc).toEqual([
      {
        nom: "set_duo_suggestion",
        args: {
          p_organization_id: ORG_ID,
          p_item_id: ITEM_A,
          p_actor: ACTEUR_ID,
        },
      },
    ]);
    expect(etat.revalidations).toEqual([
      "/dashboard/salons/duo",
      "/dashboard/vitrine",
    ]);
  });

  it.each([
    ["champ absent", {}],
    ["champ vide", { item_id: "" }],
  ])("%s = RETRAIT, pas une erreur", async (_cas, champs) => {
    // Le commerçant qui ne veut plus rien proposer doit pouvoir le dire, et une
    // seconde action « effacer » aurait dédoublé le journal pour un même geste.
    etat.reponses.set_duo_suggestion = {
      data: { state: "ok", suggestion: null },
      error: null,
    };

    expect(await setDuoSuggestion(null, form(champs))).toEqual({
      ok: true,
      data: { etat: "enregistre", suggestion: null },
    });
    expect(etat.rpc[0].args.p_item_id).toBeNull();
  });

  it("LA GARDE D'ABORD", async () => {
    etat.garde = { ok: false, error: "Session expirée, reconnectez-vous." };

    expect(await setDuoSuggestion(null, form({ item_id: ITEM_A }))).toEqual({
      ok: false,
      error: "Session expirée, reconnectez-vous.",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("l'acteur ne vient pas du formulaire", async () => {
    await setDuoSuggestion(
      null,
      form({ item_id: ITEM_A, actor: "99999999-9999-4999-8999-999999999999" }),
    );

    expect(etat.rpc[0].args.p_actor).toBe(ACTEUR_ID);
  });

  it("une fiche malformée est refusée avant la base", async () => {
    expect(await setDuoSuggestion(null, form({ item_id: "pas-un-uuid" }))).toEqual({
      ok: false,
      error: "Identifiant invalide",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("la 22023 devient `fiche-inconnue` — un résultat, classé sur le SQLSTATE", async () => {
    // Fiche inconnue ET fiche d'un autre commerce partagent le MÊME `raise` :
    // les distinguer donnerait un oracle d'existence sur le catalogue du voisin.
    etat.reponses.set_duo_suggestion = {
      data: null,
      error: { message: "unknown duo suggestion item", code: "22023" },
    };

    expect(await setDuoSuggestion(null, form({ item_id: ITEM_B }))).toEqual({
      ok: true,
      data: { etat: "fiche-inconnue" },
    });
    expect(etat.revalidations).toHaveLength(0);
  });

  it("distingue un RETRAIT réussi d'un document illisible", async () => {
    // `null` est une valeur légitime : sans l'enveloppe du mappeur, un retrait
    // et une panne se seraient lus pareil, et l'écran aurait annoncé
    // « proposition retirée » d'une écriture dont il ne sait rien.
    etat.reponses.set_duo_suggestion = { data: { state: "ok" }, error: null };

    expect(await setDuoSuggestion(null, form({ item_id: ITEM_A }))).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(etat.revalidations).toHaveLength(0);
  });
});
