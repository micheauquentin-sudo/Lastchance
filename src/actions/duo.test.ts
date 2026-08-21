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
    /** Ce que rend `gardeEditeurVitrine`. */
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
vi.mock("@/lib/vitrine-context", () => ({
  gardeEditeurVitrine: vi.fn(async () => etat.garde),
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
  etat.revalidations = [];
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

  /** Le formulaire tel que l'écran le poste : `item_ids` RÉPÉTÉ, dans l'ordre. */
  function formOptions(ids: string[]): FormData {
    const fd = new FormData();
    for (const id of ids) fd.append("item_ids", id);
    return fd;
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
    expect(etat.revalidations).toEqual(["/dashboard/vitrine"]);
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

    expect(verdict).toEqual({ ok: false, error: "Choisissez au moins 3 fiches" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("refuse SEPT fiches avant la base", async () => {
    const sept = [ITEM_A, ITEM_B, ITEM_C, ITEM_A, ITEM_B, ITEM_C, ITEM_A];
    const verdict = await setDuoOptions(null, formOptions(sept));

    expect(verdict).toEqual({ ok: false, error: "Choisissez au plus 6 fiches" });
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
    expect(etat.revalidations).toEqual(["/dashboard/vitrine"]);
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
