import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LES ACTIONS DU SOCLE DE LOBBY (L16).
 *
 * Trois propriétés y sont vérifiées, et aucune n'est du confort :
 *
 *   1. L'IDENTITÉ EST PAR SALLE. Le cookie `lc-player` n'est ni lu, ni recopié,
 *      ni envoyé — un téléphone prêté ne lie pas deux identités, et la base ne
 *      peut pas recoudre les salles entre elles.
 *   2. LE COOKIE EST POSÉ APRÈS LE SUCCÈS. Un refus ne laisse aucune identité
 *      orpheline sur l'appareil, et la purge n'a aucune prise sur ce qui vit
 *      dans un navigateur.
 *   3. LE REFUS EST INDISTINCT. Slug malformé, adresse inconnue, droit fermé,
 *      code inventé, code expiré : un seul verdict. Les séparer donnerait de
 *      quoi énumérer, six caractères à la fois, la vie sociale des commerces
 *      d'à côté.
 *   4. UN REFUS DOUX N'EST PAS UNE PANNE. « Complet », « verrouillé », « quota »
 *      et « indisponible » voyagent dans `data.etat`, typé ; `{ ok: false }` est
 *      réservé aux vraies pannes et aux saisies que le joueur peut corriger.
 */

const { etat } = vi.hoisted(() => ({
  etat: {
    /** Appels RPC observés : nom + arguments. */
    rpc: [] as Array<{ nom: string; args: Record<string, unknown> }>,
    /** Réponses par nom de RPC. */
    reponses: {} as Record<string, { data: unknown; error: { message: string } | null }>,
    /** Cookies présents à l'ouverture de l'action. */
    cookies: {} as Record<string, string>,
    /** Cookies POSÉS par l'action. */
    poses: [] as Array<{ nom: string; valeur: string; options: Record<string, unknown> }>,
    /** Cookies EFFACÉS par l'action. */
    effaces: [] as string[],
    /** Commerce résolu par slug, ou `null` (inconnu / droit fermé). */
    commerce: null as { organizationId: string } | null,
    /** Lignes rendues par la résolution de `player_lobbies` par code. */
    lobbyParCode: null as { id: string } | null,
    /** Requêtes PostgREST observées : table + filtres posés. */
    requetes: [] as Array<{ table: string; filtres: Record<string, unknown> }>,
    /** Seaux d'observabilité consommés : clé + règle + événement. */
    pressions: [] as Array<{ parts: unknown[]; evenement: string }>,
    /** Tâches confiées à `after()`. */
    taches: [] as Array<Promise<unknown>>,
  },
}));

const reportErrorMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (nom: string) =>
      etat.cookies[nom] ? { name: nom, value: etat.cookies[nom] } : undefined,
    set: (nom: string, valeur: string, options: Record<string, unknown>) => {
      etat.poses.push({ nom, valeur, options });
    },
    delete: (nom: string) => {
      etat.effaces.push(nom);
      delete etat.cookies[nom];
    },
  })),
}));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    etat.taches.push(Promise.resolve().then(fn));
  },
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: reportErrorMock,
  monitored: (_n: string, f: () => unknown) => f(),
}));
vi.mock("@/lib/lobby-context", async (importOriginal) => ({
  // Le module RÉEL est conservé : le nom du cookie, la génération du jeton et le
  // hachage à domaine séparé doivent s'exécuter pour vrai, sinon les assertions
  // d'identité ci-dessous ne prouveraient plus rien. Seule la résolution du
  // commerce est doublée — elle interroge une base que ce harnais n'a pas.
  ...(await importOriginal<typeof import("@/lib/lobby-context")>()),
  resoudreCommerceLobby: vi.fn(async () => etat.commerce),
}));
vi.mock("@/lib/request-ip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: vi.fn(() => "203.0.113.9"),
  observerPressionIp: vi.fn(
    async (parts: unknown[], _ip: string, _regle: unknown, evenement: string) => {
      etat.pressions.push({ parts, evenement });
    },
  ),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string, args: Record<string, unknown>) => {
      etat.rpc.push({ nom, args });
      return Promise.resolve(etat.reponses[nom] ?? { data: null, error: null });
    },
    from: (table: string) => {
      const filtres: Record<string, unknown> = {};
      etat.requetes.push({ table, filtres });
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.eq = (colonne: string, valeur: unknown) => {
        filtres[colonne] = valeur;
        return c;
      };
      c.in = (colonne: string, valeurs: unknown) => {
        filtres[colonne] = valeurs;
        return c;
      };
      c.gt = (colonne: string, valeur: unknown) => {
        filtres[`${colonne}>`] = valeur;
        return c;
      };
      c.maybeSingle = () => Promise.resolve({ data: etat.lobbyParCode, error: null });
      return c;
    },
  })),
}));

