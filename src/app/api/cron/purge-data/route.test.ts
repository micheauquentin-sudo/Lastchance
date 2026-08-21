// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) => (name === "CRON_SECRET" ? "cron-secret" : undefined),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => mocks.reportError(...args),
  reportSecurityEvent: (...args: unknown[]) => mocks.reportSecurityEvent(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/purge-data", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Réponses par défaut des RPC de purge : tout réussit, rien à supprimer. */
function defaultRpc(name: string) {
  if (name === "purge_expired_personal_data") {
    return Promise.resolve({
      data: [
        {
          organizations_processed: 2,
          participations_deleted: 5,
          subscribers_deleted: 1,
        },
      ],
      error: null,
    });
  }
  if (name === "purge_ops_worker_runs") {
    return Promise.resolve({ data: [{ reaped: 1, deleted: 7 }], error: null });
  }
  return Promise.resolve({ data: 0, error: null });
}

/** `progression_engine_failures` (sonde) puis `ops_metrics` (hygiène). */
function defaultFrom(table: string) {
  if (table === "progression_engine_failures") {
    return {
      select: () => ({
        gt: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
    };
  }
  return { delete: () => ({ lt: async () => ({ error: null }) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.rpc.mockImplementation(defaultRpc);
  mocks.from.mockImplementation(defaultFrom);
});

describe("GET /api/cron/purge-data", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("purge le journal des workers au même titre que l'hygiène des mesures", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("purge_ops_worker_runs");
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        orgsProcessed: 2,
        workerRunsReaped: 1,
        workerRunsDeleted: 7,
      }),
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({
        orgsProcessed: 2,
        participationsDeleted: 5,
        workerRunsReaped: 1,
        workerRunsDeleted: 7,
      }),
      undefined,
    );
  });

  it("purge les lobbies expirés au même passage que les autres modules", async () => {
    // L16 — la purge existait en base (`purge_expired_lobbies`, migration
    // 20261017120000) et n'était appelée par personne. C'est exactement le
    // défaut qu'`experience_events` a porté pendant des mois : une fonction qui
    // dort pendant que la table croît sans borne. L'EXISTENCE N'EST PAS
    // L'EXÉCUTION — ce test est ce qui fait la différence entre les deux.
    mocks.rpc.mockImplementation((name: string) =>
      name === "purge_expired_lobbies"
        ? Promise.resolve({ data: 4, error: null })
        : defaultRpc(name),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("purge_expired_lobbies");
    expect(body).toEqual(expect.objectContaining({ ok: true, lobbiesDeleted: 4 }));
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ lobbiesDeleted: 4 }),
      undefined,
    );
  });

  it("échoue le passage si la purge des lobbies échoue", async () => {
    // Le contre-test : sans lui, retirer `lobbies.error` de l'agrégat laisserait
    // le test ci-dessus passer, et une purge RGPD muette se signalerait 200.
    mocks.rpc.mockImplementation((name: string) =>
      name === "purge_expired_lobbies"
        ? Promise.resolve({ data: null, error: { message: "permission denied" } })
        : defaultRpc(name),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "cron.purge-data",
      "permission denied",
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      expect.anything(),
      "purge_failed",
    );
  });

  it("dégrade le passage sans faire échouer la purge RGPD si l'hygiène échoue", async () => {
    // Le point du best-effort : une purge RGPD réussie reste un succès pour
    // l'appelant, mais le journal de santé dit que quelque chose a manqué.
    mocks.rpc.mockImplementation((name: string) =>
      name === "purge_ops_worker_runs"
        ? Promise.resolve({ data: null, error: { message: "permission denied" } })
        : defaultRpc(name),
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({ ok: true, workerRunsReaped: 0, workerRunsDeleted: 0 }),
    );
    expect(mocks.reportError).toHaveBeenCalledWith(
      "cron.purge-data.worker-runs",
      "permission denied",
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "degraded",
      expect.objectContaining({ workerRunsDeleted: 0 }),
      "hygiene_partial_failure",
    );
  });

  it("journalise un échec catégorisé si une purge RGPD échoue", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "purge_expired_quiz_players"
        ? Promise.resolve({ data: null, error: { message: "relation does not exist" } })
        : defaultRpc(name),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      expect.objectContaining({ workerRunsReaped: 1, workerRunsDeleted: 7 }),
      "purge_failed",
    );
  });

  it("purge quand même si le journal de santé est absent", async () => {
    // Le point du best-effort côté RGPD : la table ops_worker_runs peut
    // manquer (migration 20260805240000 non encore appliquée) sans que la
    // purge — une obligation légale — soit suspendue.
    mocks.startWorkerRunSafely.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, orgsProcessed: 2 }));
    expect(mocks.rpc).toHaveBeenCalledWith("purge_expired_personal_data");
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      expect.objectContaining({ orgsProcessed: 2 }),
      undefined,
    );
  });
});
