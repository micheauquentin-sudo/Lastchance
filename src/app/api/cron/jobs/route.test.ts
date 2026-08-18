// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  settleJob: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
  drainWebhookDeliveries: vi.fn(),
  reportError: vi.fn(),
  processScheduleBlockedJob: vi.fn(),
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
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
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
  processScheduleBlockedJob: (...args: unknown[]) =>
    mocks.processScheduleBlockedJob(...args),
}));
vi.mock("@/lib/newsletter-worker", () => ({
  processNewsletterJob: vi.fn(),
}));
vi.mock("@/lib/reengagement", () => ({
  reengageOrganization: vi.fn(),
}));
// Lecture d'observation jouée après le travail sur un client réel : sans ce
// double, le passage non-probe tomberait sur `admin.from` que ce harnais ne
// fournit pas, et le 500 qui en sortirait masquerait le dispatch qu'on teste.
vi.mock("@/lib/sms-dispatch", () => ({
  countStaleSmsDeliveries: vi.fn(async () => 0),
  processSmsSendJob: vi.fn(),
}));

import { GET } from "./route";

const request = (path = "/api/cron/jobs", token = "cron-secret") =>
  new Request(`https://app.example.com${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.settleJob.mockResolvedValue(undefined);
  mocks.drainWebhookDeliveries.mockResolvedValue({
    claimed: 0,
    delivered: 0,
    deadLettered: 0,
    deferred: 0,
    settleFailed: 0,
  });
});

describe("GET /api/cron/jobs", () => {
  it("refuse un appel non authentifié avant tout accès à la file", async () => {
    const response = await GET(request("/api/cron/jobs", "wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
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
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ processed: 1, completed: 1 }),
    );
  });

  it("réclame ET traite `automation.schedule-blocked`, jamais un « type inconnu »", async () => {
    // LE DÉFAUT QUE CE TEST FERME (SD-9). La base dépose ce job depuis
    // `20260926120000`. Sans son type dans `p_types`, il n'est jamais réclamé —
    // le commerçant n'est pas prévenu, et rien ne le signale ; sans son `case`
    // dans le dispatch, il tombe dans le `default:` (« type inconnu »), échoue
    // cinq fois puis part en dead-letter. Les deux moitiés sont vérifiées ici
    // parce qu'en oublier une suffit à rétablir le silence.
    mocks.processScheduleBlockedJob.mockResolvedValue({ status: "completed" });
    let claims = 0;
    mocks.rpc.mockImplementation(async (name: string, args?: unknown) => {
      if (name === "requeue_stale_jobs") return { data: 0, error: null };
      if (name === "claim_jobs") {
        expect((args as { p_types: string[] }).p_types).toContain(
          "automation.schedule-blocked",
        );
        claims += 1;
        return claims === 1
          ? {
              data: [
                {
                  id: "blocked-1",
                  type: "automation.schedule-blocked",
                  payload: { campaignId: "camp-1", organizationId: "org-1" },
                  attempts: 1,
                  max_attempts: 5,
                },
              ],
              error: null,
            }
          : { data: [], error: null };
      }
      throw new Error(`RPC inattendue: ${name}`);
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ processed: 1, completed: 1 }));
    expect(mocks.processScheduleBlockedJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "automation.schedule-blocked" }),
    );
    expect(mocks.settleJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "blocked-1" }),
      { status: "completed" },
    );
  });

  it("passe au drain SON horloge, et publie le reliquat au heartbeat", async () => {
    // LE DÉFAUT QUE CE TEST FERME (JOB-1). Le drain repartait avec un budget
    // neuf alors que la file de jobs venait d'en consommer l'essentiel : c'est
    // la fonction Vercel qui tranchait, au milieu d'un appel sortant.
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "requeue_stale_jobs"
        ? { data: 0, error: null }
        : { data: [], error: null },
    );
    mocks.drainWebhookDeliveries.mockResolvedValue({
      claimed: 8,
      delivered: 5,
      deadLettered: 0,
      deferred: 3,
      settleFailed: 1,
    });

    await GET(request());

    expect(mocks.drainWebhookDeliveries).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ budgetMs: 45_000, startedAt: expect.any(Number) }),
    );
    // DÉGRADÉ, et non « succeeded » : une clôture refusée par la base (JOB-9)
    // signifie qu'une livraison partie sera réclamée à nouveau au passage
    // suivant, donc RENVOYÉE au commerçant. Publier le compteur sans jamais
    // l'agir laisserait l'objectif « workers » au vert pendant qu'on perd des
    // états. Le reliquat (`webhooksDeferred`), lui, est nominal et ne dégrade
    // pas — c'est la seule différence entre les deux compteurs.
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.objectContaining({ webhooksDeferred: 3, webhooksSettleFailed: 1 }),
    );
  });

  it("un reliquat de webhooks SEUL ne dégrade pas le passage (JOB-9)", async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "requeue_stale_jobs"
        ? { data: 0, error: null }
        : { data: [], error: null },
    );
    mocks.drainWebhookDeliveries.mockResolvedValue({
      claimed: 8,
      delivered: 5,
      deadLettered: 0,
      deferred: 3,
      settleFailed: 0,
    });

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "succeeded",
      expect.objectContaining({ webhooksDeferred: 3, webhooksSettleFailed: 0 }),
    );
  });

  it("travaille même sans journal de santé (JOB-7)", async () => {
    // Ce worker était le seul des quatre crons instrumentés à REFUSER de
    // travailler faute de heartbeat : une panne du journal arrêtait la file
    // entière — newsletters, relances, SMS — alors que `claim_jobs` protège
    // déjà par verrou et idempotence.
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "requeue_stale_jobs"
        ? { data: 0, error: null }
        : { data: [], error: null },
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_jobs", expect.anything());
    expect(mocks.drainWebhookDeliveries).toHaveBeenCalled();
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      expect.anything(),
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
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      expect.anything(),
      "worker_execution_failed",
    );
  });
});
