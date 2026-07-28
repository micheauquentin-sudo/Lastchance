// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  enqueueJob: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) => (name === "CRON_SECRET" ? "cron-secret" : undefined),
}));
vi.mock("@/lib/monitoring", () => ({
  monitored: (_name: string, fn: () => unknown) => fn(),
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/jobs", () => ({
  enqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

import { GET } from "./route";

const request = (options: { token?: string; after?: string } = {}) => {
  const url = new URL("https://app.example.com/api/cron/automations");
  if (options.after !== undefined) url.searchParams.set("after", options.after);
  return new Request(url, {
    headers: { authorization: `Bearer ${options.token ?? "cron-secret"}` },
  });
};

interface Result {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

interface SettingsQuery {
  select: (columns: string, options?: { count?: string }) => SettingsQuery;
  eq: () => SettingsQuery;
  gt: (column: string, value: string) => SettingsQuery;
  order: (column: string, options: unknown) => SettingsQuery;
  limit: (value: number) => Promise<Result>;
}

interface OrganizationsQuery {
  select: () => OrganizationsQuery;
  in: (column: string, values: string[]) => OrganizationsQuery;
  order: (column: string, options: unknown) => Promise<Result>;
}

/**
 * Deux chaînes PostgREST distinctes : les réglages activés (bornés,
 * ordonnés, comptés, éventuellement repris après un curseur) puis les
 * organisations retenues (ordonnées elles aussi).
 */
function mockTables(settings: Result, organizations?: Result) {
  const calls = {
    settingsOrders: [] as Array<[string, unknown]>,
    settingsCount: undefined as string | undefined,
    settingsLimit: 0,
    cursor: null as string | null,
    selectedIds: [] as string[],
    organizationsOrders: [] as Array<[string, unknown]>,
  };

  const settingsQuery: SettingsQuery = {
    select: (_columns, options) => {
      calls.settingsCount = options?.count;
      return settingsQuery;
    },
    eq: () => settingsQuery,
    gt: (_column, value) => {
      calls.cursor = value;
      return settingsQuery;
    },
    order: (column, options) => {
      calls.settingsOrders.push([column, options]);
      return settingsQuery;
    },
    limit: async (value) => {
      calls.settingsLimit = value;
      return settings;
    },
  };

  const organizationsQuery: OrganizationsQuery = {
    select: () => organizationsQuery,
    in: (_column, values) => {
      calls.selectedIds = values;
      return organizationsQuery;
    },
    order: async (column, options) => {
      calls.organizationsOrders.push([column, options]);
      return organizations ?? { data: [], error: null };
    },
  };

  mocks.from.mockImplementation((table: string) =>
    table === "automation_settings" ? settingsQuery : organizationsQuery,
  );
  return calls;
}

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.enqueueJob.mockResolvedValue(true);
});

describe("GET /api/cron/automations", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request({ token: "wrong" }));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
  });

  it("journalise un échec catégorisé si la lecture des réglages échoue", async () => {
    mockTables({ data: null, error: { message: "database unavailable" } });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
      "settings_read_failed",
    );
  });

  it("clôt un passage sans scénario activé au lieu de rester ouvert", async () => {
    // Le chemin de sortie anticipée : sans heartbeat, un cron qui n'a
    // simplement rien à faire serait indistinguable d'un cron à l'arrêt.
    mockTables({ data: [], error: null, count: 0 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      organizations: 0,
      enqueued: 0,
      deferred: 0,
      followUpRequired: false,
      nextCursor: null,
    });
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
    );
  });

  it("clôt le passage nominal avec ses compteurs, dédoublonné et ordonné", async () => {
    const calls = mockTables(
      {
        data: [{ organization_id: ORG_A }, { organization_id: ORG_A }],
        error: null,
        count: 2,
      },
      { data: [{ id: ORG_A, timezone: "Europe/Paris" }], error: null },
    );

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      organizations: 1,
      enqueued: 1,
      deferred: 0,
      followUpRequired: false,
      nextCursor: null,
    });
    // Deux lignes de réglages, une seule organisation : aucun double dépôt.
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    expect(calls.settingsOrders).toEqual([
      ["organization_id", { ascending: true }],
    ]);
    expect(calls.organizationsOrders).toEqual([["id", { ascending: true }]]);
    expect(calls.settingsCount).toBe("exact");
    expect(calls.settingsLimit).toBe(2000);
    expect(calls.cursor).toBeNull();
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { organizations: 1, enqueued: 1, deferred: 0, follow_up_required: 0 },
      undefined,
    );
  });

  it("signale une suite nécessaire quand la lecture est tronquée", async () => {
    // Total éligible supérieur aux lignes lues : le plafond a mordu.
    mockTables(
      {
        data: [{ organization_id: ORG_A }, { organization_id: ORG_B }],
        error: null,
        count: 2500,
      },
      {
        data: [
          { id: ORG_A, timezone: "Europe/Paris" },
          { id: ORG_B, timezone: "Europe/Paris" },
        ],
        error: null,
      },
    );

    const body = await (await GET(request())).json();

    expect(body.followUpRequired).toBe(true);
    // Reprise strictement après la dernière organisation retenue.
    expect(body.nextCursor).toBe(ORG_B);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "degraded",
      { organizations: 2, enqueued: 2, deferred: 0, follow_up_required: 1 },
      "organizations_deferred",
    );
  });

  it("borne à 500 organisations, compte les différées et donne le point de reprise", async () => {
    const identifiers = Array.from(
      { length: 501 },
      (_unused, index) =>
        `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
    );
    const calls = mockTables(
      {
        data: identifiers.map((id) => ({ organization_id: id })),
        error: null,
        count: identifiers.length,
      },
      {
        data: identifiers
          .slice(0, 500)
          .map((id) => ({ id, timezone: "Europe/Paris" })),
        error: null,
      },
    );

    const body = await (await GET(request())).json();

    expect(calls.selectedIds).toHaveLength(500);
    expect(body.organizations).toBe(500);
    expect(body.deferred).toBe(1);
    expect(body.followUpRequired).toBe(true);
    expect(body.nextCursor).toBe(identifiers[499]);
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(500);
  });

  it("reprend strictement après le curseur fourni", async () => {
    const calls = mockTables(
      { data: [{ organization_id: ORG_B }], error: null, count: 1 },
      { data: [{ id: ORG_B, timezone: "Europe/Paris" }], error: null },
    );

    const response = await GET(request({ after: ORG_A }));

    expect(response.status).toBe(200);
    expect(calls.cursor).toBe(ORG_A);
    expect(calls.selectedIds).toEqual([ORG_B]);
  });

  it("refuse un curseur illisible au lieu de tout reprendre au début", async () => {
    mockTables({ data: [], error: null, count: 0 });

    const response = await GET(request({ after: "pas-un-uuid" }));

    expect(response.status).toBe(400);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("dépose quand même les jobs si le journal de santé est absent", async () => {
    // Le dépôt est idempotent par jour : le suspendre sur une panne
    // d'observabilité ferait sauter les scénarios d'une journée entière.
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mockTables(
      { data: [{ organization_id: ORG_A }], error: null, count: 1 },
      { data: [{ id: ORG_A, timezone: "Europe/Paris" }], error: null },
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.organizations).toBe(1);
    expect(body.enqueued).toBe(1);
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "automation.run-scenarios",
        organizationId: ORG_A,
        idempotencyKey: expect.stringMatching(
          new RegExp(`^automations:${ORG_A}:\\d{4}-\\d{2}-\\d{2}$`),
        ),
      }),
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      { organizations: 1, enqueued: 1, deferred: 0, follow_up_required: 0 },
      undefined,
    );
  });
});
