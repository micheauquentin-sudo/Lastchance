import { afterEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// Rappel quotidien du Calendrier — anti-doublon inter-runs (email_log)
//
// On mocke l'envoi et le monitoring ; l'admin est un faux configurable qui
// simule la RÉSERVATION email_log (on-conflict-do-nothing) : seules les clés
// « nouvellement insérées » sont renvoyées, exactement comme la base dédoublonne.
// ────────────────────────────────────────────────────────────

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn(() => Promise.resolve(true)) }));

vi.mock("@/lib/resend", () => ({ sendCalendarReminderEmail: sendMock }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

import { calendarReminderDedupKey, runCalendarReminders } from "./calendar-reminders";

interface Target {
  calendar_id: string;
  organization_id: string;
  player_id: string;
  email: string;
  calendar_name: string;
  public_slug: string;
  theme: string;
  day_id: string;
  day_index: number;
  unlock_at: string;
}

function target(playerId: string, email: string, over: Partial<Target> = {}): Target {
  return {
    calendar_id: "cal-1",
    organization_id: "org-1",
    player_id: playerId,
    email,
    calendar_name: "Avent Chez Marco",
    public_slug: "mon-avent",
    theme: "noel",
    day_id: "day-1",
    day_index: 1,
    unlock_at: "2026-12-05T00:00:00.000Z",
    ...over,
  };
}

/**
 * Faux client admin : renvoie les cibles au RPC, et pour email_log.upsert().select()
 * ne renvoie QUE `reservedKeys` (les rappels réellement insérés ce jour-là).
 */
function makeAdmin(opts: { targets: Target[]; reservedKeys: string[] }) {
  const upsert = vi.fn((rows: Array<{ dedup_key: string }>) => {
    void rows;
    return {
      select: () =>
        Promise.resolve({
          data: opts.reservedKeys.map((dedup_key) => ({ dedup_key })),
          error: null,
        }),
    };
  });
  const admin = {
    rpc: (name: string) =>
      Promise.resolve({
        data: name === "calendar_reminder_targets" ? opts.targets : null,
        error: null,
      }),
    from: (table: string) => {
      if (table === "email_log") return { upsert };
      if (table === "organizations") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ id: "org-1", name: "Chez Marco" }],
                error: null,
              }),
          }),
        };
      }
      return {};
    },
  };
  return { admin, upsert };
}

const NOW = new Date("2026-12-05T09:15:00.000Z");
const DAY = "2026-12-05";

afterEach(() => vi.clearAllMocks());

describe("calendarReminderDedupKey", () => {
  it("clé stable par (joueur, jour)", () => {
    expect(calendarReminderDedupKey("p1", "2026-12-05")).toBe(
      "calendar-reminder:p1:2026-12-05",
    );
  });
});

describe("runCalendarReminders — dédup inter-runs", () => {
  it("n'envoie QU'AUX cibles réellement réservées (les autres, déjà emailées, sautent)", async () => {
    const { admin, upsert } = makeAdmin({
      targets: [target("p1", "a@ex.fr"), target("p2", "b@ex.fr")],
      // p2 a déjà reçu son rappel aujourd'hui (email_log ne réinsère que p1).
      reservedKeys: [calendarReminderDedupKey("p1", DAY)],
    });

    const result = await runCalendarReminders(
      admin as unknown as Parameters<typeof runCalendarReminders>[0],
      NOW,
    );

    expect(result.targeted).toBe(2);
    expect(result.sent).toBe(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@ex.fr",
        calendarUrl: "http://localhost:3000/calendar/mon-avent",
        organizationName: "Chez Marco",
      }),
    );
    // La réservation email_log a bien été tentée pour les DEUX cibles.
    expect(upsert).toHaveBeenCalledTimes(1);
    const reservedRows = upsert.mock.calls[0][0];
    expect(reservedRows.map((r) => r.dedup_key)).toEqual([
      calendarReminderDedupKey("p1", DAY),
      calendarReminderDedupKey("p2", DAY),
    ]);
  });

  it("second run le même jour : email_log ne réinsère rien → 0 envoi", async () => {
    const { admin } = makeAdmin({
      targets: [target("p1", "a@ex.fr"), target("p2", "b@ex.fr")],
      reservedKeys: [], // tout déjà envoyé aujourd'hui
    });

    const result = await runCalendarReminders(
      admin as unknown as Parameters<typeof runCalendarReminders>[0],
      NOW,
    );

    expect(result.sent).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("aucune cible → aucun envoi, aucune écriture", async () => {
    const { admin, upsert } = makeAdmin({ targets: [], reservedKeys: [] });
    const result = await runCalendarReminders(
      admin as unknown as Parameters<typeof runCalendarReminders>[0],
      NOW,
    );
    expect(result).toEqual({ targeted: 0, sent: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("ignore les cibles sans email ou sans slug (défensif)", async () => {
    const { admin } = makeAdmin({
      targets: [
        target("p1", "a@ex.fr"),
        target("p2", "", { player_id: "p2" }),
        target("p3", "c@ex.fr", { public_slug: "" }),
      ],
      reservedKeys: [calendarReminderDedupKey("p1", DAY)],
    });
    const result = await runCalendarReminders(
      admin as unknown as Parameters<typeof runCalendarReminders>[0],
      NOW,
    );
    expect(result.targeted).toBe(1);
    expect(result.sent).toBe(1);
  });
});
