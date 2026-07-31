import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updateCalendar — RÉDUIRE LA GRILLE DÉTRUISAIT LES CODES DÉJÀ DISTRIBUÉS
//
// `calendar_openings.day_id` cascade depuis `calendar_days`
// (20260728120000:265-266). Ramener « Nombre de cases » de 24 à 15 sur un
// calendrier ACTIF supprimait les cases 16..24 et, avec elles, les ouvertures
// des joueurs — donc les codes CADEAU- qu'ils gardaient sur leur téléphone.
// Le commerçant obtenait « Enregistré. » sans un mot ; le client se voyait
// répondre « code introuvable » au comptoir.
//
// PRINCIPE (celui de deleteEventSession / deleteCampaign) : on ne touche pas à
// la cascade — la retirer donnerait un 23503 opaque. On refuse tant que le
// commerçant n'a pas confirmé, et le refus NOMME le nombre de cases ET le
// nombre de codes. La case de confirmation n'apparaît donc à l'écran qu'une
// fois le coût connu.
// ────────────────────────────────────────────────────────────

const CALENDAR_ID = "00000000-0000-4000-8000-0000000000c1";

const { state } = vi.hoisted(() => ({
  state: {
    /** Nombre de cases actuellement configuré. */
    dayCountCourant: 24,
    /** Cases qui se trouvent au-delà du nouveau nombre demandé. */
    casesCondamnees: [] as string[],
    /** Ouvertures portées par ces cases (total, puis codes non retirés). */
    ouvertures: 0,
    codesEnAttente: 0,
    /** Filtres posés sur la recherche des cases condamnées. */
    filtresCases: [] as Array<[string, unknown]>,
    /** Filtres posés sur les DEUX comptages d'ouvertures. */
    filtresComptages: [] as Array<Array<[string, unknown]>>,
    /** Les mises à jour de la ligne `calendars` réellement parties. */
    updates: [] as Array<Record<string, unknown>>,
    /** Les suppressions de cases réellement parties (via syncCalendarDays). */
    suppressions: [] as string[][],
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
      if (table === "calendars") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          update: (fields: Record<string, unknown>) => {
            state.updates.push(fields);
            return chaine;
          },
          eq: (col: string) =>
            col === "organization_id" && state.updates.length > 0
              ? Promise.resolve({ error: null })
              : chaine,
          maybeSingle: () =>
            Promise.resolve({
              data: {
                start_date: "2026-12-01",
                day_count: state.dayCountCourant,
                timezone: "Europe/Paris",
              },
              error: null,
            }),
        };
        return chaine;
      }

      if (table === "calendar_days") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          update: () => chaine,
          insert: () => Promise.resolve({ error: null }),
          delete: () => chaine,
          in: (_col: string, ids: string[]) => {
            state.suppressions.push(ids);
            return chaine;
          },
          eq: (col: string, val: unknown) => {
            state.filtresCases.push([col, val]);
            return chaine;
          },
          gt: (col: string, val: unknown) => {
            state.filtresCases.push([col, val]);
            return Promise.resolve({
              data: state.casesCondamnees.map((id) => ({ id })),
              error: null,
            });
          },
          // Le `select` sans `.gt` (celui de syncCalendarDays) est attendu ici.
          then: (
            onFulfilled: (v: { data: unknown; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) =>
            Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
        };
        return chaine;
      }

      if (table === "calendar_openings") {
        const filtres: Array<[string, unknown]> = [];
        state.filtresComptages.push(filtres);
        // Le 1er comptage est le total, le 2e celui des codes non retirés :
        // ils partent en Promise.all dans l'ordre où ils sont écrits.
        const rang = state.filtresComptages.length;
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          eq: (col: string, val: unknown) => {
            filtres.push([col, val]);
            return chaine;
          },
          in: (col: string, val: unknown) => {
            filtres.push([col, Array.isArray(val) ? val.length : val]);
            return chaine;
          },
          not: (col: string, op: string, val: unknown) => {
            filtres.push([`not:${col}:${op}`, val]);
            return chaine;
          },
          is: (col: string, val: unknown) => {
            filtres.push([col, val]);
            return chaine;
          },
          then: (
            onFulfilled: (v: { count: number; error: null }) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) =>
            Promise.resolve({
              count: rang === 1 ? state.ouvertures : state.codesEnAttente,
              error: null,
            }).then(onFulfilled, onRejected),
        };
        return chaine;
      }

      throw new Error(`table inattendue: ${table}`);
    },
  })),
}));

const { updateCalendar } = await import("./calendar");
const { CALENDAR_DAY_LOSS_HINT } = await import("@/lib/validations/calendar");