const { createLobby, getLobbyState, joinLobby, leaveLobby, lockLobby } =
  await import("./lobby");
const { hashLobbyToken, lobbyTokenCookieName } = await import("@/lib/lobby-context");

const LOBBY_ID = "11111111-1111-4111-8111-111111111111";
/** Le refus indistinct, sous sa forme TYPÉE — plus une phrase à reconnaître. */
const REFUS_INDISPONIBLE = { ok: true, data: { etat: "indisponible" } };
/** La phrase, elle, ne survit que là où rien ne l'a remplacée : `lockLobby`. */
const INDISPONIBLE = "Cette salle n'est pas disponible.";

/** Le formulaire d'ouverture, tel que l'écran le poste. */
function formCreate(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

/** Vide la file d'`after()` — les compteurs partent en tir-et-oublie. */
async function viderLesTaches(): Promise<void> {
  await Promise.all(etat.taches);
  etat.taches = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  etat.rpc = [];
  etat.reponses = {};
  etat.cookies = {};
  etat.poses = [];
  etat.effaces = [];
  etat.commerce = { organizationId: "org-1" };
  etat.lobbyParCode = { id: LOBBY_ID };
  etat.requetes = [];
  etat.pressions = [];
  etat.taches = [];
});

describe("createLobby — ouvrir une salle", () => {
  beforeEach(() => {
    etat.reponses.create_player_lobby = {
      data: {
        state: "created",
        lobby_id: LOBBY_ID,
        join_code: "ABC234",
        expires_at: "2026-08-21T12:30:00Z",
      },
      error: null,
    };
  });

  it("crée, pose le cookie de CETTE salle, et rend le code de partage", async () => {
    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "cree", lobbyId: LOBBY_ID, joinCode: "ABC234" },
    });
    expect(etat.poses).toHaveLength(1);
    expect(etat.poses[0].nom).toBe(lobbyTokenCookieName(LOBBY_ID));
    expect(etat.poses[0].options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("le JETON ne quitte jamais le serveur — seul son hash part en base", async () => {
    await createLobby(null, formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }));

    const jeton = etat.poses[0].valeur;
    // 43 caractères base64url = 32 octets, soit 256 bits d'entropie. Ce jeton
    // est le SEUL titre d'appartenance à une salle : le deviner, c'est être ce
    // membre.
    expect(jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const appel = etat.rpc.find((r) => r.nom === "create_player_lobby")!;
    expect(appel.args.p_creator_token_hash).toBe(hashLobbyToken(jeton));
    expect(appel.args.p_creator_token_hash).toMatch(/^[0-9a-f]{64}$/);
    // Le jeton lui-même n'est ni envoyé à la base, ni rendu à l'appelant.
    expect(JSON.stringify(appel.args)).not.toContain(jeton);
  });

  it("l'identité GLOBALE `lc-player` n'est ni lue ni envoyée", async () => {
    // La propriété qu'on achète : un téléphone prêté le temps d'une partie ne
    // lie pas deux identités, et la base ne peut pas recoudre les salles.
    etat.cookies["lc-player"] = "identite-globale-du-porteur";

    await createLobby(null, formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }));

    const appel = etat.rpc.find((r) => r.nom === "create_player_lobby")!;
    expect(JSON.stringify(appel.args)).not.toContain("identite-globale-du-porteur");
    expect(appel.args.p_creator_token_hash).not.toBe(
      hashLobbyToken("identite-globale-du-porteur"),
    );
  });

  it("un duo n'envoie jamais autre chose que deux places", async () => {
    await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", capacite: "9", pseudo: "Ana" }),
    );
    expect(etat.rpc[0].args.p_capacite).toBe(2);
  });

  it("consomme le seau IP-SEULE, sans aucune clé de ressource", async () => {
    await createLobby(null, formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }));
    await viderLesTaches();

    // La raison de `pageOpenIp` (wagon 7) : `slug` vient du client. Composer le
    // seau avec lui ouvrirait une série neuve à chaque adresse inventée — donc
    // un balayage invisible en supervision, et une écriture de rate-limit par
    // tour. L'agrégat par IP est le SEUL endroit d'où cette rafale se voit.
    expect(etat.pressions).toHaveLength(1);
    expect(etat.pressions[0].parts).toEqual(["lobby:ip"]);
    expect(etat.pressions[0].evenement).toBe("lobby_ip_ceiling");
  });

  it("compte la pression AVANT toute lecture en base, même sur un commerce inconnu", async () => {
    // Posé après la résolution, ce compteur ne verrait RIEN d'un balayage
    // d'adresses inventées — c'est-à-dire exactement ce qu'il existe pour voir.
    etat.commerce = null;

    const verdict = await createLobby(
      null,
      formCreate({ slug: "adresse-inventee", kind: "duo", pseudo: "Ana" }),
    );
    await viderLesTaches();

    expect(verdict).toEqual(REFUS_INDISPONIBLE);
    expect(etat.pressions).toHaveLength(1);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un compteur en panne ne refuse rien — fail-open (ADR-032)", async () => {
    const { observerPressionIp } = await import("@/lib/request-ip");
    vi.mocked(observerPressionIp).mockRejectedValueOnce(new Error("compteur HS"));

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );
    await viderLesTaches();

    expect(verdict.ok).toBe(true);
    expect(reportErrorMock).toHaveBeenCalledWith("lobby.pressure", expect.anything());
  });

  it("un slug malformé rend le refus INDISTINCT, sans toucher la base", async () => {
    // Distinguer « adresse malformée » d'« adresse inconnue » donnerait un
    // oracle sur les adresses qui existent — et ce n'est PAS une panne : rien
    // n'a échoué, l'adresse de l'URL ne désigne simplement aucun commerce
    // ouvrable. D'où `{ ok: true }` avec un état, comme pour l'adresse inconnue.
    const verdict = await createLobby(
      null,
      formCreate({ slug: "x", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un pseudo refusé garde SON message, et reste une VRAIE erreur", async () => {
    // Ce champ-là est saisi par la personne : lui répondre « indisponible »
    // l'enverrait corriger une adresse qui est correcte. C'est le seul refus de
    // ce chemin qui se corrige au clavier, donc le seul qui mérite `ok: false`.
    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "" }),
    );

    expect(verdict).toEqual({ ok: false, error: "Votre pseudo est requis" });
  });

  it("le quota est un ÉTAT typé, pas un message à reconnaître", async () => {
    // Avant, l'écran classait ce refus en cherchant « beaucoup de salles » dans
    // le texte : reformuler la phrase le faisait retomber dans le cas générique
    // sans qu'aucun test ne bronche. Le discriminant est maintenant un littéral.
    etat.reponses.create_player_lobby = { data: { state: "quota" }, error: null };

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual({ ok: true, data: { etat: "quota" } });
    expect(etat.poses).toHaveLength(0);
  });

  it("aucun cookie n'est posé quand la création échoue", async () => {
    etat.reponses.create_player_lobby = { data: { state: "unavailable" }, error: null };

    await createLobby(null, formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }));

    // Poser en amont laisserait une identité sur l'appareil pour une salle où
    // il n'est jamais entré — et la purge n'a aucune prise sur un navigateur.
    expect(etat.poses).toHaveLength(0);
  });

  it("une panne de transport ne fuit pas le message de la base", async () => {
    etat.reponses.create_player_lobby = {
      data: null,
      error: { message: 'relation "player_lobbies" does not exist' },
    };

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
    expect(reportErrorMock).toHaveBeenCalledWith("lobby.create", expect.stringContaining("relation"));
  });
});

