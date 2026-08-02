import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteCalendar — LE CALENDRIER SUPPRIMÉ EMPORTAIT LES CODES CADEAU-
//
// `calendar_openings.calendar_id` cascade (20260728120000:267-268). Ce que la
// garde de RÉDUCTION DE GRILLE (`CALENDAR_DAY_LOSS_HINT`) protège déjà pour
// quelques cases — avec son chiffre — la suppression du calendrier entier le
// détruisait sur la totalité, et sans le moindre comptage.
//
// Le même écran savait donc déjà nommer ce nombre ; il ne le faisait que sur
// le geste le moins destructeur des deux.
// ────────────────────────────────────────────────────────────

const CALENDAR_ID = "55555555-5555-4555-8555-555555555555";

const { state } = vi.hoisted(() => ({
  state: {
    /** Codes CADEAU- de ce calendrier encore non remis en caisse. */
    enAttente: 0,
    deletes: [] as string[],
    filtresComptage: [] as Array<[string, unknown]>,
    role: "owner" as string,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1" },
    organization: { id: "org-1", timezone: "Europe/Paris" },
    role: state.role,
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({
  monitored: <T,>(_n: string, fn: () => Promise<T>) => fn(),
  reportError: vi.fn(),
  reportSecurityEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "calendar_openings") {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return c;
          },
          not: (col: string, _op: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return c;
          },
          is: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return Promise.resolve({ count: state.enAttente, error: null });
          },
        };
        return c;
      }
      const s: Record<string, unknown> = {
        delete: () => s,
        eq: (col: string, val: unknown) => {
          if (col === "id") state.deletes.push(String(val));
          return col === "organization_id"
            ? Promise.resolve({ error: null })
            : s;
        },
      };
      return s;
    },
  })),
}));

const { deleteCalendar } = await import("./calendar");
const { CALENDAR_DELETE_LOSS_HINT } = await import("@/lib/validations/calendar");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", CALENDAR_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteCalendar — les codes CADEAU- non retirés", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.deletes = [];
    state.filtresComptage = [];
    state.role = "owner";
  });

  it("refuse tant qu'un code CADEAU- attend en caisse", async () => {
    state.enAttente = 5;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("5");
    expect(res.ok === false && res.error).toContain(CALENDAR_DELETE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 5;
    await expect(deleteCalendar(null, form(true))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(state.deletes).toEqual([CALENDAR_ID]);
  });

  it("ne demande rien quand tous les codes ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : invisible sur le cas nominal.
    await expect(deleteCalendar(null, form(false))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(state.deletes).toEqual([CALENDAR_ID]);
  });

  it("le refus de RÔLE ne porte pas le marqueur et ne compte rien", async () => {
    state.role = "cashier";
    state.enAttente = 5;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(CALENDAR_DELETE_LOSS_HINT);
    expect(state.filtresComptage).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("compte les codes de SON calendrier et de SON organisation, non remis", async () => {
    state.enAttente = 1;
    await deleteCalendar(null, form(false));

    expect(state.filtresComptage).toEqual([
      ["calendar_id", CALENDAR_ID],
      ["organization_id", "org-1"],
      ["code", null],
      ["redeemed_at", null],
    ]);
  });
});
