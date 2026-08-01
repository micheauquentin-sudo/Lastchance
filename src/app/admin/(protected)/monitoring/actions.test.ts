import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ROLES, type AdminRole } from "@/types/admin";
import { can, type Permission } from "@/lib/admin/rbac";

/* ────────────────────────────────────────────────────────────
 * CADENCE RAPIDE — les quatre gardes, chacune assertée seule.
 *
 * L'action dépose dans le Vault de Postgres l'URL du worker et le secret
 * partagé qui arment le pg_cron `lastchance-jobs-worker` (5 min). C'est le seul
 * geste du back-office qui ÉCRIT UN SECRET, et le seul dont l'effet — un appel
 * HTTP répété indéfiniment — ne se désarme pas depuis l'application.
 *
 * QUATRE PROPRIÉTÉS, dans l'ordre de ce qu'un défaut coûterait :
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
 *  3. `CRON_SECRET` ABSENTE EST DITE. Jamais un échec muet, jamais la valeur.
 *
 *  4. LE SECRET NE SORT NULLE PART : ni dans le retour de l'action, ni dans
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
    reset() {
      state.calls = [];
      state.rpcCalls = [];
      state.rpcError = null;
      state.definition = {
        worker: "jobs",
        vault_url_secret: "jobs_worker_url",
        vault_shared_secret: "sync_contests_secret",
      };
      state.definitionError = null;
      state.auditRows = [];
      state.appUrl = PROD_URL;
      state.cronSecret = CRON_SECRET;
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
        return Promise.resolve({ data: null, error: state.rpcError });
      },
    };
  }

    return { state, makeDb, ACTOR, ACTOR_IP, authState, CRON_SECRET, PROD_URL };
  },
);

const { logAdminActionMock, revalidatePathMock, reportErrorMock } = vi.hoisted(() => ({
  logAdminActionMock: vi.fn<(input: AuditInput) => Promise<void>>(() => Promise.resolve()),
  revalidatePathMock: vi.fn<(path: string) => void>(),
  reportErrorMock: vi.fn<(scope: string, error: unknown) => void>(),
}));

vi.mock("@/lib/admin/db", () => ({ createAdminBackofficeClient: () => makeDb() }));
vi.mock("@/lib/admin/audit", () => ({ logAdminAction: logAdminActionMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/monitoring", () => ({ reportError: reportErrorMock }));
// `runWorkerProbe` n'est pas l'objet de ce fichier : ses dépendances sont
// neutralisées pour que le module s'importe.
vi.mock("@/lib/jobs", () => ({ enqueueJob: () => Promise.resolve(true) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => makeDb() }));

/**
 * `APP_URL` et `CRON_SECRET` sont lus À TRAVERS ce module. Le getter est
 * délibéré : `APP_URL` est une constante de module côté production, et sans
 * getter le test ne pourrait exercer qu'une seule valeur — c'est-à-dire pas la
 * garde qu'on veut faire rougir.
 */
vi.mock("@/lib/env", () => ({
  get APP_URL() {
    return state.appUrl;
  },
  optionalEnv: (name: string) =>
    name === "CRON_SECRET" ? state.cronSecret : undefined,
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

import { enableWorkerFastCadence } from "./actions";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

beforeEach(() => {
  state.reset();
  authState.reset();
  logAdminActionMock.mockClear();
  revalidatePathMock.mockClear();
  reportErrorMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
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

/* ═══ 3. CRON_SECRET ════════════════════════════════════════ */

describe("garde 3 — CRON_SECRET absente est DITE", () => {
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

/* ═══ 4. LE SECRET NE SORT NULLE PART ═══════════════════════ */

describe("garde 4 — le secret ne sort nulle part", () => {
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
});