describe("joinLobby — entrer par le code", () => {
  beforeEach(() => {
    etat.reponses.join_player_lobby = {
      data: { state: "joined", lobby_id: LOBBY_ID, kind: "bande", capacite: 6, rang: 3 },
      error: null,
    };
  });

  function form(code = "abc234", pseudo = "Bo"): FormData {
    const fd = new FormData();
    fd.set("code", code);
    fd.set("pseudo", pseudo);
    return fd;
  }

  it("entre, pose le cookie de la salle, et rend la place obtenue", async () => {
    const verdict = await joinLobby(null, form());

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "joined", lobbyId: LOBBY_ID, kind: "bande", capacite: 6, rang: 3 },
    });
    expect(etat.poses[0].nom).toBe(lobbyTokenCookieName(LOBBY_ID));
    expect(etat.rpc.find((r) => r.nom === "join_player_lobby")!.args.p_join_code).toBe(
      "ABC234",
    );
  });

  it("RÉUTILISE le jeton existant : un double-clic ne mange pas deux places", async () => {
    // Sans la résolution du code AVANT l'écriture, le cookie — keyé par
    // l'identifiant de la salle — serait illisible, et chaque tentative
    // présenterait un jeton neuf. L'idempotence de `join_player_lobby` tient sur
    // `(lobby, token_hash)` : deux jetons = deux membres, dans une salle qui en
    // compte deux à douze, et personne n'aurait vu passer d'erreur.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-deja-en-place";

    await joinLobby(null, form());

    expect(etat.rpc.find((r) => r.nom === "join_player_lobby")!.args.p_token_hash).toBe(
      hashLobbyToken("jeton-deja-en-place"),
    );
    // Rien à réécrire : le cookie est déjà celui-là.
    expect(etat.poses).toHaveLength(0);
  });

  it("un code inconnu rend le refus indistinct, sans appeler la RPC", async () => {
    etat.lobbyParCode = null;

    const verdict = await joinLobby(null, form());

    expect(verdict).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc.find((r) => r.nom === "join_player_lobby")).toBeUndefined();
  });

  it("la résolution du code exclut les salles CLOSES et les salles MORTES", async () => {
    // Le filtre est le même que celui de `join_player_lobby`, et c'est ce qui
    // rend « code inventé » et « code périmé » indistinguables PLUS TÔT, dès la
    // page. Sans `expires_at > now()`, un salon mort resterait résolvable et son
    // écran d'attente se peindrait sur une salle que la RPC refuse.
    await joinLobby(null, form());

    const requete = etat.requetes.find((r) => r.table === "player_lobbies")!;
    expect(requete.filtres.join_code).toBe("ABC234");
    expect(requete.filtres.status).toEqual(["lobby", "locked"]);
    expect(typeof requete.filtres["expires_at>"]).toBe("string");
  });

  it("un code MALFORMÉ rend exactement le même refus qu'un code inventé", async () => {
    // C'est le contrat de `join_player_lobby`, et le trahir ici donnerait un
    // oracle sur l'alphabet et la longueur des codes qui ont existé : quatre
    // refus, une seule phrase.
    etat.lobbyParCode = null;
    const invente = await joinLobby(null, form("ABC234"));
    const zeroInterdit = await joinLobby(null, form("ABC230"));
    const tropCourt = await joinLobby(null, form("ABC23"));
    const vide = await joinLobby(null, form(""));

    // Et le contre-test qui donne son sens à l'égalité : sans lui, une action
    // qui refuserait TOUT passerait ces quatre assertions.
    etat.lobbyParCode = { id: LOBBY_ID };
    const valide = await joinLobby(null, form("ABC234"));

    for (const verdict of [invente, zeroInterdit, tropCourt, vide]) {
      expect(verdict).toEqual(REFUS_INDISPONIBLE);
    }
    expect(valide.ok && valide.data.etat).toBe("joined");
  });

  it.each([
    ["full", "complet"],
    ["locked", "verrouille"],
  ])("« %s » garde son état propre, et ne pose aucun cookie", async (etatRpc, motif) => {
    // Ces deux-là SONT distincts dans le contrat SQL, et le rester est utile :
    // « complet » et « fermé » appellent des gestes différents. Ce ne sont pas
    // des pannes pour autant — la salle a répondu, elle a dit non.
    etat.reponses.join_player_lobby = { data: { state: etatRpc }, error: null };

    const verdict = await joinLobby(null, form());

    expect(verdict).toEqual({ ok: true, data: { etat: motif } });
    expect(etat.poses).toHaveLength(0);
  });

  it("une panne de transport reste une PANNE, elle ne devient pas un état", async () => {
    // La frontière que ce lot pose : `{ ok: false }` ne dit plus « la salle a
    // dit non », il dit « rien n'a pu être décidé ». Confondre les deux ferait
    // afficher « cette salle est complète » sur un timeout réseau.
    etat.reponses.join_player_lobby = {
      data: null,
      error: { message: "timeout" },
    };

    const verdict = await joinLobby(null, form());

    expect(verdict).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
    expect(etat.poses).toHaveLength(0);
  });

  it("consomme le seau IP-seule avant toute résolution de code", async () => {
    etat.lobbyParCode = null;
    await joinLobby(null, form());
    await viderLesTaches();

    expect(etat.pressions).toEqual([
      { parts: ["lobby:ip"], evenement: "lobby_ip_ceiling" },
    ]);
  });
});

