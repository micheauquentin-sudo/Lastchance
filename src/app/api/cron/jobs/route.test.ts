// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  settleJob: vi.fn(),
  startWorkerRun: vi.fn(),
  finishWorkerRun: vi.fn(),
  drainWebhookDeliveries: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) => (name === "CRON_SECRET" ? "cron-secret" : undefined),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/jobs", () => ({
  settleJob: (...args: unknown[]) => mocks.settleJob(...args),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRun: (...args: unknown[]) => mocks.startWorkerRun(...args),
  finishWorkerRun: (...args: unknown[]) => mocks.finishWorkerRun(...args),
}));
vi.mock("@/lib/webhook-worker", () => ({
  drainWebhookDeliveries: (...args: unknown[]) =>
    mocks.drainWebhookDeliveries(...args),
}));
vi.mock("@/lib/monitoring", () => ({
  monitored: (_name: string, fn: () => unknown) => fn(),
  reportError: (...args: unknown[]) => mocks.reportError(...args),
}));
vi.mock("@/lib/automations", () => ({
  processAutomationRunJob: vi.fn(),
  processBudgetPausedJob: vi.fn(),
  processLowStockJob: vi.fn(),
}));
vi.mock("@/lib/newsletter-worker", () => ({
  processNewsletterJob: vi.fn(),
}));
vi.mock("@/lib/reengagement", () => ({
  reengageOrganization: vi.fn(),
}));

import { GET } from "./route";

const request = (path = "/api/cron/jobs", token = "cron-secret") =>
  new Request(`https://app.example.com${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRun.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRun.mockResolvedValue(undefined);
  mocks.settleJob.mockResolvedValue(undefined);
  mocks.drainWebhookDeliveries.mockResolvedValue({
    claimed: 0,
    delivered: 0,
    deadLettered: 0,
  });
});

describe("GET /api/cron/jobs", () => {
  it("refuse un appel non authentifié avant tout accès à la file", async () => {
    const response = await GET(request("/api/cron/jobs", "wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRun).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("le mode probe ne réclame qu'un job inerte et ne draine pas les webhooks", async () => {
    let claims = 0;
    mocks.rpc.mockImplementation(async (name: string, args?: unknown) => {
      if (name === "claim_jobs") {
        expect(args).toEqual(
          expect.objectContaining({ p_types: ["ops.probe"], p_limit: 1 }),
        );
        claims += 1;
        return claims === 1
          ? {
              data: [
                {
                  id: "probe-1",
                  type: "ops.probe",
                  payload: {},
                  attempts: 1,
                  max_attempts: 1,
                },
              ],
              error: null,
            }
          : { data: [], error: null };
      }
      throw new Error(`RPC inattendue: ${name}`);
    });

    const response = await GET(request("/api/cron/jobs?probe=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        probe: true,
        processed: 1,
        completed: 1,
      }),
    );
    expect(mocks.settleJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "ops.probe" }),
      { status: "completed" },
    );
    expect(mocks.drainWebhookDeliveries).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("requeue_stale_jobs");
    expect(mocks.finishWorkerRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ processed: 1, completed: 1 }),
    );
  });

  it("rend un échec HTTP et clôt le heartbeat si le claim échoue", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "requeue_stale_jobs"
        ? { data: 0, error: null }
        : { data: null, error: { message: "claim unavailable" } },
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      expect.anything(),
      "worker_execution_failed",
    );
  });
});
