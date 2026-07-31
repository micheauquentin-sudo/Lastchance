import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteEventSession — LA SOIRÉE SUPPRIMÉE EMPORTAIT LES LOTS NON RETIRÉS
//
// `event_wins` cascade depuis `event_sessions` (20260727120000:290-291). Le
// bouton « Supprimer la session » partait au PREMIER CLIC, sans confirmation
// — alors que la suppression du JEU, dans le même écran, en demande une
// depuis toujours. Le commerçant faisait le ménage après sa soirée quiz ;
// les codes EVENT- distribués à la clôture disparaissaient avec elle, et
// tout gagnant pas encore passé en caisse se voyait refuser un lot qu'il
// avait réellement obtenu.
//
// PRINCIPE : on ne touche pas à la cascade — la retirer donnerait un 23503
// opaque au commerçant. On refuse tant qu'un lot attend, et le refus NOMME
// le nombre. La case de confirmation n'apparaît donc qu'une fois le coût
// connu.
// ────────────────────────────────────────────────────────────

const SESSION_ID = "00000000-0000-4000-8000-0000000000e1";

const { state } = vi.hoisted(() => ({
  state: {
    /** Lots de la soirée encore non remis en caisse. */
    enAttente: 0,
    /** Les suppressions réellement parties en base. */
    deletes: [] as string[],
    /** Filtres posés sur le comptage — c'est là que se joue le multi-tenant. */
    filtresComptage: [] as Array<[string, unknown]>,
    role: "owner" as string,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}));
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "event_wins") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          eq: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return chaine;
          },
          is: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            // `head: true` : le résultat est attendu ici même, sans `.then`
            // supplémentaire — la chaîne est thenable.
            return Promise.resolve({ count: state.enAttente, error: null });
          },
        };
        return chaine;
      }
      const suppression: Record<string, unknown> = {
        delete: () => suppression,
        eq: (col: string, val: unknown) => {
          if (col === "id") state.deletes.push(String(val));
          return col === "organization_id"
            ? Promise.resolve({ error: null })
            : suppression;
        },
      };
      return suppression;
    },
  })),
}));

const { deleteEventSession } = await import("./events");
const { EVENT_SESSION_LOSS_HINT } = await import("@/lib/validations/events");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", SESSION_ID);
  if (confirme) fd.set("confirm_outstanding", "1");
  return fd;
}

describe("deleteEventSession — les lots non retirés", () => {
  beforeEach(() => {
    state.enAttente = 0;
    state.deletes = [];
    state.filtresComptage = [];
    state.role = "owner";
  });

  it("refuse la suppression tant qu'un lot attend en caisse", async () => {
    state.enAttente = 3;
    const res = await deleteEventSession(null, form(false));

    expect(res.ok).toBe(false);
    // Le refus doit NOMMER le nombre : « des lots » ne permet pas d'arbitrer,
    // 3 si.
    expect(res.ok === false && res.error).toContain("3");
    // Et il doit porter le MARQUEUR partagé : c'est lui, et non `!ok`, qui
    // décide de montrer la case « je comprends que les codes non retirés
    // deviendront introuvables ». Sans lui, l'écran ne la proposerait jamais
    // et la suppression deviendrait impossible.
    expect(res.ok === false && res.error).toContain(EVENT_SESSION_LOSS_HINT);
    // Et surtout : rien n'est parti en base.
    expect(state.deletes).toEqual([]);
  });

  it("les refus qui NE se cochent PAS ne portent pas le marqueur", async () => {
    // CONTRÔLE NÉGATIF DU MARQUEUR : un caissier reçoit un refus de rôle, sur
    // lequel cocher une case ne changerait rien. S'il portait le marqueur,
    // l'écran lui montrerait une confirmation destructive inutile — la
    // pédagogie que tout ce correctif cherche à éviter.
    state.role = "cashier";
    state.enAttente = 3;

    const res = await deleteEventSession(null, form(false));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(EVENT_SESSION_LOSS_HINT);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.enAttente = 3;
    const res = await deleteEventSession(null, form(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([SESSION_ID]);
  });

  it("ne demande rien quand tous les lots ont déjà été retirés", async () => {
    state.enAttente = 0;
    const res = await deleteEventSession(null, form(false));

    // CONTRÔLE NÉGATIF DE LA GARDE elle-même : si elle se déclenchait sur le
    // cas nominal, elle transformerait un ménage banal en obstacle, et le
    // commerçant apprendrait à cocher la case sans la lire — ce qui la
    // rendrait inutile le jour où elle compte.
    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([SESSION_ID]);
  });

  it("compte les lots de SA soirée et de SON organisation, non remis", async () => {
    state.enAttente = 1;
    await deleteEventSession(null, form(false));

    // Un comptage non scopé sur l'organisation ferait refuser la suppression
    // à cause des lots d'un AUTRE commerçant — et divulguerait au passage
    // l'activité de ce dernier par le nombre affiché.
    expect(state.filtresComptage).toEqual([
      ["session_id", SESSION_ID],
      ["organization_id", "org-1"],
      ["redeemed_at", null],
    ]);
  });

  it("laisse la garde de rôle passer avant tout comptage", async () => {
    state.role = "cashier";
    const res = await deleteEventSession(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.filtresComptage).toEqual([]);
    expect(state.deletes).toEqual([]);
  });
});
