// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* ════════════════════════════════════════════════════════════
 * GET /api/cron/weekly-digest
 *
 * La route ne porte aucune règle métier : elle authentifie, tient le
 * heartbeat et publie des compteurs. Ce sont donc ces trois choses qui sont
 * testées ici — le filtre d'opt-out, le seuil et le tri des montants sont
 * gardés dans `src/lib/weekly-digest.test.ts`.
 * ════════════════════════════════════════════════════════════ */

const mocks = vi.hoisted(() => ({
  runWeeklyDigest: vi.fn(),
  reportError: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  optionalEnv: (name: string) => (name === "CRON_SECRET" ? "cron-secret" : undefined),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: (...a: unknown[]) => mocks.reportError(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ marker: "admin" }),
}));
vi.mock("@/lib/weekly-digest", () => ({
  runWeeklyDigest: (...a: unknown[]) => mocks.runWeeklyDigest(...a),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...a: unknown[]) => mocks.startWorkerRunSafely(...a),
  finishWorkerRunSafely: (...a: unknown[]) => mocks.finishWorkerRunSafely(...a),
}));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/weekly-digest", {
    headers: { authorization: `Bearer ${token}` },
  });

function counters(over: Record<string, number> = {}) {
  return {
    organizations: 3,
    deferred: 0,
    eligible_recipients: 3,
    sent: 3,
    skipped_empty: 0,
    skipped_no_recipient: 0,
    skipped_already_sent: 0,
    digest_failed: 0,
    not_configured: 0,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.runWeeklyDigest.mockResolvedValue(counters());
});

describe("garde d'accès", () => {
  it("refuse un secret invalide AVANT d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.runWeeklyDigest).not.toHaveBeenCalled();
  });

  it("secret absent : 500, et aucun envoi", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ optionalEnv: () => undefined }));
    const { GET: GETSansSecret } = await import("./route");

    const response = await GETSansSecret(request());

    expect(response.status).toBe(500);
    expect(mocks.runWeeklyDigest).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });
});

describe("passage nominal", () => {
  it("publie les compteurs et clôt le heartbeat en `succeeded`", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, sent: 3, organizations: 3 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      expect.objectContaining({ sent: 3 }),
      undefined,
    );
  });

  it("travaille sans journal de santé", async () => {
    mocks.startWorkerRunSafely.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.runWeeklyDigest).toHaveBeenCalledTimes(1);
  });
});

describe("dégradations — chacune porte son code", () => {
  it("reliquat d'organisations", async () => {
    mocks.runWeeklyDigest.mockResolvedValue(counters({ deferred: 50 }));

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.objectContaining({ deferred: 50 }),
      "organizations_deferred",
    );
  });

  it("agrégation partielle", async () => {
    mocks.runWeeklyDigest.mockResolvedValue(counters({ digest_failed: 2 }));

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.anything(),
      "digest_partial",
    );
  });

  it("Resend non configuré : dégradé, et nommé comme tel", async () => {
    // Sans ce code, un environnement sans clé d'envoi passerait pour un parc
    // sans activité — un silence indistinguable d'une semaine calme.
    mocks.runWeeklyDigest.mockResolvedValue(
      counters({ not_configured: 1, organizations: 0, sent: 0 }),
    );

    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "degraded",
      expect.anything(),
      "resend_not_configured",
    );
  });

  it("TÉMOIN — un passage propre ne porte AUCUN code", async () => {
    await GET(request());

    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "succeeded",
      expect.anything(),
      undefined,
    );
  });
});

describe("panne", () => {
  it("lecture impossible : 500, heartbeat `failed`, remontée", async () => {
    mocks.runWeeklyDigest.mockRejectedValue(new Error("connection reset"));

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "cron.weekly-digest",
      expect.anything(),
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "failed",
      { sent: 0 },
      "digest_failed",
    );
  });
});