describe("getLobbyState — le sondage à trois secondes", () => {
  beforeEach(() => {
    etat.reponses.lobby_state = {
      data: {
        state: "ok",
        status: "lobby",
        kind: "duo",
        capacite: 2,
        expires_at: "2026-08-21T12:30:00Z",
        join_code: "ABC234",
        membres: [{ pseudo: "Ana", rang: 1, est_moi: true }],
      },
      error: null,
    };
  });

  it("lit le cookie de CETTE salle et rend la vue mappée", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    const vue = await getLobbyState(LOBBY_ID);

    expect(vue).toMatchObject({ state: "ok", joinCode: "ABC234" });
    expect(etat.rpc[0]).toEqual({
      nom: "lobby_state",
      args: { p_lobby_id: LOBBY_ID, p_token_hash: hashLobbyToken("jeton-membre") },
    });
  });

  it("SANS COOKIE, aucun appel : on n'écrit pas une identité à qui n'a rien rejoint", async () => {
    const vue = await getLobbyState(LOBBY_ID);

    expect(vue).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.poses).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle ne sert à rien ici", async () => {
    // L'isolation par salle, vue depuis la lecture : le porteur d'une identité
    // dans une salle voisine n'obtient rien de celle-ci.
    etat.cookies[lobbyTokenCookieName("22222222-2222-4222-8222-222222222222")] = "ailleurs";

    expect(await getLobbyState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("ne consomme AUCUN seau — un sondage n'est pas une ouverture de salle", async () => {
    // Verser 4 800 lectures en dix minutes (quatre écrans ouverts) dans
    // `lobbyIp` noierait le seul signal que ce seau existe pour porter.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";

    await getLobbyState(LOBBY_ID);
    await viderLesTaches();

    expect(etat.pressions).toHaveLength(0);
  });

  it("un identifiant qui n'est pas un UUID ne touche pas la base", async () => {
    expect(await getLobbyState("pas-un-uuid")).toEqual({ state: "unavailable" });
    expect(etat.rpc).toHaveLength(0);
  });

  it("une panne de lecture rend l'état muet, jamais une exception", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.lobby_state = { data: null, error: { message: "timeout" } };

    expect(await getLobbyState(LOBBY_ID)).toEqual({ state: "unavailable" });
    expect(reportErrorMock).toHaveBeenCalledWith("lobby.state", "timeout");
  });
});

