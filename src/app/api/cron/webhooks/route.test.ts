// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drain: vi.fn(),
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
  createAdminClient: () => ({ id: "admin" }),
}));
vi.mock("@/lib/webhook-worker", () => ({
  drainWebhookDeliveries: (...args: unknown[]) => mocks.drain(...args),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/webhooks", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
});

describe("GET /api/cron/webhooks", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.drain).not.toHaveBeenCalled();
  });

  it("compte les accusés en dead-letter sans dégrader le worker", async () => {
    // L'endpoint distant échoue, pas le drain : dégrader ici rendrait le
    // worker rouge pour la panne de quelqu'un d'autre.
    mocks.drain.mockResolvedValue({
      claimed: 3,
      delivered: 2,
      deadLettered: 1,
      deferred: 0,
      settleFailed: 0,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      claimed: 3,
      delivered: 2,
      deadLettered: 1,
      deferred: 0,
      settleFailed: 0,
    });
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { claimed: 3, delivered: 2, deadLettered: 1, deferred: 0, settleFailed: 0 },
      undefined,
    );
  });

  it("borne le drain par un budget temps", async () => {
    // Sans budget, un lot d'endpoints lents faisait expirer la fonction au
    // milieu d'une livraison : sans réponse, sans clôture, et sans trace.
    mocks.drain.mockResolvedValue({
      claimed: 8,
      delivered: 5,
      deadLettered: 0,
      deferred: 3,
      settleFailed: 0,
    });

    await GET(request());

    expect(mocks.drain).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ budgetMs: 45_000 }),
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "succeeded",
      expect.objectContaining({ deferred: 3 }),
      // Un reliquat relâché faute de budget est NOMINAL sur une file drainée
      // toutes les 5 minutes : il se compte, il ne dégrade pas.
      undefined,
    );
  });

  it("dégrade le worker quand une clôture est refusée par la base (JOB-9)", async () => {
    // Publier `settleFailed` sans jamais l'agir laisserait l'objectif
    // « workers » du back-office au vert pendant qu'on perd des états : une
    // livraison partie dont l'accusé n'a pas pu s'écrire sera RÉCLAMÉE À
    // NOUVEAU au passage suivant, donc renvoyée au commerçant.
    mocks.drain.mockResolvedValue({
      claimed: 3,
      delivered: 3,
      deadLettered: 0,
      deferred: 0,
      settleFailed: 2,
    });

    const response = await GET(request());

    // Le drain a bien eu lieu : dégradé n'est pas échoué.
    expect(response.status).toBe(200);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.objectContaining({ settleFailed: 2 }),
      "webhook_settle_failed",
    );
  });

  it("journalise un échec catégorisé si le drain lève", async () => {
    mocks.drain.mockRejectedValue(new Error("secret https://exemple/hook"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { claimed: 0, delivered: 0, deadLettered: 0, deferred: 0, settleFailed: 0 },
      "webhook_drain_failed",
    );
    // Le message brut (URL comprise) part à Sentry, jamais au journal.
    expect(mocks.reportError).toHaveBeenCalled();
  });

  it("draine quand même si le journal de santé est absent", async () => {
    // Filet de sécurité : une file de webhooks qui s'accumule coûte plus cher
    // qu'un passage non journalisé. `null` = pas de journal, le drain a lieu.
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mocks.drain.mockResolvedValue({
      claimed: 2,
      delivered: 2,
      deadLettered: 0,
      deferred: 0,
      settleFailed: 0,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      claimed: 2,
      delivered: 2,
      deadLettered: 0,
      deferred: 0,
      settleFailed: 0,
    });
    expect(mocks.drain).toHaveBeenCalled();
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      { claimed: 2, delivered: 2, deadLettered: 0, deferred: 0, settleFailed: 0 },
      undefined,
    );
  });
});
