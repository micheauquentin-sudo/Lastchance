import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// getEventState — UN SEUL VOYAGE, ET LA MESURE NE FAIT PLUS ATTENDRE
//
// Trois allers-retours partaient à CHAQUE tour de sondage de CHAQUE téléphone
// de la salle : la session, l'organisation (garde de module), puis
// `event_public_state`. Les deux premiers sont descendus dans
// `event_etat_partage` (migration 20260929120000, prouvée par pgTAP) ; ce
// fichier atteste que l'application ne les rejoue plus.
//
// Il atteste aussi la seconde moitié du correctif, moins visible : le compteur
// de pression était ATTENDU avant de rendre l'état. C'est une écriture, et elle
// s'ajoutait à la latence de chaque tour. Elle part maintenant en tir-et-oublie
// — l'observabilité reste, la latence part.
// ────────────────────────────────────────────────────────────

const SERVER_NOW = "2026-08-17T21:00:00.000Z";

const { etat } = vi.hoisted(() => ({
  etat: {
    /** Appels RPC observés, dans l'ordre. */
    rpc: [] as string[],
    /** Lectures de table via le client service role (doivent rester à zéro). */
    lecturesTable: 0,
    /** Réponse de `event_etat_partage`. */
    partage: null as unknown,
    /** Jeton du cookie de session, ou null (visiteur / écran de salle). */
    cookie: null as string | null,
    /** Compteur de pression : nombre de départs observés. */
    pressions: 0,
    /** La mesure de pression ne résout jamais (panne du compteur). */
    pressionBloquee: false,
    /** La mesure de pression rejette. */
    pressionRejette: false,
    /** Tâches confiées à `after()` — le runtime les retient après la réponse. */
    taches: [] as Array<Promise<unknown>>,
  },
}));

const reportErrorMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (nom: string) =>
      etat.cookie && nom.startsWith("lc-event-")
        ? { name: nom, value: etat.cookie }
        : undefined,
    set: vi.fn(),
  })),
}));
/**
 * `after()` : le runtime retient la tâche jusqu'à son terme, APRÈS la réponse.
 * Le mock la déclenche et garde sa promesse — c'est ce que le test observe.
 */
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    etat.taches.push(Promise.resolve().then(fn));
  },
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({ user: null, organization: null, role: null })),
}));
vi.mock("@/lib/event-realtime", () => ({
  broadcastEventRefresh: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: reportErrorMock,
  monitored: (_n: string, f: () => unknown) => f(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: () => ({}) })),
}));

/** Le compteur de pression, dont la lenteur ne doit plus se voir. */
vi.mock("@/lib/request-ip", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/request-ip")>()),
  clientIpFromHeaders: vi.fn(() => "203.0.113.9"),
  observerPressionIp: vi.fn(() => {
    etat.pressions += 1;
    if (etat.pressionRejette) return Promise.reject(new Error("compteur HS"));
    if (etat.pressionBloquee) return new Promise<void>(() => undefined);
    return Promise.resolve();
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string) => {
      etat.rpc.push(nom);
      if (nom === "event_etat_partage") {
        return Promise.resolve({ data: etat.partage, error: null });
      }
      return Promise.resolve({ data: { you: null }, error: null });
    },
    from: () => {
      etat.lecturesTable += 1;
      const c: Record<string, unknown> = {};
      const self = () => c;
      for (const m of ["select", "eq"]) c[m] = self;
      c.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return c;
    },
  })),
}));

const { getEventState } = await import("./events");

function partagePlein(sessionId: string): Record<string, unknown> {
  return {
    state: "ok",
    session: {
      id: sessionId,
      state_revision: 4,
      status: "live",
      phase: "question_active",
      join_code: "WXYZ98",
      reward_label: "Une part de tarte",
      reward_stock: 2,
      reward_claimed_count: 0,
      max_participants: 500,
    },
    question: null,
    correct_option_id: null,
    distribution: null,
    leaderboard: [],
    server_now: SERVER_NOW,
  };
}

/** Le cache de `chargerEtatLive` vit en mémoire : une session par cas. */
let compteur = 0;
function nouvelleSession(): string {
  compteur += 1;
  return `00000000-0000-4000-8000-1000${String(compteur).padStart(8, "0")}`;
}