describe("lockLobby — fermer la porte", () => {
  it("présente le jeton de la salle et rend la nouvelle date de mort", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";
    etat.reponses.lock_player_lobby = {
      data: { state: "locked", expires_at: "2026-08-21T16:00:00Z" },
      error: null,
    };

    const verdict = await lockLobby(LOBBY_ID);

    expect(verdict).toEqual({ ok: true, data: { expiresAt: "2026-08-21T16:00:00Z" } });
    expect(etat.rpc[0].args).toEqual({
      p_lobby_id: LOBBY_ID,
      p_creator_token_hash: hashLobbyToken("jeton-hote"),
    });
  });

  it("un membre ordinaire est refusé PAR LA BASE, pas par une garde recopiée ici", async () => {
    // `lock_player_lobby` compare le hash à `creator_token_hash`. Rejouer cette
    // vérification côté application dupliquerait un arbitrage déjà rendu, et la
    // copie finirait par diverger de l'original.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-simple-membre";
    etat.reponses.lock_player_lobby = { data: { state: "unavailable" }, error: null };

    expect(await lockLobby(LOBBY_ID)).toEqual({ ok: false, error: INDISPONIBLE });
    expect(etat.rpc).toHaveLength(1);
  });

  it("sans cookie, rien n'est tenté", async () => {
    expect(await lockLobby(LOBBY_ID)).toEqual({ ok: false, error: INDISPONIBLE });
    expect(etat.rpc).toHaveLength(0);
  });
});

