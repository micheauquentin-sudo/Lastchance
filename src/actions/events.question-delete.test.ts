import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// deleteEventQuestion — LA MANCHE SUPPRIMÉE EMPORTAIT LES RÉPONSES
//
// `event_answers` cascade depuis `event_questions` (20260727120000:259-260) et
// `event_sessions.current_question_id` est en `on delete set null` (:177). Le
// bouton « Supprimer » partait au PREMIER CLIC : les réponses déjà données
// disparaissaient, le classement se refaisait sans elles, et si la manche était
// projetée en salle elle s'effaçait de l'écran, en direct.
//
// DEUX REFUS, ET UN SEUL SE COCHE :
//
//  (a) une soirée de ce jeu est en cours (`live`) → refus SEC, sans marqueur.
//      Aucune confirmation ne rachète une question annulée devant la salle.
//  (b) des réponses existent → refus CONFIRMABLE, qui NOMME leur nombre. La
//      case n'apparaît qu'une fois le coût connu.
//
// `lobby` et `ended` ne sont PAS dans la garde absolue : joueurs connectés mais
// rien de lancé pour l'un, classement figé pour l'autre — ils passent par (b),
// qui compte ce qui serait réellement perdu.
// ────────────────────────────────────────────────────────────

const QUESTION_ID = "00000000-0000-4000-8000-0000000000d1";
const GAME_ID = "00000000-0000-4000-8000-0000000000d9";

const { state } = vi.hoisted(() => ({
  state: {
    /** Sessions du jeu en `status = 'live'`. */
    enDirect: 0 as number | null,
    /** Réponses déjà données à cette manche. */
    reponses: 0 as number | null,
    /** Les suppressions réellement parties en base. */
    deletes: [] as string[],
    /** Filtres du comptage des réponses — c'est là que se joue le tenant. */
    filtresReponses: [] as Array<[string, unknown]>,
    /** Les comptages ont-ils été lancés ? (ordre des gardes) */
    comptages: [] as string[],
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
vi.mock("@/lib/monitoring", () => ({
  reportError: vi.fn(),
  monitored: (_n: string, f: unknown) => f,
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
      if (table === "event_questions") {
        // Deux usages : la relecture du `game_id`, puis la suppression.
        let suppression = false;
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.delete = () => {
          suppression = true;
          return c;
        };
        c.eq = (col: string, val: unknown) => {
          if (suppression && col === "id") state.deletes.push(String(val));
          if (suppression && col === "organization_id") {
            return Promise.resolve({ error: null });
          }
          return c;
        };
        c.maybeSingle = () =>
          Promise.resolve({ data: { game_id: GAME_ID }, error: null });
        return c;
      }
      if (table === "event_sessions") {
        const c: Record<string, unknown> = {};
        c.select = () => {
          state.comptages.push("sessions");
          return c;
        };
        let poses = 0;
        c.eq = () => {
          poses += 1;
          // `.eq(game_id).eq(organization_id).eq(status)` : le résultat est
          // attendu sur le troisième, la chaîne est alors thenable.
          return poses === 3
            ? Promise.resolve({ count: state.enDirect, error: null })
            : c;
        };
        return c;
      }
      const c: Record<string, unknown> = {};
      c.select = () => {
        state.comptages.push("reponses");
        return c;
      };
      c.eq = (col: string, val: unknown) => {
        state.filtresReponses.push([col, val]);
        return col === "organization_id"
          ? Promise.resolve({ count: state.reponses, error: null })
          : c;
      };
      return c;
    },
  })),
}));

const { deleteEventQuestion } = await import("./events");
const { EVENT_QUESTION_LOSS_HINT } = await import("@/lib/validations/events");

function form(confirme: boolean) {
  const fd = new FormData();
  fd.set("id", QUESTION_ID);
  if (confirme) fd.set("confirm_answers_loss", "1");
  return fd;
}

beforeEach(() => {
  state.enDirect = 0;
  state.reponses = 0;
  state.deletes = [];
  state.filtresReponses = [];
  state.comptages = [];
  state.role = "owner";
});

