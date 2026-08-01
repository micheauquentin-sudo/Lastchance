import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLES, type AdminRole } from "@/types/admin";
import { can, type Permission } from "@/lib/admin/rbac";

/* ────────────────────────────────────────────────────────────
 * CADENCE RAPIDE — les gardes, chacune assertée seule.
 *
 * L'action dépose dans le Vault de Postgres l'URL du worker et le secret
 * partagé qui arment le pg_cron `lastchance-jobs-worker` (5 min). C'est le seul
 * geste du back-office qui ÉCRIT UN SECRET, et le seul dont l'effet — un appel
 * HTTP répété indéfiniment — ne se désarme pas depuis l'application.
 *
 * CINQ PROPRIÉTÉS, dans l'ordre de ce qu'un défaut coûterait :
 *
 *  1. RIEN N'EST ÉCRIT AVANT LA GARDE. La matrice RBAC réelle (`can`) est
 *     branchée : la permission n'est pas rejouée en copie, elle est exercée.
 *     Un refus laisse une trace, y compris sans session — c'est le POST
 *     fabriqué qu'on a le plus besoin de voir.
 *
 *  2. UNE URL LOCALE EST REFUSÉE. La garde la plus facile à supprimer « parce
 *     que ça marche en local », et la plus coûteuse : `configured` ne teste que
 *     l'EXISTENCE des secrets. Un `localhost` dans le Vault rend le worker
 *     VERT à la supervision tout en ne faisant rien.
 *
 *  3. SEULE LA PRODUCTION PEUT ARMER. La 2 dit « joignable », jamais « nous » :
 *     l'URL d'une preview est publique et en https, donc elle passe. Or une
 *     preview porte le même `CRON_SECRET`, et Postgres l'émettrait 288 fois par
 *     jour vers un hôte tiers pendant que le bouton qui répare disparaît.
 *
 *  4. `CRON_SECRET` ABSENTE EST DITE. Jamais un échec muet, jamais la valeur.
 *
 *  5. LE SECRET NE SORT NULLE PART : ni dans le retour de l'action, ni dans
 *     l'audit, ni dans un message d'erreur, ni dans ce qui part à Sentry. La
 *     dernière assertion balaie TOUT ce que le test a capté et cherche la
 *     valeur, plutôt que d'inspecter les canaux un par un — un canal ajouté
 *     demain tombe alors dedans.
 * ──────────────────────────────────────────────────────────── */

interface DbCall {
  table: string;
  filters: Record<string, unknown>;
}

