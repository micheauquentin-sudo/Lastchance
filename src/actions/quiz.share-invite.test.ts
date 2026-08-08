import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updateQuizShareInvite — LE PARTAGE DE FIN DE PARTIE DEVIENT UN RÉGLAGE
//
// Les boutons « Défier un ami » / « Partager mon score » étaient rendus sans
// qu'aucun réglage ne puisse les éteindre. `quizzes.share_enabled` (NOT NULL
// DEFAULT true) donne l'interrupteur au commerçant sans rien changer pour ceux
// qui n'y toucheront jamais.
//
// Jumeau d'`updateCampaignShareInvite` (src/actions/campaigns.test.ts) — mêmes
// invariants, à ceci près que le module quiz exige explicitement le rôle :
//   · le tenant est dans le FILTRE et vient de la SESSION, jamais du formulaire ;
//   · l'écriture ne touche QUE sa colonne (+ `updated_at`, convention du
//     module) : une action « booléen sec » qui emporterait le nom, le thème ou
//     le slug public réécrirait des réglages que personne n'a ouverts ;
//   · un caissier n'écrit rien, un identifiant invalide non plus.
// ────────────────────────────────────────────────────────────

const QUIZ_ID = "77777777-7777-4777-8777-777777777777";
const ORG_ID = "org-1";

interface Update {
  table: string;
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
}

const { state } = vi.hoisted(() => ({
  state: {
    updates: [] as Array<{
      table: string;
      payload: Record<string, unknown>;
      filters: Record<string, unknown>;
    }>,
    role: "owner" as string,
    /** Erreur simulée de l'UPDATE (null = écriture acceptée). */
    error: null as { message: string } | null,
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
    organization: { id: ORG_ID },
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
      const call = {
        table,
        payload: {} as Record<string, unknown>,
        filters: {} as Record<string, unknown>,
      };
      const builder: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          call.payload = payload;
          state.updates.push(call);
          return builder;
        },
        // `filters` est enregistré par RÉFÉRENCE : complet aux assertions.
        eq: (col: string, val: unknown) => {
          call.filters[col] = val;
          // Le second `eq` (organization_id) clôt la chaîne, comme PostgREST.
          return col === "organization_id"
            ? Promise.resolve({ error: state.error })
            : builder;
        },
      };
      return builder;
    },
  })),
}));

const { updateQuizShareInvite } = await import("./quiz");

function form(valeur?: string): FormData {
  const fd = new FormData();
  fd.set("id", QUIZ_ID);
  if (valeur !== undefined) fd.set("share_enabled", valeur);
  return fd;
}

function updates(): Update[] {
  return state.updates.filter((u) => u.table === "quizzes");
}

describe("updateQuizShareInvite — le booléen et rien d'autre", () => {
  beforeEach(() => {
    state.updates = [];
    state.role = "owner";
    state.error = null;
    vi.clearAllMocks();
  });

  it("case cochée : laisse le partage proposé, scopé à l'organisation active", async () => {
    const res = await updateQuizShareInvite(null, form("on"));

    expect(res.ok).toBe(true);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].payload.share_enabled).toBe(true);
    expect(updates()[0].filters).toEqual({
      id: QUIZ_ID,
      organization_id: ORG_ID,
    });
  });

  it("sentinelle explicite « true » : même effet qu'une case cochée", async () => {
    // La carte POSTE son état voulu par un champ caché plutôt que de le laisser
    // déduire d'une présence : sans cette lecture, l'autosave enregistrerait
    // « partage coupé » sans que personne ne l'ait demandé.
    const res = await updateQuizShareInvite(null, form("true"));

    expect(res.ok).toBe(true);
    expect(updates()[0].payload.share_enabled).toBe(true);
  });

  it("case décochée (champ absent) : coupe le partage", async () => {
    const res = await updateQuizShareInvite(null, form());

    expect(res.ok).toBe(true);
    expect(updates()[0].payload.share_enabled).toBe(false);
  });

  it("une valeur inattendue vaut FAUX, jamais une erreur SQL", async () => {
    await updateQuizShareInvite(null, form("off"));

    expect(updates()[0].payload.share_enabled).toBe(false);
  });

  it("n'écrit QUE son drapeau et l'horodatage du module", async () => {
    // Rouge si l'action réutilisait `updateQuizSchema` : le slug public serait
    // réécrit à chaque bascule d'un interrupteur — donc un aller-retour vers la
    // contrainte d'unicité que personne n'a demandé — et le nom, le thème et la
    // consigne repartiraient depuis un formulaire qui ne les porte pas.
    await updateQuizShareInvite(null, form("on"));

    expect(Object.keys(updates()[0].payload).sort()).toEqual([
      "share_enabled",
      "updated_at",
    ]);
  });

  it("un caissier n'écrit rien", async () => {
    state.role = "cashier";

    const res = await updateQuizShareInvite(null, form("on"));

    expect(res.ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  it("un identifiant qui n'est pas un UUID n'écrit rien", async () => {
    const fd = new FormData();
    fd.set("id", "../autre-quiz");
    fd.set("share_enabled", "on");

    const res = await updateQuizShareInvite(null, fd);

    expect(res.ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  it("l'organisation vient de la SESSION, jamais du formulaire", async () => {
    // Le refus « non-membre » se joue ici : un quiz d'un autre commerce posté
    // avec son `organization_id` ne doit pas être atteint. Le filtre porte
    // l'organisation active, la RLS finit le travail.
    const fd = form("on");
    fd.set("organization_id", "org-du-voisin");

    await updateQuizShareInvite(null, fd);

    expect(updates()[0].filters.organization_id).toBe(ORG_ID);
  });

  it("une écriture refusée par la base rend un échec, pas un faux succès", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.error = { message: "permission denied for table quizzes" };

    const res = await updateQuizShareInvite(null, form("on"));

    expect(res.ok).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
