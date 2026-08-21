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
    /** Réponses par nom de RPC. `code` porte le SQLSTATE quand il compte. */
    reponses: {} as Record<
      string,
      { data: unknown; error: { message: string; code?: string } | null }
    >,
    /** Cookies présents à l'ouverture de l'action. */
    cookies: {} as Record<string, string>,
    /** Cookies POSÉS par l'action. */
    poses: [] as Array<{ nom: string; valeur: string; options: Record<string, unknown> }>,
    /** Cookies EFFACÉS par l'action. */
    effaces: [] as string[],
    /** Commerce résolu par slug, ou `null` (inconnu / droit fermé). */
    commerce: null as { organizationId: string } | null,
    /**
     * Lignes rendues par la résolution de `player_lobbies` par code.
     *
     * `status` et `expires_at` sont LUS depuis L17 : le résolveur laisse passer
     * les salles closes de quelques heures (pour que le résultat d'une partie
     * survive à un rechargement) et rend `vivante`, dont dépend le droit
     * d'ENTRER. Un harnais qui les omettrait rendrait toute salle non vivante,
     * et tous les tests de jointure verdiraient par le mauvais chemin.
     */
    lobbyParCode: null as
      | { id: string; status?: string; expires_at?: string }
      | null,
    /** Requêtes PostgREST observées : table + filtres posés. */
    requetes: [] as Array<{ table: string; filtres: Record<string, unknown> }>,
    /** Seaux d'observabilité consommés : clé + règle + événement. */
    pressions: [] as Array<{ parts: unknown[]; evenement: string }>,
    /** `TURNSTILE_SECRET_KEY` est-elle posée ? (moitié serveur de la condition) */
    turnstileConfigure: false,
    /** Ce que rend Cloudflare pour le jeton présenté. */
    turnstileVerdict: true,
    /** Ce qui est réellement parti vers Cloudflare : jeton + IP + action. */
    turnstileAppels: [] as Array<{
      jeton: string | undefined;
      ip: string | undefined;
      action: string | undefined;
    }>,
    /** Tâches confiées à `after()`. */
    taches: [] as Array<Promise<unknown>>,
    /**
     * Ce que rend `gardeEditeurVitrine` — la SEULE source de l'organisation et
     * de l'acteur sur les deux chemins de supervision.
     */
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
vi.mock("next/cache", () => ({
  revalidatePath: (chemin: string) => {
    etat.revalidations.push(chemin);
  },
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: reportErrorMock,
  monitored: (_n: string, f: () => unknown) => f(),
}));
// Le challenge est DOUBLÉ jusqu'à Cloudflare exclu — ce qu'on vérifie ici est la
// CONDITION (les deux clés) et l'ORDRE (avant toute lecture), pas le protocole
// de vérification, qui a ses propres tests.
vi.mock("@/lib/turnstile", () => ({
  turnstileEnabled: () => etat.turnstileConfigure,
  verifyTurnstile: (jeton: string | undefined, ip?: string, action?: string) => {
    etat.turnstileAppels.push({ jeton, ip, action });
    return Promise.resolve(etat.turnstileVerdict);
  },
}));
// La garde est DOUBLÉE, pas contournée : elle interroge une session et un
// abonnement que ce harnais n'a pas. Ce qu'on vérifie ici est qu'elle passe la
// PREMIÈRE, et que l'organisation comme l'acteur ne sortent que d'elle.
vi.mock("@/lib/vitrine-context", () => ({
  gardeEditeurVitrine: vi.fn(async () => etat.garde),
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

const {
  closeOrgLobby,
  createLobby,
  getLobbyState,
  joinLobby,
  kickLobbyMember,
  leaveLobby,
  lockLobby,
} = await import("./lobby");
const { hashLobbyToken, lobbyTokenCookieName, loadOrgLobbies } = await import(
  "@/lib/lobby-context"
);

const LOBBY_ID = "11111111-1111-4111-8111-111111111111";
/**
 * Une salle OUVRABLE telle que la base la rend : `locked`/`lobby` et non
 * expirée. Fabriquée à chaque appel — la date est calculée, pas figée, sinon
 * elle vieillirait avec le fichier et le jour viendrait où toute salle du
 * harnais serait morte.
 */
const SALLE_VIVANTE = () => ({
  id: LOBBY_ID,
  status: "lobby",
  expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
});
/**
 * L'organisation et l'acteur de la SESSION — de vrais UUID, et c'est nécessaire :
 * `orgLobbiesSchema` et `closeOrgLobbySchema` les exigent, précisément pour
 * qu'un identifiant malformé ne parte jamais vers une RPC qui lèverait une 22023.
 * Un harnais qui les aurait nourris de « org-1 » aurait testé le refus du schéma
 * en croyant tester la fermeture.
 */
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const ACTEUR_ID = "44444444-4444-4444-8444-444444444444";
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
  etat.lobbyParCode = SALLE_VIVANTE();
  etat.requetes = [];
  etat.pressions = [];
  etat.taches = [];
  etat.garde = { ok: true, organizationId: ORG_ID, userId: ACTEUR_ID };
  etat.revalidations = [];
  // L'ÉTAT DE PRODUCTION D'AUJOURD'HUI, et le défaut de tous les tests de ce
  // fichier : aucune clé posée, donc aucun challenge opposé. Les seuls tests qui
  // en dévient sont ceux qui l'annoncent.
  etat.turnstileConfigure = false;
  etat.turnstileVerdict = true;
  etat.turnstileAppels = [];
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";
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

/**
 * LE CHALLENGE ANTI-ROBOT DE LA CRÉATION (LOBBY-1, fermeture de E-1).
 *
 * Ce que ces tests achètent tient en trois propriétés, et la PREMIÈRE est la
 * plus importante : le remède est **inerte tant que les clés ne sont pas
 * posées**. C'est ce qui autorise à le livrer aujourd'hui sans rien changer au
 * parcours d'une tablée de café — et à le laisser s'armer seul le jour où le
 * propriétaire pose les clés déjà requises par « Réserver » depuis L4.
 *
 *   1. Sans clés → création INCHANGÉE, aucun appel sortant.
 *   2. Avec clés + jeton valide → création inchangée elle aussi.
 *   3. Avec clés + jeton invalide ou absent → refus, et AUCUNE RPC : rien n'est
 *      lu, rien n'est écrit, aucun quota consommé, aucun oracle sur le slug.
 *
 * Le seau d'observation, lui, est consommé DANS TOUS LES CAS — y compris au
 * refus. Une attaque bloquée mais invisible au capteur serait un mauvais
 * échange : on saurait qu'elle ne passe plus, jamais qu'elle a lieu.
 */
describe("createLobby — le challenge anti-robot (LOBBY-1)", () => {
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

  it("n'oppose AUCUN challenge tant que les clés ne sont pas posées", async () => {
    // L'état de la production au jour de la livraison. `turnstileVerdict` est
    // mis à `false` exprès : si le challenge était consulté, la création
    // échouerait — le succès prouve donc qu'il ne l'est pas.
    etat.turnstileConfigure = false;
    etat.turnstileVerdict = false;

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "cree", lobbyId: LOBBY_ID, joinCode: "ABC234" },
    });
    // Aucun octet n'est parti vers Cloudflare : pas de tiers script, pas de
    // latence, rien à expliquer au joueur.
    expect(etat.turnstileAppels).toHaveLength(0);
  });

  it("exige la clé PUBLIQUE aussi : sans widget, pas de refus sans issue", async () => {
    // La moitié serveur seule ne suffit pas. Un secret posé sans clé publique
    // donnerait un écran sans contrôle à valider et un refus qu'aucun geste ne
    // lève — motif `reserverChallengeDisponible`.
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "";

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict.ok).toBe(true);
    expect(etat.turnstileAppels).toHaveLength(0);
  });

  it("laisse passer la création quand le jeton est valide", async () => {
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const verdict = await createLobby(
      null,
      formCreate({
        slug: "le-comptoir",
        kind: "duo",
        pseudo: "Ana",
        turnstileToken: "jeton-valide",
      }),
    );

    expect(verdict).toEqual({
      ok: true,
      data: { etat: "cree", lobbyId: LOBBY_ID, joinCode: "ABC234" },
    });
    // Le jeton VALIDÉ part, avec l'IP du seau et le littéral d'action que le
    // widget déclare. Une divergence d'orthographe ferait échouer la
    // vérification côté Cloudflare sans qu'aucun type ne bronche.
    expect(etat.turnstileAppels).toEqual([
      { jeton: "jeton-valide", ip: "203.0.113.9", action: "lobby-create" },
    ]);
  });

  it("REFUSE avant toute RPC quand le jeton est invalide", async () => {
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const verdict = await createLobby(
      null,
      formCreate({
        slug: "le-comptoir",
        kind: "duo",
        pseudo: "Ana",
        turnstileToken: "jeton-refuse",
      }),
    );

    // Une PANNE du point de vue du joueur, pas un refus doux typé : il n'a rien
    // à corriger dans sa saisie, il a un contrôle à rejouer.
    expect(verdict).toEqual({
      ok: false,
      error: "Vérification anti-robot échouée, réessayez.",
    });
    // LE POINT DE E-1 : le quota n'est pas touché, parce que rien n'est appelé.
    expect(etat.rpc).toHaveLength(0);
    expect(etat.poses).toHaveLength(0);
  });

  it("REFUSE de la même façon quand aucun jeton n'accompagne le formulaire", async () => {
    // Le cas de l'appel POSTé en direct, sans passer par l'écran : c'est
    // exactement celui de l'attaquant de E-1, qui n'a aucun widget à résoudre.
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const verdict = await createLobby(
      null,
      formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }),
    );

    expect(verdict).toEqual({
      ok: false,
      error: "Vérification anti-robot échouée, réessayez.",
    });
    expect(etat.turnstileAppels).toEqual([
      { jeton: undefined, ip: "203.0.113.9", action: "lobby-create" },
    ]);
    expect(etat.rpc).toHaveLength(0);
  });

  it("compte la pression MÊME au refus — une attaque bloquée reste visible", async () => {
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    await createLobby(null, formCreate({ slug: "le-comptoir", kind: "duo", pseudo: "Ana" }));
    await viderLesTaches();

    // Le seau est consommé AVANT le challenge : sans cela, une rafale refusée
    // n'apparaîtrait nulle part et le capteur `lobbyIp` mesurerait le trafic
    // honnête seul.
    expect(etat.pressions).toEqual([
      { parts: ["lobby:ip"], evenement: "lobby_ip_ceiling" },
    ]);
  });

  it("refuse un jeton hors borne SANS rien envoyer à Cloudflare", async () => {
    etat.turnstileConfigure = true;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";

    const verdict = await createLobby(
      null,
      formCreate({
        slug: "le-comptoir",
        kind: "duo",
        pseudo: "Ana",
        turnstileToken: "x".repeat(2049),
      }),
    );

    // Le schéma tranche en premier : la requête sortante ne part jamais, et le
    // joueur lit la phrase du challenge et non le message par défaut de zod.
    expect(verdict).toEqual({
      ok: false,
      error: "Vérification anti-robot échouée, réessayez.",
    });
    expect(etat.turnstileAppels).toHaveLength(0);
    expect(etat.rpc).toHaveLength(0);
  });

  it("n'oppose AUCUN challenge à `joinLobby` — l'invité ne crée rien", async () => {
    // Le cœur de l'arbitrage : le quota se prend à la CRÉATION. Quelqu'un qui
    // scanne un code est déjà assis à la table ; lui faire résoudre un contrôle
    // mettrait la friction là où elle ne protège rien.
    etat.turnstileConfigure = true;
    etat.turnstileVerdict = false;
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    etat.reponses.join_player_lobby = {
      data: { state: "joined", lobby_id: LOBBY_ID, kind: "bande", capacite: 6, rang: 3 },
      error: null,
    };

    const fd = new FormData();
    fd.set("code", "abc234");
    fd.set("pseudo", "Bo");
    const verdict = await joinLobby(null, fd);

    expect(verdict.ok).toBe(true);
    expect(etat.turnstileAppels).toHaveLength(0);
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

  it("la résolution laisse passer les salles CLOSES, mais on n'y ENTRE pas", async () => {
    // ── CE QUE CE TEST A CESSÉ DE DIRE, ET POURQUOI ──
    //
    // Il exigeait `status in ('lobby','locked')` — ce qui perdait le résultat
    // d'une partie AU RECHARGEMENT : la révélation du Duo Miroir ferme la salle
    // et ramène sa date de mort à l'instant même, donc l'écran de résultat
    // devenait introuvable pour ceux-là mêmes qui venaient d'y jouer (CI L17).
    //
    // La résolution accepte donc `closed` sur une fenêtre de relecture, et
    // c'est `vivante` qui porte désormais le droit d'ENTRER. Les deux moitiés
    // sont vérifiées ici, parce que l'une sans l'autre serait une régression :
    // élargir le filtre sans refuser l'entrée rouvrirait une partie finie.
    await joinLobby(null, form());

    const requete = etat.requetes.find((r) => r.table === "player_lobbies")!;
    expect(requete.filtres.join_code).toBe("ABC234");
    expect(requete.filtres.status).toEqual(["lobby", "locked", "closed"]);
    expect(typeof requete.filtres["expires_at>"]).toBe("string");
  });

  it("une salle CLOSE ne se rejoint pas — même refus qu'un code inventé", async () => {
    etat.lobbyParCode = {
      id: LOBBY_ID,
      status: "closed",
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    };

    const verdict = await joinLobby(null, form());

    expect(verdict).toEqual(REFUS_INDISPONIBLE);
    // ET SURTOUT : la RPC n'est pas appelée. Le refus est décidé par `vivante`,
    // pas par la base — donc aucune place n'est prise, aucun cookie posé.
    expect(etat.rpc.find((r) => r.nom === "join_player_lobby")).toBeUndefined();
    expect(etat.poses).toHaveLength(0);
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
    etat.lobbyParCode = SALLE_VIVANTE();
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

describe("kickLobbyMember — l'hôte retire une place", () => {
  beforeEach(() => {
    etat.reponses.kick_player_lobby = {
      data: { state: "ok", kicked: true },
      error: null,
    };
  });

  it("présente le jeton de L'HÔTE et le RANG de la cible", async () => {
    // Le cookie de l'appelant sert à prouver qu'il est le créateur — c'est la
    // seule chose que la RPC vérifie. La cible, elle, est désignée par le rang
    // que `lobby_state` affiche : cette lecture ne rend jamais l'empreinte de
    // personne (STATE-7 / STATE-8), donc l'application ne POURRAIT pas envoyer
    // le jeton d'un autre membre même si elle le voulait.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";

    const verdict = await kickLobbyMember(LOBBY_ID, 2);

    expect(verdict).toEqual({ ok: true, data: { etat: "retire" } });
    expect(etat.rpc[0]).toEqual({
      nom: "kick_player_lobby",
      args: {
        p_lobby_id: LOBBY_ID,
        p_creator_token_hash: hashLobbyToken("jeton-hote"),
        p_rang: 2,
      },
    });
  });

  it("`kicked:false` est un SUCCÈS distinct — la place était déjà libre", async () => {
    // L'occupant venait de partir de lui-même : l'état voulu par l'hôte est
    // atteint, et lui montrer une erreur l'enverrait réparer ce qui est fait.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";
    etat.reponses.kick_player_lobby = {
      data: { state: "ok", kicked: false },
      error: null,
    };

    expect(await kickLobbyMember(LOBBY_ID, 5)).toEqual({
      ok: true,
      data: { etat: "deja-parti" },
    });
  });

  it("un membre ordinaire est refusé PAR LA BASE, comme le verrou", async () => {
    // Aucune garde d'hôte n'est recopiée ici : `kick_player_lobby` compare le
    // hash à `creator_token_hash`, et une copie côté application finirait par
    // diverger de l'original.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-simple-membre";
    etat.reponses.kick_player_lobby = { data: { state: "unavailable" }, error: null };

    expect(await kickLobbyMember(LOBBY_ID, 1)).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(1);
  });

  it.each([
    ["rang nul", 0],
    ["rang négatif", -3],
    ["rang fractionnaire", 1.5],
  ])("%s ne part JAMAIS en base — la 22023 est une exception, pas un refus", async (
    _cas,
    rang,
  ) => {
    // `kick_player_lobby` lève `invalid rank` (22023) sur ces valeurs. La
    // laisser partir ferait remonter une panne générique là où il n'y a rien à
    // réparer : le schéma la rend impossible à provoquer.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";

    expect(await kickLobbyMember(LOBBY_ID, rang)).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un rang au-delà de la liste PART, lui — c'est la base qui répond", async () => {
    // Parité dans l'autre sens : la RPC rend `kicked:false` sur un rang
    // inoccupé. Le refuser ici ajouterait une garde que le SQL n'a pas.
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";
    etat.reponses.kick_player_lobby = {
      data: { state: "ok", kicked: false },
      error: null,
    };

    expect(await kickLobbyMember(LOBBY_ID, 99)).toEqual({
      ok: true,
      data: { etat: "deja-parti" },
    });
    expect(etat.rpc[0].args.p_rang).toBe(99);
  });

  it("sans cookie, rien n'est tenté — il n'y a pas d'hôte à présenter", async () => {
    expect(await kickLobbyMember(LOBBY_ID, 2)).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("le cookie d'une AUTRE salle ne retire personne ici", async () => {
    etat.cookies[lobbyTokenCookieName("22222222-2222-4222-8222-222222222222")] =
      "jeton-hote-ailleurs";

    expect(await kickLobbyMember(LOBBY_ID, 2)).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("un identifiant qui n'est pas un UUID ne touche pas la base", async () => {
    expect(await kickLobbyMember("pas-un-uuid", 2)).toEqual(REFUS_INDISPONIBLE);
    expect(etat.rpc).toHaveLength(0);
  });

  it("ne consomme AUCUN seau — le geste est borné par le cookie de la salle", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";

    await kickLobbyMember(LOBBY_ID, 2);
    await viderLesTaches();

    expect(etat.pressions).toHaveLength(0);
  });

  it("une panne de transport reste une PANNE, et ne fuit pas le message de la base", async () => {
    etat.cookies[lobbyTokenCookieName(LOBBY_ID)] = "jeton-hote";
    etat.reponses.kick_player_lobby = {
      data: null,
      error: { message: 'function "kick_player_lobby" does not exist' },
    };

    expect(await kickLobbyMember(LOBBY_ID, 2)).toEqual({
      ok: false,
      error: "Une erreur est survenue, réessayez.",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "lobby.kick",
      expect.stringContaining("kick_player_lobby"),
    );
  });
});

// ════════════════════════════════════════════════════════════
// LA SUPERVISION COMMERÇANT — contrepartie du finding E-1
//
// Le quota BORNE l'abus, il ne le ferme pas : trois requêtes suffisent à tenir
// une place jusqu'à l'expiration. Ce qui a été décidé à la place est que le
// déni soit VISIBLE (`loadOrgLobbies`) et RÉVERSIBLE (`closeOrgLobby`). Deux
// propriétés se gravent ici, et aucune n'est du confort :
//
//   1. LA GARDE PASSE LA PREMIÈRE, sur les DEUX chemins. Les deux RPC sont
//      `security definer` et `org_player_lobbies` ne vérifie AUCUNE
//      appartenance : sans la garde, l'organisation deviendrait un paramètre.
//   2. L'ORGANISATION ET L'ACTEUR VIENNENT DE LA SESSION. Le formulaire ne
//      porte que `lobby_id` ; un acteur reçu du client ferait de la ligne
//      d'audit `lobby.closed_by_org` une déclaration sur l'honneur.
// ════════════════════════════════════════════════════════════

/** Le formulaire de fermeture, tel que la ligne de supervision le poste. */
function formFermer(champs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.set(k, v);
  return fd;
}

describe("loadOrgLobbies — le commerçant VOIT ses salles", () => {
  beforeEach(() => {
    etat.reponses.org_player_lobbies = {
      data: {
        lobbies: [
          {
            id: LOBBY_ID,
            kind: "bande",
            status: "lobby",
            membres: 4,
            created_at: "2026-08-21T12:00:00Z",
            expires_at: "2026-08-21T12:30:00Z",
          },
        ],
      },
      error: null,
    };
  });

  it("passe l'organisation de la SESSION, et rend les salles lues", async () => {
    const ctx = await loadOrgLobbies();

    expect(ctx).toMatchObject({
      ok: true,
      organizationId: ORG_ID,
      salons: [
        {
          id: LOBBY_ID,
          kind: "bande",
          status: "lobby",
          membres: 4,
          createdAt: "2026-08-21T12:00:00Z",
          expiresAt: "2026-08-21T12:30:00Z",
        },
      ],
    });
    expect(etat.rpc).toEqual([
      { nom: "org_player_lobbies", args: { p_organization_id: ORG_ID } },
    ]);
    // L'ORIGINE DES DURÉES est stampée par le chargeur, jamais par l'écran :
    // « ouvert il y a 12 min » se compte depuis la LECTURE, et un composant qui
    // lirait l'heure lui-même violerait la règle de pureté de React.
    expect(ctx.ok && Number.isFinite(Date.parse(ctx.luA))).toBe(true);
  });

  it("LA GARDE D'ABORD : refusée, la base n'est pas touchée", async () => {
    // `org_player_lobbies` rend les salles de l'organisation qu'on lui NOMME.
    // C'est cette garde, et elle seule, qui tient l'appartenance : la placer
    // après la lecture reviendrait à ne pas l'avoir.
    etat.garde = { ok: false, error: "Votre offre ne comprend pas la Vitrine." };

    expect(await loadOrgLobbies()).toEqual({
      ok: false,
      error: "Votre offre ne comprend pas la Vitrine.",
    });
    expect(etat.rpc).toHaveLength(0);
  });

  it("une panne de lecture rend la liste VIDE, jamais un refus de droit", async () => {
    // Motif de `loadVitrineDashboardContext` : le commerçant a le droit, il n'a
    // simplement rien à afficher. Confondre les deux lui ferait croire que son
    // abonnement a changé.
    etat.reponses.org_player_lobbies = {
      data: null,
      error: { message: 'function "org_player_lobbies" does not exist' },
    };

    expect(await loadOrgLobbies()).toMatchObject({
      ok: true,
      organizationId: ORG_ID,
      salons: [],
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "lobby.org_lobbies",
      expect.stringContaining("org_player_lobbies"),
    );
  });

  it("un document corrompu rend une liste vide, pas un écran cassé", async () => {
    etat.reponses.org_player_lobbies = {
      data: { lobbies: "surprise" },
      error: null,
    };

    expect(await loadOrgLobbies()).toMatchObject({ ok: true, salons: [] });
  });

  it("ne consomme AUCUN seau — c'est une lecture derrière une session", async () => {
    await loadOrgLobbies();
    await viderLesTaches();

    expect(etat.pressions).toHaveLength(0);
  });
});

describe("closeOrgLobby — le commerçant reprend sa place", () => {
  beforeEach(() => {
    etat.reponses.close_player_lobby_as_org = {
      data: { state: "ok", closed: true },
      error: null,
    };
  });

  it("ferme, avec l'acteur de la SESSION, et revalide le tableau de bord", async () => {
    const verdict = await closeOrgLobby(
      null,
      formFermer({ lobby_id: LOBBY_ID }),
    );

    expect(verdict).toEqual({ ok: true, data: { etat: "ferme" } });
    expect(etat.rpc).toEqual([
      {
        nom: "close_player_lobby_as_org",
        args: {
          p_organization_id: ORG_ID,
          p_lobby_id: LOBBY_ID,
          p_actor: ACTEUR_ID,
        },
      },
    ]);
    expect(etat.revalidations).toEqual(["/dashboard/vitrine"]);
  });

  it("L'ACTEUR NE VIENT PAS DU FORMULAIRE, même posté en toutes lettres", async () => {
    // `.strict()` refuserait une clé de plus, mais elle n'a même pas de chemin
    // pour arriver : l'action ne lit que `lobby_id`. La ligne d'audit
    // `lobby.closed_by_org` doit nommer qui a VRAIMENT fermé la salle.
    await closeOrgLobby(
      null,
      formFermer({
        lobby_id: LOBBY_ID,
        actor: "22222222-2222-4222-8222-222222222222",
        organization_id: "org-du-voisin",
      }),
    );

    expect(etat.rpc[0].args).toEqual({
      p_organization_id: ORG_ID,
      p_lobby_id: LOBBY_ID,
      p_actor: ACTEUR_ID,
    });
  });

  it("LA GARDE D'ABORD : refusée, ni lecture du formulaire ni appel", async () => {
    // Et le message est CELUI DE LA GARDE, pas le refus indistinct : un
    // commerçant sans droit doit lire pourquoi, il n'est pas un inconnu qui
    // sonde des identifiants de salle.
    etat.garde = { ok: false, error: "Action non autorisée" };

    expect(
      await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID })),
    ).toEqual({ ok: false, error: "Action non autorisée" });
    expect(etat.rpc).toHaveLength(0);
    expect(etat.revalidations).toHaveLength(0);
  });

  it("garde « deja-ferme » distinct, ET revalide quand même", async () => {
    // C'est le cas où la revalidation sert le PLUS : la ligne cliquée ne
    // correspond plus à rien en base, donc l'écran est en retard — et c'est
    // exactement ce qu'un rafraîchissement corrige.
    etat.reponses.close_player_lobby_as_org = {
      data: { state: "ok", closed: false },
      error: null,
    };

    expect(
      await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID })),
    ).toEqual({ ok: true, data: { etat: "deja-ferme" } });
    expect(etat.revalidations).toEqual(["/dashboard/vitrine"]);
  });

  it("rejouer la fermeture est un non-événement, pas une erreur", async () => {
    await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID }));
    etat.reponses.close_player_lobby_as_org = {
      data: { state: "ok", closed: false },
      error: null,
    };
    const second = await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID }));

    expect(second).toEqual({ ok: true, data: { etat: "deja-ferme" } });
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("le 42501 est un RÉSULTAT et non une panne, mais il laisse une trace", async () => {
    // Acteur non habilité, salle inconnue, salle d'un AUTRE locataire : un seul
    // refus sans corps, pour ne pas donner à un commerçant un compteur
    // d'activité de ses voisins. Le cas banal — la salle a été purgée entre
    // l'affichage et le clic — n'a rien que personne doive réparer, d'où
    // l'issue `indisponible` et non `{ ok: false }`.
    //
    // MAIS LE MÊME CODE COUVRE « l'appelant n'est pas `service_role` »
    // (contre-revue L16, INFO) : une clé de service mal configurée rendrait
    // alors « indisponible » à tout le monde et pour toujours, sans qu'aucune
    // alerte ne parte. La ligne d'observation est le seul signal qui
    // distinguerait cette panne d'une course — elle ne change ni l'issue rendue
    // au commerçant, ni l'absence de revalidation.
    etat.reponses.close_player_lobby_as_org = {
      data: null,
      error: { message: "not authorized", code: "42501" },
    };

    expect(
      await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID })),
    ).toEqual(REFUS_INDISPONIBLE);
    expect(reportErrorMock).toHaveBeenCalledWith(
      "lobby.close_as_org.refus",
      "not authorized",
    );
    expect(etat.revalidations).toHaveLength(0);
  });

  it("une VRAIE panne reste une panne, et ne fuit pas le message de la base", async () => {
    etat.reponses.close_player_lobby_as_org = {
      data: null,
      error: { message: 'function "close_player_lobby_as_org" does not exist' },
    };

    expect(
      await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID })),
    ).toEqual({ ok: false, error: "Une erreur est survenue, réessayez." });
    expect(reportErrorMock).toHaveBeenCalledWith(
      "lobby.close_as_org",
      expect.stringContaining("close_player_lobby_as_org"),
    );
  });

  it.each([
    ["identifiant absent", {}],
    ["identifiant qui n'est pas un UUID", { lobby_id: "pas-un-uuid" }],
  ])("%s → refus indistinct, sans toucher la base", async (_cas, champs) => {
    expect(await closeOrgLobby(null, formFermer(champs))).toEqual(
      REFUS_INDISPONIBLE,
    );
    expect(etat.rpc).toHaveLength(0);
    expect(etat.revalidations).toHaveLength(0);
  });

  it("un document illisible retombe sur le refus indistinct", async () => {
    // Motif de `mapKickLobby` : `closed` EST le contenu de la réponse. Le
    // deviner ferait dire « déjà fermé » d'une fermeture dont on ne sait rien.
    etat.reponses.close_player_lobby_as_org = {
      data: { state: "ok" },
      error: null,
    };

    expect(
      await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID })),
    ).toEqual(REFUS_INDISPONIBLE);
    expect(etat.revalidations).toHaveLength(0);
  });

  it("ne consomme AUCUN seau — le geste est borné par la session commerçant", async () => {
    await closeOrgLobby(null, formFermer({ lobby_id: LOBBY_ID }));
    await viderLesTaches();

    expect(etat.pressions).toHaveLength(0);
  });
});
