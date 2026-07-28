// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCalendarReminders: vi.fn(),
  archiveElapsedCalendars: vi.fn(),
  startWorkerRunSafely: vi.fn(),
  finishWorkerRunSafely: vi.fn(),
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
  createAdminClient: () => ({ id: "admin" }),
}));
vi.mock("@/lib/calendar-reminders", () => ({
  runCalendarReminders: (...args: unknown[]) => mocks.runCalendarReminders(...args),
  archiveElapsedCalendars: (...args: unknown[]) => mocks.archiveElapsedCalendars(...args),
}));
vi.mock("@/lib/worker-health", () => ({
  startWorkerRunSafely: (...args: unknown[]) => mocks.startWorkerRunSafely(...args),
  finishWorkerRunSafely: (...args: unknown[]) => mocks.finishWorkerRunSafely(...args),
}));

import { GET } from "./route";

const request = (token = "cron-secret") =>
  new Request("https://app.example.com/api/cron/calendar-reminders", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startWorkerRunSafely.mockResolvedValue({ id: "run-1", startedAt: Date.now() });
  mocks.finishWorkerRunSafely.mockResolvedValue(undefined);
  mocks.runCalendarReminders.mockResolvedValue({ targeted: 4, sent: 3 });
  mocks.archiveElapsedCalendars.mockResolvedValue(2);
});

describe("GET /api/cron/calendar-reminders", () => {
  it("refuse un secret invalide avant d'ouvrir un heartbeat", async () => {
    const response = await GET(request("wrong"));

    expect(response.status).toBe(401);
    expect(mocks.startWorkerRunSafely).not.toHaveBeenCalled();
    expect(mocks.runCalendarReminders).not.toHaveBeenCalled();
  });

  it("clôt le passage avec des volumes, jamais un destinataire", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({ ok: true, targeted: 4, sent: 3, archived: 2 });
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "succeeded",
      { targeted: 4, sent: 3, archived: 2 },
    );
  });

  it("journalise un échec catégorisé si l'envoi lève", async () => {
    mocks.runCalendarReminders.mockRejectedValue(
      new Error("resend a refusé joueur@exemple.fr"),
    );

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "run-1" }),
      "failed",
      { targeted: 0, sent: 0, archived: 0 },
      "reminders_failed",
    );
  });

  it("envoie et archive quand même si le journal de santé est absent", async () => {
    // L'archivage débloque la purge RGPD : le suspendre sur une panne
    // d'observabilité retarderait une obligation légale.
    mocks.startWorkerRunSafely.mockResolvedValue(null);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, targeted: 4, sent: 3, archived: 2 });
    expect(mocks.runCalendarReminders).toHaveBeenCalled();
    expect(mocks.archiveElapsedCalendars).toHaveBeenCalled();
    expect(mocks.finishWorkerRunSafely).toHaveBeenCalledWith(
      expect.anything(),
      null,
      "succeeded",
      { targeted: 4, sent: 3, archived: 2 },
    );
  });
});
