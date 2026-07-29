// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  evaluateRewardsRegistrySlo,
  evaluateWorkersSlo,
  type OpMetricSummary,
  type WorkerStatus,
} from "./ops";

function metric(op: string, calls: number): OpMetricSummary {
  return { op, calls, errorRate: 0, p50Ms: 0, p95Ms: 0 };
}

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

/**
 * Complétude du registre universel — l'objectif qui autorise (ou non) à
 * retirer le repli historique de la caisse. Il ne doit jamais verdir par
 * omission : c'est précisément parce que le repli est SILENCIEUX que ce
 * compteur existe.
 */
describe("objectif « registre des récompenses »", () => {
  it("est vert quand aucun repli n'a servi sur 24 h", () => {
    const slo = evaluateRewardsRegistrySlo([
      metric("play.spinWheel", 4200),
      metric("cashier.lookup", 130),
    ]);

    expect(slo.key).toBe("rewards-registry");
    expect(slo.ok).toBe(true);
  });

  it("vire au rouge et NOMME les familles encore hors registre", () => {
    // La bascule se fait module par module : un total agrégé ne dirait pas
    // lequel est prêt. Le nom de la famille est l'information utile.
    const slo = evaluateRewardsRegistrySlo([
      metric("rewards.registry_miss.hunt", 3),
      metric("rewards.registry_miss.quiz", 1),
      metric("play.spinWheel", 4200),
    ]);

    expect(slo.ok).toBe(false);
    expect(slo.detail).toContain("hunt, quiz");
    expect(slo.detail).toContain("4 encaissement(s)");
  });

  it("distingue un registre INJOIGNABLE d'un registre incomplet", () => {
    // Les deux interdisent la bascule, mais pour des raisons opposées : ici
    // le registre n'a pas répondu, il n'est pas « en retard de données ».
    const slo = evaluateRewardsRegistrySlo([
      metric("rewards.registry_error", 7),
    ]);

    expect(slo.ok).toBe(false);
    expect(slo.detail).toContain("7 appel(s) au registre en échec");
    expect(slo.detail).not.toContain("repli historique");
  });

  it("ne confond pas un op au nom voisin avec un compteur de repli", () => {
    // `rewards.registry_error` commence par « rewards.registry » mais n'est
    // PAS un miss : le préfixe testé doit rester celui des familles.
    const slo = evaluateRewardsRegistrySlo([
      metric("rewards.registry_miss_total", 9),
    ]);

    expect(slo.ok).toBe(true);
  });
});