interface AuditInput {
  actor: { id: string; email: string; role: string };
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

const { state, makeDb, ACTOR, ACTOR_IP, authState, CRON_SECRET, PROD_URL } = vi.hoisted(
  () => {
  // `vi.hoisted` s'exécute AVANT les `const` du module : les deux littéraux
  // dont le faux environnement a besoin sont définis ici et ré-exportés.
  /** La valeur qui ne doit apparaître nulle part. */
  const CRON_SECRET = "s3cr3t-de-production-a-ne-jamais-voir";
  const PROD_URL = "https://lastchance.app";

  const ACTOR = {
    id: "00000000-0000-4000-8000-0000000000f1",
    user_id: "00000000-0000-4000-8000-0000000000f2",
    email: "ops@lastchance.test",
    name: "Ops",
    role: "super_admin",
    is_active: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    last_login_at: null,
  };
  const ACTOR_IP = "203.0.113.7";

  const state = {
    calls: [] as DbCall[],
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Erreur rendue par la RPC, `code` compris (PGRST202 = fonction absente). */
    rpcError: null as { code?: string; message: string } | null,
    /**
     * Ligne RENDUE par la RPC. Elle ne lève que sur un refus d'autorisation :
     * ses cinq refus métier arrivent avec `error === null` et un `status` dans
     * cette ligne. Le harnais doit donc pouvoir jouer « pas d'erreur, mais pas
     * écrit » — c'est exactement le cas qu'un appelant naïf compte pour un
     * succès. `undefined` simule une RPC qui ne rend aucune ligne.
     */
    rpcRow: undefined as Record<string, unknown> | undefined,
    /** Ligne du registre `ops_worker_definitions`, ou `null` = worker inconnu. */
    definition: {
      worker: "jobs",
      vault_url_secret: "jobs_worker_url",
      vault_shared_secret: "sync_contests_secret",
    } as Record<string, unknown> | null,
    definitionError: null as string | null,
    /** Lignes réellement insérées dans admin_audit_logs (trace des refus). */
    auditRows: [] as Record<string, unknown>[],
    appUrl: PROD_URL,
    cronSecret: CRON_SECRET as string | undefined,
    /** `VERCEL_ENV` — le défaut est la production, sinon rien ne passerait. */
    vercelEnv: "production" as string | undefined,
    /** `VERCEL_PROJECT_PRODUCTION_URL` — domaine NU, comme Vercel le rend. */
    productionHost: "lastchance.app" as string | undefined,
    reset() {
      state.calls = [];
      state.rpcCalls = [];
      state.rpcError = null;
      state.rpcRow = {
        status: "written",
        written: true,
        url_secret_name: "jobs_worker_url",
        shared_secret_name: "sync_contests_secret",
        url_created: true,
        shared_created: false,
        also_affects_workers: ["sync-contests"],
        error_code: null,
      };
      state.definition = {
        worker: "jobs",
        vault_url_secret: "jobs_worker_url",
        vault_shared_secret: "sync_contests_secret",
      };
      state.definitionError = null;
      state.auditRows = [];
      state.appUrl = PROD_URL;
      state.cronSecret = CRON_SECRET;
      state.vercelEnv = "production";
      state.productionHost = "lastchance.app";
    },
  };

  const authState = {
    role: "super_admin" as AdminRole,
    fresh: true,
    session: true,
    calls: [] as Array<{ permission: string; requireFresh: boolean }>,
    reset() {
      authState.role = "super_admin";
      authState.fresh = true;
      authState.session = true;
      authState.calls = [];
    },
  };

  function makeDb() {
    return {
      from(table: string) {
        const call: DbCall = { table, filters: {} };
        state.calls.push(call);
        const builder = {
          select: () => builder,
          insert: (payload: Record<string, unknown>) => {
            if (table === "admin_audit_logs") state.auditRows.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
          eq: (column: string, value: unknown) => {
            call.filters[column] = value;
            return builder;
          },
          maybeSingle: () =>
            Promise.resolve(
              state.definitionError
                ? { data: null, error: { message: state.definitionError } }
                : { data: state.definition, error: null },
            ),
        };
        return builder;
      },
      rpc(name: string, args: Record<string, unknown>) {
        state.rpcCalls.push({ name, args });
        // `returns table (…)` : PostgREST rend un TABLEAU de lignes, jamais un
        // objet nu. Le harnais reproduit cette forme-là, sans quoi il testerait
        // un contrat que la base ne remplit pas.
        return Promise.resolve({
          data: state.rpcRow === undefined ? [] : [state.rpcRow],
          error: state.rpcError,
        });
      },
    };
  }

    return { state, makeDb, ACTOR, ACTOR_IP, authState, CRON_SECRET, PROD_URL };
  },
);

const { logAdminActionMock, revalidatePathMock, reportErrorMock, enqueueJobMock } =
  vi.hoisted(() => ({
    logAdminActionMock: vi.fn<(input: AuditInput) => Promise<void>>(() => Promise.resolve()),
    revalidatePathMock: vi.fn<(path: string) => void>(),
    reportErrorMock: vi.fn<(scope: string, error: unknown) => void>(),
    enqueueJobMock: vi.fn(() => Promise.resolve(true)),
  }));

vi.mock("@/lib/admin/db", () => ({ createAdminBackofficeClient: () => makeDb() }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: logAdminActionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/monitoring", () => ({ reportError: reportErrorMock }));
vi.mock("@/lib/jobs", () => ({ enqueueJob: enqueueJobMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeDb() }));

/**
 * `APP_URL`, `CRON_SECRET` et les deux variables système de Vercel sont lus À
 * TRAVERS ce module. Le getter est délibéré : `APP_URL` est une constante de
 * module côté production, et sans getter le test ne pourrait exercer qu'une
 * seule valeur — c'est-à-dire pas la garde qu'on veut faire rougir.
 *
 * `env` sert les DEUX variables d'environnement de la garde 3. Le défaut est la
 * production : chaque autre test exerce alors la garde qui l'intéresse, et pas
 * celle-ci.
 */
vi.mock("@/lib/env", () => ({
  get APP_URL() {
    return state.appUrl;
  },
  optionalEnv: (name: string) => {
    if (name === "CRON_SECRET") return state.cronSecret;
    if (name === "VERCEL_ENV") return state.vercelEnv;
    if (name === "VERCEL_PROJECT_PRODUCTION_URL") return state.productionHost;
    return undefined;
  },
  requiredEnv: (name: string) => `faux-${name}`,
}));

// Garde simulée dans son CÂBLAGE, jamais dans sa décision : `can` est la
// fonction réelle sur la matrice réelle.
vi.mock("@/lib/admin/auth", async () => {
  const { can: realCan } = await vi.importActual<typeof import("@/lib/admin/rbac")>(
    "@/lib/admin/rbac",
  );
  class AdminForbiddenError extends Error {
    constructor(message = "Action non autorisée.") {
      super(message);
      this.name = "AdminForbiddenError";
    }
  }
  return {
    AdminForbiddenError,
    authorizeAction: async (
      permission: Permission,
      opts: { requireFresh?: boolean } = {},
    ) => {
      authState.calls.push({ permission, requireFresh: opts.requireFresh === true });
      if (!authState.session) throw new AdminForbiddenError("Session admin requise.");
      if (!realCan(authState.role, permission)) {
        throw new AdminForbiddenError("Permission insuffisante pour cette action.");
      }
      if (opts.requireFresh && !authState.fresh) {
        throw new AdminForbiddenError("Ré-authentification requise.");
      }
      return { ...ACTOR, role: authState.role };
    },
    getAdminUser: async () =>
      authState.session ? { ...ACTOR, role: authState.role } : null,
    actorIp: async () => ACTOR_IP,
  };
});

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => Promise.resolve(true),
  rateLimitBucket: (prefix: string, key: string) => `${prefix}:${key}`,
  RATE_LIMITS: { authLogin: { limit: 5, windowSeconds: 60 } },
}));

import { enableWorkerFastCadence, runWorkerProbe } from "./actions";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/**
 * `fetch` du HARNAIS — c'est par lui que passe le seul envoi réel du
 * `CRON_SECRET` hors de la RPC. Le mock capture l'URL ET les en-têtes : c'est
 * ce qui permet d'asserter qu'aucun jeton ne part vers un hôte non vérifié,
 * plutôt que d'asserter seulement un message d'erreur à l'écran.
 */
const PROBE_RESPONSE = {
  ok: true,
  status: 200,
  json: () => Promise.resolve({ probe: true, completed: 1 }),
};

const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>(
  () =>
    // Fausse `Response` reduite aux TROIS champs que l'action lit (`ok`,
    // `status`, `json`) : implementer les vingt membres de l'interface noierait
    // ce que ce fichier asserte, qui est la DESTINATION de l'appel, pas son corps.
    // unsafe-cast-justification: fausse Response reduite aux 3 champs lus
    Promise.resolve(PROBE_RESPONSE as unknown as Response),
);

beforeEach(() => {
  state.reset();
  authState.reset();
  logAdminActionMock.mockClear();
  revalidatePathMock.mockClear();
  reportErrorMock.mockClear();
  enqueueJobMock.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/* ═══ 1. RBAC ═══════════════════════════════════════════════ */

describe("garde 1 — RBAC, fraîcheur, trace du refus", () => {
  it("réussit pour un super_admin en session fraîche", async () => {
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(true);
    expect(authState.calls).toEqual([
      { permission: "monitoring.cadence", requireFresh: true },
    ]);
  });

  it("exige monitoring.cadence, et non monitoring.probe", () => {
    // ROUGE SI : la permission est rabattue sur celle de la sonde, ouverte
    // jusqu'au rôle `support`. La sonde déclenche un appel ; ce geste écrit un
    // secret et arme un appel répété que l'application ne sait pas arrêter.
    expect(can("support", "monitoring.probe")).toBe(true);
    expect(can("support", "monitoring.cadence")).toBe(false);
  });

  it("seul super_admin porte la permission", () => {
    for (const role of ADMIN_ROLES) {
      expect(can(role, "monitoring.cadence")).toBe(role === "super_admin");
    }
  });

  it.each(["admin", "support", "finance", "read_only"] as const)(
    "refuse le rôle %s SANS rien écrire",
    async (role) => {
      authState.role = role;
      const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
      expect(result.ok).toBe(false);
      expect(state.rpcCalls).toEqual([]);
    },
  );

  it("refuse une session non fraîche (sudo)", async () => {
    authState.fresh = false;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("un POST sans session laisse une trace `.denied`", async () => {
    authState.session = false;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.auditRows).toHaveLength(1);
    expect(state.auditRows[0]).toMatchObject({
      action: "monitoring.cadence.enable.denied",
      actor_role: "none",
    });
  });
});

/* ═══ 2. L'URL ══════════════════════════════════════════════ */

describe("garde 2 — l'URL doit être celle de la production", () => {
  it("refuse localhost, la valeur PAR DÉFAUT de APP_URL", async () => {
    // ROUGE SI : la garde d'URL saute. C'est le scénario réel — `src/lib/env.ts`
    // se replie sur `http://localhost:3000` quand NEXT_PUBLIC_APP_URL manque —
    // et son coût est un worker que la supervision croit configuré alors que
    // Postgres appelle sa propre machine toutes les 5 minutes.
    state.appUrl = "http://localhost:3000";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse localhost MÊME en https", async () => {
    // Le cas précédent tomberait aussi sur la garde `https` : retirer le refus
    // d'hôte local le laisserait donc vert. Celui-ci ne dépend que de l'hôte —
    // c'est lui qui rougit si `HOTES_LOCAUX` disparaît.
    state.appUrl = "https://localhost:3000";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse http sur un hôte pourtant public", async () => {
    state.appUrl = "http://lastchance.app";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse une adresse privée", async () => {
    state.appUrl = "https://192.168.1.10";
    expect((await enableWorkerFastCadence(form({ worker: "jobs" }))).ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("journalise le refus avec un motif, jamais l'URL reçue", async () => {
    state.appUrl = "http://localhost:3000";
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    const entry = logAdminActionMock.mock.calls.at(-1)?.[0];
    expect(entry?.action).toBe("monitoring.cadence.enable.refused");
    expect(entry?.metadata).toMatchObject({ worker: "jobs", refusal: "url_non_https" });
  });

  it("pose l'URL dérivée du nom du worker", async () => {
    await enableWorkerFastCadence(form({ worker: "sync-contests" }));
    expect(state.rpcCalls[0]?.args.p_url).toBe(
      `${PROD_URL}/api/cron/sync-contests`,
    );
  });
});

/* ═══ 3. L'ENVIRONNEMENT ════════════════════════════════════ */

describe("garde 3 — armer depuis autre chose que la PRODUCTION", () => {
  /**
   * CE QUE LA GARDE 2 LAISSE PASSER, ET QUI COÛTE LE PLUS CHER.
   *
   * L'URL d'une preview est publique et en https : elle passe TOUTES les règles
   * de la garde 2, qui ne sait dire que « joignable », jamais « nous ». Or une
   * preview porte le même code, le même back-office et le même `CRON_SECRET` de
   * production. Postgres émettrait alors `Bearer <CRON_SECRET>` 288 fois par
   * jour vers cet hôte — exfiltration continue du jeton qui ouvre les dix
   * routes `/api/cron/`, purge RGPD comprise — et `configured` passerait au
   * vert, faisant DISPARAÎTRE le bouton qui répare.
   */
  it("refuse une PREVIEW dont l'URL est pourtant publique et en https", async () => {
    // ROUGE SI : la garde d'environnement saute. L'URL ci-dessous franchit la
    // garde 2 sans broncher — c'est tout l'intérêt du cas.
    state.vercelEnv = "preview";
    state.appUrl = "https://lastchance-git-ma-branche.vercel.app";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
    expect(!result.ok && result.error).toContain("preview");
  });

  it("refuse quand VERCEL_ENV est absente (poste local, hors Vercel)", async () => {
    state.vercelEnv = undefined;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse une PRODUCTION dont NEXT_PUBLIC_APP_URL est PÉRIMÉE", async () => {
    // Le cas que `VERCEL_ENV` seule ne voit pas : l'environnement dit bien
    // `production`, et l'hôte visé n'est pourtant plus le nôtre.
    state.appUrl = "https://ancien-domaine.example";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
    expect(!result.ok && result.error).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("journalise le motif, jamais l'hôte comparé", async () => {
    state.vercelEnv = "preview";
    state.appUrl = "https://lastchance-git-ma-branche.vercel.app";
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    const entry = logAdminActionMock.mock.calls.at(-1)?.[0];
    expect(entry?.action).toBe("monitoring.cadence.enable.refused");
    expect(entry?.metadata).toMatchObject({
      worker: "jobs",
      refusal: "environnement_non_production",
    });
    expect(JSON.stringify(entry?.metadata)).not.toContain("ma-branche");
  });

  it("laisse passer la production, et INSCRIT que la garde d'hôte a joué", async () => {
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(true);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      production_host_verified: true,
    });
  });

  it("sans VERCEL_PROJECT_PRODUCTION_URL : autorisé, mais le journal l'AVOUE", async () => {
    // La variable n'est pas garantie sur tous les déploiements. Bloquer
    // rendrait la cadence inarmable ; autoriser en silence laisserait croire à
    // une garde qui n'a pas eu lieu. On autorise et on l'écrit.
    // ROUGE SI : quelqu'un journalise `true` en dur « puisque ça a réussi ».
    state.productionHost = undefined;
    state.appUrl = "https://un-autre-domaine.example";
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(true);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      production_host_verified: false,
    });
  });

  it("la garde d'URL garde la priorité : localhost est nommé pour ce qu'il est", async () => {
    // ROUGE SI : quelqu'un place la garde 3 avant la 2. Les deux refuseraient,
    // mais l'administrateur lirait « pas le domaine de production » là où le
    // vrai problème est une adresse locale — et irait comparer des domaines.
    state.appUrl = "http://localhost:3000";
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      refusal: "url_non_https",
    });
  });
});

/* ═══ 4. CRON_SECRET ════════════════════════════════════════ */

describe("garde 4 — CRON_SECRET absente est DITE", () => {
  it("refuse et nomme la variable", async () => {
    state.cronSecret = undefined;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("CRON_SECRET");
    expect(state.rpcCalls).toEqual([]);
  });

  it("le refus est journalisé, pas seulement renvoyé à l'écran", async () => {
    state.cronSecret = undefined;
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      refusal: "cron_secret_absent",
    });
  });
});

/* ═══ Le registre décide, pas l'appelant ════════════════════ */

describe("le registre des workers reste l'autorité", () => {
  it("refuse un nom de worker hors registre applicatif", async () => {
    const result = await enableWorkerFastCadence(form({ worker: "n-importe-quoi" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse un worker sans prérequis Vault (cron quotidien)", async () => {
    // `purge-data` & co. sont enregistrés SANS secrets : les activer écrirait
    // deux entrées de Vault que rien ne lit.
    state.definition = {
      worker: "purge-data",
      vault_url_secret: null,
      vault_shared_secret: null,
    };
    const result = await enableWorkerFastCadence(form({ worker: "purge-data" }));
    expect(result.ok).toBe(false);
    expect(state.rpcCalls).toEqual([]);
  });

  it("refuse un worker absent de la table", async () => {
    state.definition = null;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("inconnu");
  });

  it("lit la ligne du worker demandé, et d'elle seule", async () => {
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    const lecture = state.calls.find((c) => c.table === "ops_worker_definitions");
    expect(lecture?.filters).toEqual({ worker: "jobs" });
  });

  it("dit clairement quand la RPC n'existe pas encore en base", async () => {
    state.rpcError = { code: "PGRST202", message: "function not found" };
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain("n'existe pas encore");
  });
});

/* ═══ 5. LE SECRET NE SORT NULLE PART ═══════════════════════ */

describe("garde 5 — le secret ne sort nulle part", () => {
  it("est passé à la RPC, et à elle seule", async () => {
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].name).toBe("set_worker_vault_secrets");
    expect(state.rpcCalls[0].args.p_secret).toBe(CRON_SECRET);
  });

  it("l'audit ne porte que les NOMS des entrées du Vault", async () => {
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    const entry = logAdminActionMock.mock.calls.at(-1)?.[0];
    expect(entry?.action).toBe("monitoring.cadence.enable");
    expect(entry?.metadata).toEqual({
      worker: "jobs",
      url: `${PROD_URL}/api/cron/jobs`,
      url_secret_name: "jobs_worker_url",
      shared_secret_name: "sync_contests_secret",
      url_created: true,
      shared_created: false,
      also_affects_workers: ["sync-contests"],
      // Un BOOLÉEN, pas un hôte : dit si la garde d'hôte a joué, jamais lequel.
      production_host_verified: true,
    });
  });

  it("un message d'erreur Postgres qui CONTIENT le secret n'est pas relayé", async () => {
    // Le cas n'est pas théorique : « value too long for type character
    // varying(…) » recopie la valeur du paramètre fautif, et `p_secret` en est
    // un. ROUGE SI : quelqu'un remet `error.message` dans le journal ou dans le
    // retour, comme le font les autres actions du back-office.
    state.rpcError = { code: "22001", message: `value too long: ${CRON_SECRET}` };
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).not.toContain(CRON_SECRET);
    expect(JSON.stringify(reportErrorMock.mock.calls)).not.toContain(CRON_SECRET);
    expect(JSON.stringify(logAdminActionMock.mock.calls)).not.toContain(CRON_SECRET);
  });

  it("BALAYAGE FINAL : rien de ce qui sort de l'action ne contient le secret", async () => {
    // Volontairement grossier, et c'est la raison d'être du test : plutôt que
    // d'inspecter les canaux connus un par un, on sérialise TOUT ce que le
    // harnais a capté — retour, audit, traces, Sentry, requêtes SQL — et on y
    // cherche la valeur. Un canal ajouté demain tombe dedans sans qu'on ait
    // pensé à l'ajouter ici.
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    const capture = JSON.stringify({
      result,
      audit: logAdminActionMock.mock.calls,
      auditRows: state.auditRows,
      sentry: reportErrorMock.mock.calls,
      db: state.calls,
      // La RPC est le SEUL destinataire légitime : on la retire du balayage,
      // et le test précédent vérifie qu'elle l'a bien reçu.
      rpc: state.rpcCalls.map((c) => ({ name: c.name, url: c.args.p_url })),
    });
    expect(result.ok).toBe(true);
    expect(capture).not.toContain(CRON_SECRET);
  });

  it("revalide l'écran de supervision après un succès", async () => {
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/monitoring");
  });

  it("le RETOUR de l'action ne porte plus aucune donnée", async () => {
    // ROUGE SI : quelqu'un remet l'URL — ou pire — dans le retour. L'action est
    // appelée depuis un composant client : son retour est SÉRIALISÉ et transmis
    // au navigateur avant que le composant ait la moindre chance de le jeter.
    // Ne rien renvoyer est la seule garantie qui ne dépende pas du rendu.
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result).toEqual({ ok: true, data: undefined });
  });
});

