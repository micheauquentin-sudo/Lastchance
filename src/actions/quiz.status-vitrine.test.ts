import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// setQuizStatus — LE DRAPEAU QUE LA VITRINE PUBLIE (revue L13, M3)
//
// `vitrine_public_state` bâtit son annuaire de portes à partir de quatre
// drapeaux d'autres modules (20261014120000). Le quatrième est
// `quizzes.status = 'active'` : c'est LUI, et rien d'autre, qui fait qu'un quiz
// apparaît dans le bloc « Jeux et expériences » de `/v/{slug}`.
//
// Cette page est servie en ISR. `setQuizStatus` ne revalidait que
// `/dashboard/quiz*` : un quiz archivé restait donc annoncé une minute sur la
// vitrine — une porte fantôme, cliquable, signée du commerce — et un quiz
// fraîchement publié restait une minute introuvable sur la carte qui aurait dû
// l'annoncer.
//
// Ce fichier ne rejoue PAS la purge elle-même (c'est le contrat de
// `@/lib/revalidate-vitrine`, tenu par les tests de `@/actions/vitrine`). Il
// prouve le CÂBLAGE, dans les deux sens de la transition, et son ABSENCE sur un
// refus — un geste écarté n'a rien changé en base, et ne doit pas payer la
// lecture du slug.
// ────────────────────────────────────────────────────────────

const QUIZ_ID = "66666666-6666-4666-8666-666666666666";
const ORG_ID = "org-1";

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    /** Ce que rend `set_quiz_status` : `true` = transition écrite ou déjà là. */
    rpcData: true as boolean | null,
    /** Le refus levé par la RPC, quand il y en a un. */
    rpcError: null as { message: string } | null,
    /** Le droit `quiz` de l'organisation — exigé pour PUBLIER seulement. */
    moduleQuiz: true,
    /** Nombre de questions : la précondition d'activation. */
    questions: 3,
  },
}));

const purgeVitrine = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/revalidate-vitrine", () => ({
  revaliderVitrinePublique: purgeVitrine,
}));
vi.mock("@/lib/auth", () => ({
  getUserAndOrg: vi.fn(async () => ({
    user: { id: "user-1" },
    // Forme lue par `hasQuizAccess` → `droitEffectifModule` : abonnement vivant
    // plus la colonne d'add-on du module. Recopiée de `reserver.test.ts`.
    organization: {
      id: ORG_ID,
      subscription_status: "active",
      trial_ends_at: "2030-01-01T00:00:00Z",
      past_due_since: null,
      comp_access: false,
      comp_access_until: null,
      addon_quiz: state.moduleQuiz,
      live_module_grants: [],
    },
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
    // `set_quiz_status` est le seul appel RPC de ce chemin : ni le nom ni les
    // arguments ne sont observés ici — c'est le CÂBLAGE de la purge qu'on teste.
    rpc: () => Promise.resolve({ data: state.rpcData, error: state.rpcError }),
    from(table: string) {
      if (table === "quizzes") {
        const c: Record<string, unknown> = {
          select: () => c,
          eq: () => c,
          maybeSingle: () =>
            Promise.resolve({
              data: {
                id: QUIZ_ID,
                reward_mode: "none",
                reward_label: "",
                target_wheel_id: null,
                reward_stock: 0,
              },
              error: null,
            }),
        };
        return c;
      }
      // `quiz_questions` : seul le `count` est lu.
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string) =>
          col === "organization_id"
            ? Promise.resolve({ count: state.questions, error: null })
            : q,
      };
      return q;
    },
  })),
}));

const { setQuizStatus } = await import("./quiz");

function form(status: string) {
  const fd = new FormData();
  fd.set("id", QUIZ_ID);
  fd.set("status", status);
  return fd;
}

describe("setQuizStatus — la vitrine suit le drapeau publié", () => {
  beforeEach(() => {
    state.role = "owner";
    state.rpcData = true;
    state.rpcError = null;
    state.moduleQuiz = true;
    state.questions = 3;
    purgeVitrine.mockClear();
  });

  it("purge la vitrine quand le quiz DEVIENT une porte", async () => {
    const res = await setQuizStatus(null, form("active"));
    expect(res.ok).toBe(true);
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });

  it("purge la vitrine quand le quiz CESSE d'être une porte", async () => {
    // Le sens le plus coûteux des deux : une porte fantôme fait cliquer, une
    // porte manquante fait seulement attendre.
    const res = await setQuizStatus(null, form("archived"));
    expect(res.ok).toBe(true);
    expect(purgeVitrine).toHaveBeenCalledWith(expect.anything(), ORG_ID);
  });

  it("ne purge RIEN quand la transition est REFUSÉE par la base", async () => {
    state.rpcError = { message: "invalid transition" };
    const res = await setQuizStatus(null, form("archived"));
    expect(res.ok).toBe(false);
    expect(purgeVitrine).not.toHaveBeenCalled();
  });

  it("ne purge RIEN quand le RÔLE est refusé, avant tout aller-retour", async () => {
    state.role = "cashier";
    const res = await setQuizStatus(null, form("active"));
    expect(res.ok).toBe(false);
    expect(purgeVitrine).not.toHaveBeenCalled();
  });
});
