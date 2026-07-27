// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  startWorkerRun: vi.fn(),
  finishWorkerRun: vi.fn(),
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
vi.mock("@/lib/worker-health", () => ({
  startWorkerRun: (...args: unknown[]) => mocks.startWorkerRun(...args),
  finishWorkerRun: (...args: unknown[]) => mocks.finishWorkerRun(...args),
}));
vi.mock("@/lib/contest-sync", () => ({
  groupContestsByLeague: () => new Map(),
  syncContestFixtures: vi.fn(),
}));
vi.mock("@/lib/fixtures", () => ({
  fetchLeagueFixturesCached: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/sync-contests", {
    headers: { authorization: `Bearer ${token}` },
  });

function contestsResult(
  result: { data: unknown[] | null; error: { message: string } | null },
) {
  return {
    select: () => ({
      eq: () => ({
        eq: async () => result,
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRun.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRun.mockResolvedValue(undefined);
});

describe("GET /api/cron/sync-contests", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRun).not.toHaveBeenCalled();
  });

  it("journalise un échec réel si la lecture des championnats échoue", async () => {
    mocks.from.mockReturnValue(
      contestsResult({ data: null, error: { message: "database unavailable" } }),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { contests: 0 },
      "contest_read_failed",
    );
  });

  it("clôt sainement un passage sans championnat actif", async () => {
    mocks.from.mockReturnValue(contestsResult({ data: [], error: null }));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, contests: 0 }));
    expect(mocks.finishWorkerRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ contests: 0 }),
      undefined,
    );
  });
});