/* ═══ 6. LE STATUT RENDU DÉCIDE ═════════════════════════════ */

describe("garde 6 — un refus RENDU n'est pas un succès", () => {
  /**
   * LE DÉFAUT QUE CE BLOC FERME.
   *
   * `set_worker_vault_secrets` ne LÈVE que sur un refus d'autorisation : ses
   * cinq refus métier sont RENDUS dans `status`, délibérément — parce qu'un
   * refus PRÉVISIBLE n'a rien à faire dans un journal d'erreur, et que ce choix
   * ne dépend d'aucun réglage de journalisation. (La justification d'origine —
   * « une exception ferait journaliser l'instruction avec ses paramètres, donc
   * le jeton » — était FAUSSE : `log_parameter_max_length_on_error` vaut 0,
   * PostgreSQL ne journalise aucun paramètre lié. Le design reste bon, sa
   * raison a été corrigée ; voir l'en-tête de la migration.)
   *
   * Conséquence : sur un refus, `error` vaut `null`. Un appelant qui ne
   * regarde que `error` affiche un succès ET écrit à l'audit une activation
   * qui n'a pas eu lieu — un journal qui n'enregistre que des succès, y
   * compris quand il n'y en a pas.
   */
  const refus = [
    ["unknown_worker", /inconnu/i],
    ["no_vault_secrets", /aucun secret/i],
    ["registry_conflict", /même nom/i],
    ["empty_value", /vide/i],
    ["vault_error", /Vault/],
  ] as const;

  for (const [status, motif] of refus) {
    it(`« ${status} » rendu sans erreur fait ÉCHOUER l'action`, async () => {
      state.rpcRow = {
        status,
        written: false,
        url_secret_name: "jobs_worker_url",
        shared_secret_name: "sync_contests_secret",
        url_created: null,
        shared_created: null,
        also_affects_workers: ["sync-contests"],
        error_code: status === "vault_error" ? "22001" : null,
      };
      const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(motif);
    });

    it(`« ${status} » est journalisé comme un REFUS, jamais comme une activation`, async () => {
      state.rpcRow = {
        status,
        written: false,
        url_secret_name: "jobs_worker_url",
        shared_secret_name: "sync_contests_secret",
        url_created: null,
        shared_created: null,
        also_affects_workers: ["sync-contests"],
        error_code: null,
      };
      await enableWorkerFastCadence(form({ worker: "jobs" }));
      const entry = logAdminActionMock.mock.calls.at(-1)?.[0];
      expect(entry?.action).toBe("monitoring.cadence.enable.refused");
      expect(entry?.metadata).toMatchObject({ worker: "jobs", refusal: status });
      // L'écran de supervision n'a rien à réafficher : rien n'a changé.
      expect(revalidatePathMock).not.toHaveBeenCalled();
    });
  }

  it("décide sur `written`, et non sur le libellé de `status`", async () => {
    // ROUGE SI : quelqu'un écrit `status === "written"`. Le jour où la base
    // ajoute un statut de succès nuancé, ce test-là passe et l'autre ment.
    state.rpcRow = {
      status: "written_avec_une_nuance_ajoutee_demain",
      written: true,
      url_secret_name: "jobs_worker_url",
      shared_secret_name: "sync_contests_secret",
      url_created: false,
      shared_created: false,
      also_affects_workers: [],
      error_code: null,
    };
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(true);
  });

  it("une RPC qui ne rend AUCUNE ligne est un échec, pas un succès", async () => {
    // Ni erreur, ni ligne : on ne sait rien de ce qui a été écrit. Le dire vaut
    // mieux que de trancher sans preuve, dans un sens ou dans l'autre.
    state.rpcRow = undefined;
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      refusal: "rpc_sans_ligne",
    });
  });

  it("un statut INCONNU de l'application échoue au lieu de passer", async () => {
    state.rpcRow = {
      status: "un_refus_ajoute_demain",
      written: false,
      url_secret_name: null,
      shared_secret_name: null,
      url_created: null,
      shared_created: null,
      also_affects_workers: null,
      error_code: null,
    };
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      refusal: "un_refus_ajoute_demain",
      also_affects_workers: [],
    });
  });

  it("le SQLSTATE d'un `vault_error` est journalisé, jamais le secret", async () => {
    state.rpcRow = {
      status: "vault_error",
      written: false,
      url_secret_name: "jobs_worker_url",
      shared_secret_name: "sync_contests_secret",
      url_created: null,
      shared_created: null,
      also_affects_workers: ["sync-contests"],
      error_code: "22001",
    };
    const result = await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(result.ok).toBe(false);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      code: "22001",
    });
    const capture = JSON.stringify({
      result,
      audit: logAdminActionMock.mock.calls,
      sentry: reportErrorMock.mock.calls,
    });
    expect(capture).not.toContain(CRON_SECRET);
  });

  it("le refus atteint Sentry : un bouton qui ne marche pas doit se voir", async () => {
    // Un refus rendu ne lève rien côté base : sans cette trace, un
    // `registry_conflict` permanent resterait invisible de l'exploitation.
    state.rpcRow = {
      status: "registry_conflict",
      written: false,
      url_secret_name: "jobs_worker_url",
      shared_secret_name: "jobs_worker_url",
      url_created: null,
      shared_created: null,
      also_affects_workers: [],
      error_code: null,
    };
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(reportErrorMock).toHaveBeenCalled();
    expect(JSON.stringify(reportErrorMock.mock.calls)).toContain("registry_conflict");
  });
});