beforeEach(() => {
  etat.rpc = [];
  etat.lecturesTable = 0;
  etat.partage = null;
  etat.cookie = null;
  etat.pressions = 0;
  etat.pressionBloquee = false;
  etat.pressionRejette = false;
  etat.taches = [];
  reportErrorMock.mockClear();
});

describe("getEventState — la garde est en base, plus dans l'application", () => {
  it("ne relit NI la session NI l'organisation avant l'état", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    const res = await getEventState({ sessionId });

    expect(res.state).toBe("ok");
    // L'ASSERTION QUI PORTE EVT-2 : `loadEventActionContext` a disparu de ce
    // chemin, donc plus une seule lecture de table avant la RPC.
    expect(etat.lecturesTable).toBe(0);
    expect(etat.rpc).toEqual(["event_etat_partage"]);
  });

  it("rend l'horloge serveur avec l'état (JOU-4)", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    const res = await getEventState({ sessionId });

    expect(res.serverNow).toBe(SERVER_NOW);
  });

  it("demande le bloc « moi » seulement quand le cookie de session existe", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);
    etat.cookie = "jeton-joueur";

    await getEventState({ sessionId });

    expect(etat.rpc).toEqual(["event_etat_partage", "event_etat_joueur"]);
  });

  it("`unavailable` de la RPC rend l'issue d'indisponibilité neutre", async () => {
    const sessionId = nouvelleSession();
    etat.partage = { state: "unavailable" };

    const res = await getEventState({ sessionId });

    expect(res.state).toBe("unavailable");
    expect(res.session).toBeNull();
    expect(res.you).toBeNull();
  });

  it("un identifiant invalide n'atteint ni la mesure ni la base", async () => {
    const res = await getEventState({ sessionId: "pas-un-uuid" });

    expect(res.state).toBe("unavailable");
    expect(etat.rpc).toEqual([]);
    expect(etat.pressions).toBe(0);
  });
});

describe("getEventState — la mesure de pression est hors du chemin critique", () => {
  it("rend l'état sans attendre un compteur qui ne répond pas", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);
    etat.pressionBloquee = true;

    const gagnant = await Promise.race([
      getEventState({ sessionId }).then(() => "état"),
      new Promise<string>((r) => setTimeout(() => r("bloqué"), 300)),
    ]);

    // Attendue, cette mesure ajoutait sa latence à chaque tour de sondage de
    // chaque téléphone de la salle.
    expect(gagnant).toBe("état");
  });

  it("confie la mesure à after(), et non à une promesse orpheline", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);

    await getEventState({ sessionId });
    await Promise.all(etat.taches);

    // Un `void promise` n'est rattaché à rien : sous Fluid Compute l'instance
    // peut geler dès la réponse rendue, et la mesure disparaîtrait — or c'est
    // le SEUL signal d'abus de ce chemin, aucun refus n'y étant opposé.
    expect(etat.taches).toHaveLength(1);
    expect(etat.pressions).toBe(1);
  });

  it("un rejet du compteur est avalé, jamais laissé non géré", async () => {
    const sessionId = nouvelleSession();
    etat.partage = partagePlein(sessionId);
    etat.pressionRejette = true;

    const res = await getEventState({ sessionId });
    // La tâche `after` doit se résoudre, jamais rejeter : son `.catch` interne
    // est ce qui empêche un rejet non géré de faire tomber le processus.
    await expect(Promise.all(etat.taches)).resolves.toBeDefined();

    expect(res.state).toBe("ok");
    expect(reportErrorMock).toHaveBeenCalledWith(
      "event.state-pressure",
      expect.any(Error),
    );
  });
});

describe("getEventState — rien n'est mesuré sur une session qui n'existe pas", () => {
  it("un verdict `unavailable` n'écrit AUCUN compteur", async () => {
    const sessionId = nouvelleSession();
    etat.partage = { state: "unavailable" };

    const res = await getEventState({ sessionId });
    await Promise.all(etat.taches);

    expect(res.state).toBe("unavailable");
    // L'ASSERTION QUI PORTE LE CORRECTIF : mesurer AVANT le verdict faisait
    // créer une clé Redis neuve (TTL 660 s) à chaque UUID v4 forgé posté en
    // direct — on payait le stockage de l'abus qu'on prétendait mesurer, et le
    // signal se noyait dans des sessions qui n'existent pas. `main` ne le
    // faisait pas : `loadEventActionContext` refusait avant la mesure.
    expect(etat.pressions).toBe(0);
    expect(etat.taches).toHaveLength(0);
  });
});