describe("deleteEventQuestion — les réponses déjà données", () => {
  it("refuse en NOMMANT le nombre de réponses, et porte le marqueur", async () => {
    state.reponses = 12;

    const res = await deleteEventQuestion(null, form(false));

    expect(res.ok).toBe(false);
    // « des réponses » ne permet pas d'arbitrer ; 12, si.
    expect(res.ok === false && res.error).toContain("12");
    // Le MARQUEUR partagé : c'est lui, et non `!ok`, qui décide de montrer la
    // case. Sans lui, l'écran ne la proposerait jamais et la suppression
    // deviendrait impossible.
    expect(res.ok === false && res.error).toContain(EVENT_QUESTION_LOSS_HINT);
    expect(state.deletes).toEqual([]);
  });

  it("supprime quand le commerçant confirme en connaissance de cause", async () => {
    state.reponses = 12;

    const res = await deleteEventQuestion(null, form(true));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([QUESTION_ID]);
  });

  it("ne demande rien quand la manche n'a reçu aucune réponse", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE. Si elle se déclenchait sur le cas nominal,
    // elle transformerait la correction d'une manche en obstacle, et le
    // commerçant apprendrait à cocher sans lire — ce qui la rendrait inutile
    // le jour où elle compte.
    const res = await deleteEventQuestion(null, form(false));

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([QUESTION_ID]);
  });

  it("compte les réponses de SA manche et de SON organisation", async () => {
    // Un comptage non scopé refuserait à cause des réponses d'un AUTRE
    // commerçant — et divulguerait son activité par le nombre affiché.
    state.reponses = 1;
    await deleteEventQuestion(null, form(false));

    expect(state.filtresReponses).toEqual([
      ["question_id", QUESTION_ID],
      ["organization_id", "org-1"],
    ]);
  });

  it("comptage INDISPONIBLE : refuse, et SANS marqueur", async () => {
    // `?? 0` transformerait « je n'ai pas pu savoir » en « il n'y a rien à
    // perdre » : c'est exactement le fail-open d'`updateEventQuestion`, qu'on
    // ne recopie pas. Et pas de case : cocher une confirmation qu'aucun
    // chiffre n'accompagne n'apprend qu'à cocher sans lire.
    state.reponses = null;

    const res = await deleteEventQuestion(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).not.toContain(
      EVENT_QUESTION_LOSS_HINT,
    );
    expect(state.deletes).toEqual([]);
  });
});

describe("deleteEventQuestion — pendant une soirée en direct", () => {
  it("refuse SANS marqueur, même la case cochée", async () => {
    // LA GARDE ABSOLUE. `current_question_id` serait annulée en direct :
    // aucune confirmation ne rachète une manche effacée de l'écran de salle.
    state.enDirect = 1;
    state.reponses = 3;

    const res = await deleteEventQuestion(null, form(true));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain("soirée");
    expect(res.ok === false && res.error).not.toContain(
      EVENT_QUESTION_LOSS_HINT,
    );
    expect(state.deletes).toEqual([]);
  });

  it("passe AVANT le comptage des réponses : l'ordre des deux gardes est tenu", async () => {
    // Si les réponses étaient comptées d'abord, le commerçant lirait « cochez
    // la case » sur un geste que rien ne pourra autoriser tant que la soirée
    // tourne — la pire des deux phrases, et une case pour rien.
    state.enDirect = 1;
    state.reponses = 3;

    await deleteEventQuestion(null, form(false));

    expect(state.comptages).toEqual(["sessions"]);
  });

  it("comptage des sessions INDISPONIBLE : refuse plutôt que de couper à l'aveugle", async () => {
    state.enDirect = null;

    const res = await deleteEventQuestion(null, form(true));

    expect(res.ok).toBe(false);
    expect(state.deletes).toEqual([]);
  });
});

describe("deleteEventQuestion — l'ordre des gardes", () => {
  it("un caissier est refusé avant tout comptage, et sans marqueur", async () => {
    state.role = "cashier";
    state.reponses = 12;

    const res = await deleteEventQuestion(null, form(false));

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).not.toContain(
      EVENT_QUESTION_LOSS_HINT,
    );
    expect(state.comptages).toEqual([]);
    expect(state.deletes).toEqual([]);
  });
});
