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
//
// ── SECOND TOUR : LA GARDE VOYAIT LA MOITIÉ DES CODES ──────
//
// DEUX tables portent un code CADEAU- encaissable et cascadent depuis
// `calendars` : `calendar_openings` (le lot d'une CASE) et `calendar_rewards`
// (la récompense d'ASSIDUITÉ — 20260728120000:279-296, même préfixe, même
// famille en caisse via `sync_reward_issuance`, et le lot le plus cher du
// module). La garde d'origine ne comptait que la première, tout en affirmant
// dans son en-tête couvrir « la totalité des cases ».
//
// Le scénario laissé ouvert : calendrier de décembre, cases retirées en
// janvier, trois clients n'ont pas présenté leur cadeau final. Ménage en
// février → `calendar_openings` rend 0 → aucune confirmation → les trois codes
// finaux disparaissent.
// ────────────────────────────────────────────────────────────

const CALENDAR_ID = "55555555-5555-4555-8555-555555555555";

const { state } = vi.hoisted(() => ({
  state: {
    /** Codes CADEAU- de CASE encore non remis (`calendar_openings`). */
    enAttente: 0,
    /** Codes CADEAU- d'ASSIDUITÉ encore non remis (`calendar_rewards`). */
    assiduiteEnAttente: 0,
    /** Le comptage des cases échoue-t-il ? */
    comptageEnPanne: false,
    /** `count: null` sans `error` : la forme muette que `?? 0` avalait. */
    comptageMuet: false,
    deletes: [] as string[],
    filtresComptage: [] as Array<[string, unknown]>,
    /** Filtres posés sur le comptage d'assiduité, comptés à part. */
    filtresAssiduite: [] as Array<[string, unknown]>,
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
            if (state.comptageEnPanne) {
              return Promise.resolve({
                count: null,
                error: { message: "timeout PostgREST" },
              });
            }
            if (state.comptageMuet) {
              return Promise.resolve({ count: null, error: null });
            }
            return Promise.resolve({ count: state.enAttente, error: null });
          },
        };
        return c;
      }
      // La SECONDE table de codes CADEAU-, celle que la garde d'origine ne
      // voyait pas. Pas de `.not("code", …)` attendu ici : `calendar_rewards`
      // a une colonne `code` NOT NULL.
      if (table === "calendar_rewards") {
        const r: Record<string, unknown> = {
          select: () => r,
          eq: (col: string, val: unknown) => {
            state.filtresAssiduite.push([col, val]);
            return r;
          },
          not: (col: string, _op: string, val: unknown) => {
            state.filtresAssiduite.push([col, val]);
            return r;
          },
          is: (col: string, val: unknown) => {
            state.filtresAssiduite.push([col, val]);
            return Promise.resolve({
              count: state.assiduiteEnAttente,
              error: null,
            });
          },
        };
        return r;
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
const { COMPTAGE_INDISPONIBLE } = await import("@/lib/codes-en-attente");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", CALENDAR_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteCalendar — les codes CADEAU- non retirés", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.assiduiteEnAttente = 0;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.deletes = [];
    state.filtresComptage = [];
    state.filtresAssiduite = [];
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

describe("deleteCalendar — la récompense d'ASSIDUITÉ compte aussi", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.assiduiteEnAttente = 0;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.deletes = [];
    state.filtresComptage = [];
    state.filtresAssiduite = [];
    state.role = "owner";
  });

  it("refuse pour un cadeau FINAL seul, alors qu'aucune case n'attend", async () => {
    // LE TEST QUI MANQUAIT, et le scénario exact laissé ouvert : les cases sont
    // toutes soldées (`calendar_openings` rend 0), trois clients n'ont pas
    // encore présenté leur cadeau d'assiduité. L'ancienne garde laissait
    // passer sans un mot.
    state.assiduiteEnAttente = 3;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("3");
    expect(res.ok === false && res.error).toContain(CALENDAR_DELETE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("ADDITIONNE les deux tables : le chiffre annoncé est le coût RÉEL", async () => {
    // Annoncer 5 quand 8 codes vont disparaître serait pire qu'un chiffre
    // absent : le commerçant arbitrerait sur un coût sous-évalué.
    state.enAttente = 5;
    state.assiduiteEnAttente = 3;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("8");
  });

  it("compte l'assiduité de SON calendrier et de SON organisation, non remise", async () => {
    // `calendar_rewards.code` est NOT NULL : aucun prédicat `code is not null`
    // ne doit apparaître ici, contrairement à `calendar_openings` où une case
    // en tour offert porte un `grant_token` et aucun code.
    state.assiduiteEnAttente = 1;
    await deleteCalendar(null, form(false));

    expect(state.filtresAssiduite).toEqual([
      ["calendar_id", CALENDAR_ID],
      ["organization_id", "org-1"],
      ["redeemed_at", null],
    ]);
  });

  it("les deux tables vides laissent passer", async () => {
    // CONTRÔLE NÉGATIF DE L'AJOUT : la seconde table ne doit pas transformer
    // un ménage banal en obstacle.
    await expect(deleteCalendar(null, form(false))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(state.deletes).toEqual([CALENDAR_ID]);
  });
});

describe("deleteCalendar — le comptage qui échoue ne vaut PAS « zéro »", () => {
  beforeEach(() => {
    state.enAttente = 9;
    state.assiduiteEnAttente = 0;
    state.comptageEnPanne = false;
    state.comptageMuet = false;
    state.deletes = [];
    state.filtresComptage = [];
    state.filtresAssiduite = [];
    state.role = "owner";
  });

  it("une erreur de comptage refuse, sans case à cocher et sans rien détruire", async () => {
    state.comptageEnPanne = true;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(COMPTAGE_INDISPONIBLE);
    expect(res.ok === false && res.error).not.toContain(
      CALENDAR_DELETE_LOSS_HINT,
    );
    expect(state.deletes).toEqual([]);
  });

  it("une case DÉJÀ cochée ne force pas une suppression non vérifiée", async () => {
    state.comptageEnPanne = true;
    const res = await deleteCalendar(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.deletes).toEqual([]);
  });

  it("un `count: null` MUET refuse aussi", async () => {
    state.comptageMuet = true;
    const res = await deleteCalendar(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe(COMPTAGE_INDISPONIBLE);
    expect(state.deletes).toEqual([]);
  });
});
