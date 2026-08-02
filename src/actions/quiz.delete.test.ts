import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteQuiz — LE QUIZ SUPPRIMÉ EMPORTAIT LES CODES QUIZ- NON RETIRÉS
//
// `quiz_rewards` cascade depuis `quizzes` (20260803120000:789-790). Le texte
// de confirmation annonçait « ce quiz, ses questions et les participations » —
// le joueur, lui, tient un code que la caisse ne retrouvera plus.
//
// Le comptage porte sur `code`, pas sur le nombre de lignes : une récompense
// en TOUR OFFERT porte un `spin_grant_token` et aucun code, une émission en
// rupture de stock n'a ni l'un ni l'autre. Compter les lignes gonflerait le
// chiffre avec des lots qui n'existent pas — et un chiffre faux ne permet plus
// d'arbitrer, ce qui est exactement le défaut qu'on ferme.
// ────────────────────────────────────────────────────────────

const QUIZ_ID = "66666666-6666-4666-8666-666666666666";

const { state } = vi.hoisted(() => ({
  state: {
    /** Codes QUIZ- de ce quiz encore non remis en caisse. */
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
    organization: { id: "org-1" },
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
      if (table === "quiz_rewards") {
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

const { deleteQuiz } = await import("./quiz");
const { QUIZ_DELETE_LOSS_HINT } = await import("@/lib/validations/quiz");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", QUIZ_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteQuiz — les codes QUIZ- non retirés", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.deletes = [];
    state.filtresComptage = [];
    state.role = "owner";
  });

  it("refuse tant qu'un code QUIZ- attend en caisse", async () => {
    state.enAttente = 3;
    const res = await deleteQuiz(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("3");
    expect(res.ok === false && res.error).toContain(QUIZ_DELETE_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 3;
    await expect(deleteQuiz(null, form(true))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.deletes).toEqual([QUIZ_ID]);
  });

  it("ne demande rien quand tous les codes ont déjà été retirés", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : invisible sur le cas nominal.
    await expect(deleteQuiz(null, form(false))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.deletes).toEqual([QUIZ_ID]);
  });

  it("le refus de RÔLE ne porte pas le marqueur et ne compte rien", async () => {
    state.role = "cashier";
    state.enAttente = 3;
    const res = await deleteQuiz(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(QUIZ_DELETE_LOSS_HINT);
    expect(state.filtresComptage).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("ne compte que les lignes PORTEUSES D'UN CODE, de son quiz et de son org", async () => {
    state.enAttente = 1;
    await deleteQuiz(null, form(false));

    // `code not null` n'est pas décoratif : sans lui, un tour offert non
    // consommé et une émission en rupture de stock compteraient comme des
    // lots à honorer au comptoir.
    expect(state.filtresComptage).toEqual([
      ["quiz_id", QUIZ_ID],
      ["organization_id", "org-1"],
      ["code", null],
      ["redeemed_at", null],
    ]);
  });
});