/** Formulaire de réglages complet, seul `day_count` variant d'un cas à l'autre. */
function form(dayCount: number, confirme = false) {
  const fd = new FormData();
  fd.set("id", CALENDAR_ID);
  fd.set("name", "Calendrier de l'Avent");
  fd.set("theme", "noel");
  fd.set("start_date", "2026-12-01");
  fd.set("timezone", "Europe/Paris");
  fd.set("day_count", String(dayCount));
  fd.set("public_slug", "avent-2026");
  fd.set("merchant_content", "");
  fd.set("completion_reward_label", "Un bon de 20 €");
  fd.set("completion_reward_details", "");
  fd.set("completion_reward_stock", "10");
  if (confirme) fd.set("confirm_day_loss", "1");
  return fd;
}

describe("updateCalendar — les cases déjà ouvertes", () => {
  beforeEach(() => {
    state.dayCountCourant = 24;
    state.casesCondamnees = [];
    state.ouvertures = 0;
    state.codesEnAttente = 0;
    state.filtresCases = [];
    state.filtresComptages = [];
    state.updates = [];
    state.suppressions = [];
    state.role = "owner";
  });

  it("refuse la réduction et NOMME les cases et les codes en jeu", async () => {
    state.casesCondamnees = ["d16", "d17", "d18", "d19", "d20", "d21", "d22", "d23", "d24"];
    state.ouvertures = 37;
    state.codesEnAttente = 4;

    const res = await updateCalendar(null, form(15));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Les trois chiffres qui permettent d'arbitrer : ce qui reste, ce qui
    // disparaît, ce qui sera refusé au comptoir.
    expect(res.error).toContain("15");
    expect(res.error).toContain("9");
    expect(res.error).toContain("37");
    expect(res.error).toContain("4");
    // Et surtout : RIEN n'est parti en base, ni la ligne, ni les cases.
    expect(state.updates).toEqual([]);
    expect(state.suppressions).toEqual([]);
  });

  it("réduit quand le commerçant confirme en connaissance de cause", async () => {
    state.casesCondamnees = ["d16"];
    state.ouvertures = 3;
    state.codesEnAttente = 1;

    const res = await updateCalendar(null, form(15, true));

    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].day_count).toBe(15);
  });

  it("laisse passer la réduction quand personne n'a encore rien ouvert", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : un calendrier en brouillon se raccourcit
    // sans obstacle. Une garde qui se déclenche aussi là apprendrait au
    // commerçant à cocher sans lire, et ne vaudrait plus rien le jour où elle
    // compte.
    state.casesCondamnees = ["d16", "d17"];
    state.ouvertures = 0;
    state.codesEnAttente = 0;

    const res = await updateCalendar(null, form(15));

    expect(res.ok).toBe(true);
    expect(state.updates).toHaveLength(1);
  });

  it("ne compte rien du tout quand la grille s'AGRANDIT", async () => {
    // Ajouter des cases ne détruit rien : aucun comptage, aucun refus.
    const res = await updateCalendar(null, form(31));

    expect(res.ok).toBe(true);
    expect(state.filtresComptages).toEqual([]);
  });

  it("compte les ouvertures de SON organisation et des SEULES cases perdues", async () => {
    state.casesCondamnees = ["d16", "d17"];
    state.ouvertures = 5;

    await updateCalendar(null, form(15));

    // Recherche des cases condamnées : scopée calendrier + organisation, et
    // bornée aux index STRICTEMENT au-delà du nouveau nombre.
    expect(state.filtresCases).toEqual([
      ["calendar_id", CALENDAR_ID],
      ["organization_id", "org-1"],
      ["day_index", 15],
    ]);
    // Comptage 1 : total des ouvertures perdues.
    expect(state.filtresComptages[0]).toEqual([
      ["organization_id", "org-1"],
      ["day_id", 2],
    ]);
    // Comptage 2 : les codes émis et pas encore retirés. Sans le scope
    // d'organisation, un calendrier voisin ferait refuser la réduction — et
    // divulguerait au passage l'activité d'un autre commerçant.
    expect(state.filtresComptages[1]).toEqual([
      ["organization_id", "org-1"],
      ["day_id", 2],
      ["not:code:is", null],
      ["redeemed_at", null],
    ]);
  });

  it("le refus porte le marqueur que l'écran attend pour offrir la case", async () => {
    // Sans ce marqueur partagé, la case de confirmation n'apparaîtrait jamais
    // — ou apparaîtrait sur un nom vide, où elle n'a aucun sens.
    state.casesCondamnees = ["d16"];
    state.ouvertures = 1;

    const res = await updateCalendar(null, form(15));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(CALENDAR_DAY_LOSS_HINT);
  });

  it("laisse la garde de rôle passer avant tout comptage", async () => {
    state.role = "cashier";
    state.casesCondamnees = ["d16"];
    state.ouvertures = 9;

    const res = await updateCalendar(null, form(15, true));

    expect(res.ok).toBe(false);
    expect(state.filtresComptages).toEqual([]);
    expect(state.updates).toEqual([]);
  });
});
