// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportError = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

import {
  FREQUENT_WORKERS,
  WORKER_NAMES,
  finishWorkerRun,
  finishWorkerRunSafely,
  startWorkerRun,
} from "./worker-health";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registre des workers", () => {
  it("couvre les huit workers semés dans ops_worker_definitions", () => {
    // Miroir de la migration 20260805240000 : un nom qui diverge est refusé
    // par la clé étrangère ops_worker_runs_worker_fkey, en production
    // seulement — d'où cette liste figée ici.
    expect([...WORKER_NAMES]).toEqual([
      "jobs",
      "sync-contests",
      "reengage",
      "purge-data",
      "webhooks",
      "automations",
      "calendar-reminders",
      "jackpot-draws",
    ]);
  });

  it("ne compte comme fréquents que les deux workers exigés par le healthcheck", () => {
    expect([...FREQUENT_WORKERS]).toEqual(["jobs", "sync-contests"]);
    for (const worker of FREQUENT_WORKERS) {
      expect(WORKER_NAMES).toContain(worker);
    }
  });
});

describe("worker heartbeats", () => {
  it("ouvre un run authentifié sans payload métier", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({ data: { id: "run-1" }, error: null }),
      }),
    });
    const admin = { from: vi.fn().mockReturnValue({ insert }) };

    await expect(startWorkerRun(admin as never, "jobs")).resolves.toEqual(
      expect.objectContaining({ id: "run-1" }),
    );
    expect(admin.from).toHaveBeenCalledWith("ops_worker_runs");
    expect(insert).toHaveBeenCalledWith({ worker: "jobs", status: "running" });
  });

  it("refuse de continuer si le journal ne peut pas être créé", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { message: "database unavailable" },
            }),
          }),
        }),
      }),
    };

    await expect(startWorkerRun(admin as never, "jobs")).rejects.toThrow(
      "Journal de santé du worker indisponible.",
    );
    expect(reportError).toHaveBeenCalledWith(
      "cron.jobs.heartbeat.start",
      "database unavailable",
    );
  });

  it("borne les compteurs et ne stocke qu'un code d'erreur contrôlé", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "run-1" },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ maybeSingle });
    const secondEq = vi.fn().mockReturnValue({ select });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const update = vi.fn().mockReturnValue({ eq: firstEq });
    const admin = { from: vi.fn().mockReturnValue({ update }) };

    await finishWorkerRun(
      admin as never,
      { id: "run-1", startedAt: Date.now() - 10 },
      "degraded",
      {
        processed: 1.6,
        invalid: Number.POSITIVE_INFINITY,
        negative: -2,
      },
      "x".repeat(200),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        counters: { processed: 2, invalid: 0, negative: 0 },
        error_code: "x".repeat(120),
      }),
    );
    expect(firstEq).toHaveBeenCalledWith("id", "run-1");
    expect(secondEq).toHaveBeenCalledWith("status", "running");
  });

  it("échoue si aucun run encore ouvert n'a été clôturé", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      finishWorkerRun(
        admin as never,
        { id: "run-1", startedAt: Date.now() },
        "succeeded",
        {},
      ),
    ).rejects.toThrow("Clôture du journal de santé impossible.");
  });

  it("ne masque pas la panne d'origine quand la clôture d'un échec échoue", async () => {
    const admin = {
      from: vi.fn().mockReturnValue({
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: "database unavailable" },
                }),
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      finishWorkerRunSafely(
        admin as never,
        { id: "run-1", startedAt: Date.now() },
        "failed",
        { processed: 0 },
        "orgs_read_failed",
      ),
    ).resolves.toBeUndefined();
    // Silencieuse pour l'appelant, jamais pour la supervision.
    expect(reportError).toHaveBeenCalledWith(
      "cron.heartbeat.failed",
      "database unavailable",
    );
  });
});