/* ═══ L'ÉCRITURE PARTAGÉE, DITE À L'AUDIT ═══════════════════ */

describe("le voisin réécrit est consigné", () => {
  it("l'audit du succès nomme les workers dont une entrée est réécrite", async () => {
    // `jobs` et `sync-contests` partagent `sync_contests_secret`. Le fait vient
    // de la RPC — calculée en base au moment de l'écriture — et non d'une paire
    // recopiée ici : le jour où le registre change, l'audit change avec lui.
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      also_affects_workers: ["sync-contests"],
    });
  });

  it("l'audit d'un REFUS le nomme aussi : la tentative se compare à son effet", async () => {
    state.rpcRow = {
      status: "empty_value",
      written: false,
      url_secret_name: "jobs_worker_url",
      shared_secret_name: "sync_contests_secret",
      url_created: null,
      shared_created: null,
      also_affects_workers: ["sync-contests"],
      error_code: null,
    };
    await enableWorkerFastCadence(form({ worker: "jobs" }));
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      also_affects_workers: ["sync-contests"],
    });
  });
});

/* ═══ 7. LA SONDE — l'autre porte par où le même jeton sort ═══ */

describe("runWorkerProbe — la destination du CRON_SECRET est bornée", () => {
  /**
   * LE MOYEN QUE CE BLOC FERME, et pourquoi il préexistait aux six gardes
   * ci-dessus.
   *
   * `runWorkerProbe` envoie `Authorization: Bearer <CRON_SECRET>` vers
   * `APP_URL`. MÊME jeton, MÊME variable de destination que l'armement de la
   * cadence — et, jusqu'ici, AUCUNE de ses gardes : ni https, ni hôte public,
   * ni environnement. Un `NEXT_PUBLIC_APP_URL` périmé après un changement de
   * domaine suffisait donc à livrer, en UN clic, le jeton qui ouvre les dix
   * routes `/api/cron/` — purge RGPD et résiliations d'essai comprises — au
   * nouveau propriétaire de l'ancien domaine.
   *
   * La différence avec la cadence est de DURÉE, pas de nature : 288 envois par
   * jour contre un par clic. Fermer l'un en laissant l'autre ouvert ne ferme
   * rien.
   *
   * CE QUI EST DÉLIBÉRÉMENT LAISSÉ OUVERT : le RBAC. `monitoring.probe` reste
   * accessible jusqu'au rôle `support` — diagnostiquer une file bloquée est un
   * geste d'astreinte légitime, et ce qui doit être borné est la DESTINATION du
   * jeton, pas qui a le droit de diagnostiquer. Une assertion ci-dessous le
   * fige, pour que le resserrer devienne une décision et non un glissement.
   */

  it("le RBAC de la sonde reste OUVERT jusqu'au support — c'est voulu", () => {
    // ROUGE SI : quelqu'un aligne `monitoring.probe` sur `monitoring.cadence`
    // en croyant « durcir ». Le risque traité ici n'est pas QUI clique.
    expect(can("support", "monitoring.probe")).toBe(true);
    expect(can("read_only", "monitoring.probe")).toBe(false);
  });

  it("en production, la sonde part vers l'URL VÉRIFIÉE, avec le jeton", async () => {
    const result = await runWorkerProbe(null);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${PROD_URL}/api/cron/jobs?probe=1`);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: `Bearer ${CRON_SECRET}`,
    });
  });

  it("refuse localhost : aucun jeton envoyé, aucun job déposé", async () => {
    // ROUGE SI : la garde d'URL de la sonde est retirée. L'assertion porte sur
    // `fetchMock`, c'est-à-dire sur l'ENVOI, et pas sur le message d'écran :
    // c'est l'envoi qui fuit.
    state.appUrl = "http://localhost:3000";
    const result = await runWorkerProbe(null);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // Le refus précède `enqueueJob` : un refus ne doit pas laisser derrière lui
    // un job de sonde que personne ne viendra réclamer.
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("refuse http sur un hôte pourtant public — le Bearer voyagerait en clair", async () => {
    state.appUrl = "http://lastchance.app";
    expect((await runWorkerProbe(null)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse une adresse privée", async () => {
    state.appUrl = "https://10.0.0.4";
    expect((await runWorkerProbe(null)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("LE SCÉNARIO : un domaine périmé ne reçoit PAS le jeton de production", async () => {
    // ROUGE SI : la garde d'environnement de la sonde est retirée. Cette URL-ci
    // franchit toutes les règles d'URL — publique, https, pas privée — et c'est
    // tout l'intérêt du cas : seule la comparaison à
    // `VERCEL_PROJECT_PRODUCTION_URL` l'attrape.
    state.appUrl = "https://ancien-domaine.example";
    const result = await runWorkerProbe(null);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("refuse une PREVIEW, dont l'URL est publique et en https", async () => {
    state.vercelEnv = "preview";
    state.appUrl = "https://lastchance-git-ma-branche.vercel.app";
    const result = await runWorkerProbe(null);
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse quand VERCEL_ENV est absente (poste local, hors Vercel)", async () => {
    state.vercelEnv = undefined;
    state.appUrl = PROD_URL;
    expect((await runWorkerProbe(null)).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("le refus est JOURNALISÉ avec son motif, jamais avec l'hôte visé", async () => {
    // Sans trace, un support qui déclenche ce refus depuis un domaine racheté
    // ne laisserait rien derrière lui — or c'est exactement la tentative qu'on
    // a besoin de relire après coup.
    state.appUrl = "https://ancien-domaine.example";
    await runWorkerProbe(null);
    const entry = logAdminActionMock.mock.calls.at(-1)?.[0];
    expect(entry?.action).toBe("monitoring.worker.probe");
    expect(entry?.metadata).toMatchObject({ ok: false, refusal: "hote_hors_production" });
    expect(JSON.stringify(entry?.metadata)).not.toContain("ancien-domaine");
  });

  it("la garde d'URL garde la priorité : localhost est nommé pour ce qu'il est", async () => {
    state.appUrl = "http://localhost:3000";
    await runWorkerProbe(null);
    expect(logAdminActionMock.mock.calls.at(-1)?.[0].metadata).toMatchObject({
      refusal: "url_non_https",
    });
  });

  it("un chemin traînant dans NEXT_PUBLIC_APP_URL ne dérive pas l'appel", async () => {
    // ROUGE SI : quelqu'un remet `new URL("/api/cron/jobs?probe=1", APP_URL)`.
    // Ce n'est pas cosmétique : seule l'ORIGINE de `APP_URL` a franchi les
    // gardes, et repartir de la valeur brute rouvre la porte qu'on ferme ici.
    state.appUrl = "https://lastchance.app/base/";
    const result = await runWorkerProbe(null);
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(`${PROD_URL}/api/cron/jobs?probe=1`);
  });

  it("BALAYAGE : sur un refus, le secret n'a voyagé nulle part", async () => {
    state.appUrl = "https://ancien-domaine.example";
    const result = await runWorkerProbe(null);
    const capture = JSON.stringify({
      result,
      audit: logAdminActionMock.mock.calls,
      auditRows: state.auditRows,
      sentry: reportErrorMock.mock.calls,
      fetch: fetchMock.mock.calls,
    });
    expect(result.ok).toBe(false);
    expect(capture).not.toContain(CRON_SECRET);
  });
});
