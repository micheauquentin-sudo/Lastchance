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

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/reengage", {
    headers: { authorization: `Bearer ${token}` },
  });

interface OrgQuery {
  select: (columns: string, options?: { count?: string }) => OrgQuery;
  eq: () => OrgQuery;
  order: (column: string, options: unknown) => OrgQuery;
  limit: (value: number) => Promise<unknown>;
}

/**
 * Chaîne PostgREST attendue : select → eq → order → order → limit.
 * Le mock retient l'ordre demandé, le `count` et la borne : ce sont eux
 * qui font la différence entre un plafond explicite et un plafond muet.
 */
function mockOrganizations(result: {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}) {
  const calls = {
    orders: [] as Array<[string, unknown]>,
    count: undefined as string | undefined,
    limit: 0,
  };
  const query: OrgQuery = {
    select: (_columns, options) => {
      calls.count = options?.count;
      return query;
    },
    eq: () => query,
    order: (column, options) => {
      calls.orders.push([column, options]);
      return query;
    },
    limit: async (value) => {
      calls.limit = value;
      return result;
    },
  };
  mocks.from.mockReturnValue(query);
  return calls;
}

const oneOrganization = { id: "org-1", timezone: "Europe/Paris" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.enqueueJob.mockResolvedValue(true);
});

describe("GET /api/cron/reengage", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
  });

  it("journalise un échec catégorisé si la lecture des organisations échoue", async () => {
    mockOrganizations({ data: null, error: { message: "database unavailable" } });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
      "orgs_read_failed",
    );
  });

  it("clôt le passage avec des compteurs sans donnée personnelle", async () => {
    mockOrganizations({
      data: [oneOrganization, { id: "org-2", timezone: "Europe/Paris" }],
      error: null,
      count: 2,
    });
    // Deuxième dépôt en échec réel (enqueueJob renvoie true sur doublon).
    mocks.enqueueJob.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      organizations: 2,
      enqueued: 1,
      deferred: 0,
      followUpRequired: false,
    });
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { organizations: 2, enqueued: 1, deferred: 0, follow_up_required: 0 },
      undefined,
    );
  });

  it("ordonne totalement le passage et demande le total éligible", async () => {
    const calls = mockOrganizations({
      data: [oneOrganization],
      error: null,
      count: 1,
    });

    await GET(request());

    // Rotation d'abord, puis départage : sans ce second critère, deux
    // passages pouvaient traiter deux sous-ensembles des mêmes ex æquo.
    expect(calls.orders).toEqual([
      ["last_reengage_run_at", { ascending: true, nullsFirst: true }],
      ["id", { ascending: true }],
    ]);
    expect(calls.count).toBe("exact");
    expect(calls.limit).toBe(200);
  });

  it("publie le reliquat et se clôt en degraded quand le plafond est atteint", async () => {
    // 200 traitées, 250 éligibles : 50 différées, une suite est nécessaire.
    mockOrganizations({
      data: Array.from({ length: 200 }, (_unused, index) => ({
        id: `org-${index}`,
        timezone: "Europe/Paris",
      })),
      error: null,
      count: 250,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      organizations: 200,
      enqueued: 200,
      deferred: 50,
      followUpRequired: true,
    });
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(200);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "degraded",
      {
        organizations: 200,
        enqueued: 200,
        deferred: 50,
        follow_up_required: 1,
      },
      "organizations_deferred",
    );
  });

  it("dépose une clé d'idempotence par organisation et par jour", async () => {
    mockOrganizations({ data: [oneOrganization], error: null, count: 1 });

    await GET(request());

    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "reengage.org",
        organizationId: "org-1",
        idempotencyKey: expect.stringMatching(
          /^reengage:org-1:\d{4}-\d{2}-\d{2}$/,
        ),
      }),
    );
  });

  it("dépose quand même les jobs si le journal de santé est absent", async () => {
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mockOrganizations({ data: [oneOrganization], error: null, count: 1 });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      organizations: 1,
      enqueued: 1,
      deferred: 0,
      followUpRequired: false,
    });
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      { organizations: 1, enqueued: 1, deferred: 0, follow_up_required: 0 },
      undefined,
    );
  });

  it("ne fabrique aucun reliquat quand la base ne renvoie pas de total", async () => {
    // `count` absent : pas de reliquat négatif, pas de dégradation imaginaire.
    mockOrganizations({ data: [oneOrganization], error: null, count: null });

    const body = await (await GET(request())).json();

    expect(body.deferred).toBe(0);
    expect(body.followUpRequired).toBe(false);
  });
});