describe("leaveLobby — sortir", () => {
  it("sort, rend `left`, ET EFFACE le cookie de la salle", async () => {
    // Le cookie est ce que la PAGE regarde pour décider quel écran peindre : le
    // laisser en place ferait revenir le partant, au rechargement suivant, dans
    // une salle d'attente où `lobby_state` ne le reconnaît plus. La sortie doit
    // donc s'écrire des deux côtés, en une seule action.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.leave_player_lobby = { data: { state: "left" }, error: null };

    expect(await leaveLobby(LOBBY_ID)).toEqual({ ok: true, data: { state: "left" } });
    expect(etat.effaces).toEqual([lobbyTokenCookieName(LOBBY_ID)]);
  });

  it("SANS COOKIE, c'est `left` sans appel — ne pas y être EST une sortie", async () => {
    // Répondre autre chose laisserait un écran croire qu'il est encore dans une
    // salle dont il n'a aucune identité.
    expect(await leaveLobby(LOBBY_ID)).toEqual({ ok: true, data: { state: "left" } });
    expect(etat.rpc).toHaveLength(0);
  });

  it("un identifiant illisible vaut aussi `left`", async () => {
    expect(await leaveLobby("pas-un-uuid")).toEqual({ ok: true, data: { state: "left" } });
  });

  it("une porte déjà fermée est la SEULE exception, et le cookie RESTE", async () => {
    // L'hôte a verrouillé : on n'est pas sorti. Jeter l'identité laisserait un
    // membre sans titre dans sa propre salle, incapable d'en relire l'état.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-membre";
    etat.reponses.leave_player_lobby = { data: { state: "locked" }, error: null };

    expect(await leaveLobby(LOBBY_ID)).toEqual({ ok: true, data: { state: "locked" } });
    expect(etat.effaces).toHaveLength(0);
  });
});
