// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
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
  createAdminClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/jackpot-draws", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
});

describe("GET /api/cron/jackpot-draws", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("ne journalise que le NOMBRE de tirages, jamais les codes", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          campaign_id: "camp-1",
          organization_id: "org-1",
          cycle: 3,
          code: "JACKPOT-ABCD1234",
        },
      ],
      error: null,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({ ok: true, drawn: 1 });
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { drawn: 1 },
    );
    expect(JSON.stringify(mocks.finishWorkerRunSafely.mock.calls)).not.toContain(
      "JACKPOT-",
    );
  });

  it("journalise un échec catégorisé si le tirage échoue", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "deadlock detected" } });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { drawn: 0 },
      "draw_failed",
    );
  });

  it("tire quand même si le journal de santé est absent", async () => {
    // Le tirage est à date échue et idempotent : le suspendre parce que
    // ops_worker_runs est injoignable priverait des joueurs d'un gain déjà
    // dû. `null` = pas de journal, le travail métier a lieu.
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({
      data: [
        {
          campaign_id: "camp-1",
          organization_id: "org-1",
          cycle: 3,
          code: "JACKPOT-ABCD1234",
        },
      ],
      error: null,
    });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, drawn: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("run_jackpot_date_draws");
    // La clôture est appelée avec `null` : c'est elle qui sait ne rien faire.
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      { drawn: 1 },
    );
  });

  it("tire et signale l'échec du tirage même sans journal de santé", async () => {
    mocks.startWorkerRunSafely.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "deadlock detected" } });

    const response = await GET(request());

    // La panne du tirage reste visible : l'absence de journal ne la masque pas.
    expect(response.status).toBe(500);
    expect(mocks.reportError).toHaveBeenCalledWith(
      "cron.jackpot-draws",
      "deadlock detected",
    );
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "failed",
      { drawn: 0 },
      "draw_failed",
    );
  });
});
