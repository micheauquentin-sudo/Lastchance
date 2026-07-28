// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { evaluateWorkersSlo, type WorkerStatus } from "./ops";

function worker(overrides: Partial<WorkerStatus> & { worker: string }): WorkerStatus {
  return {
    configured: true,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastStatus: "succeeded",
    lastSuccessAt: null,
    oldestDueJobAgeMin: null,
    healthy: true,
    reason: "ok",
    ...overrides,
  };
}

describe("objectif « workers »", () => {
  it("reste vert quand le registre supervise plus que les deux workers fréquents", () => {
    // Le cas que l'ancienne règle (« exactement 2 lignes ») déclarait rouge :
    // huit workers supervisés et sains, c'est-à-dire le branchement réussi.
    const slo = evaluateWorkersSlo(
      [
        "jobs",
        "sync-contests",
        "reengage",
        "purge-data",
        "webhooks",
        "automations",
        "calendar-reminders",
        "jackpot-draws",
      ].map((name) => worker({ worker: name })),
    );

    expect(slo.key).toBe("workers");
    expect(slo.ok).toBe(true);
    expect(slo.detail).toContain("calendar-reminders: OK");
  });

  it("reste vert sur les deux seuls workers supervisés aujourd'hui", () => {
    const slo = evaluateWorkersSlo([
      worker({ worker: "jobs" }),
      worker({ worker: "sync-contests" }),
    ]);

    expect(slo.ok).toBe(true);
  });

  it("vire au rouge dès qu'un worker supervisé est malade, et le nomme", () => {
    const slo = evaluateWorkersSlo([
      worker({ worker: "jobs" }),
      worker({ worker: "sync-contests" }),
      worker({ worker: "purge-data", healthy: false, reason: "heartbeat_stale" }),
    ]);

    expect(slo.ok).toBe(false);
    expect(slo.detail).toContain("purge-data: heartbeat_stale");
  });

  it("refuse de verdir quand un worker fréquent n'est plus supervisé du tout", () => {
    // Repasser `jobs` en enabled = false le ferait DISPARAÎTRE de
    // ops_workers_health() : sans ce contrôle, l'angle mort se lirait « OK ».
    const slo = evaluateWorkersSlo([
      worker({ worker: "sync-contests" }),
      worker({ worker: "purge-data" }),
    ]);

    expect(slo.ok).toBe(false);
    expect(slo.detail).toContain("non supervisé(s) : jobs");
  });

  it("distingue une santé indisponible d'un parc sain", () => {
    const slo = evaluateWorkersSlo([]);

    expect(slo.ok).toBe(false);
    expect(slo.detail).toBe("santé réelle indisponible");
  });
});
