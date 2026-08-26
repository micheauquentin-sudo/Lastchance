import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// startEventSession — UN JEU EN BROUILLON OUVRAIT SON LOBBY AU PUBLIC
//
// `start_event_session` ne joignait JAMAIS `event_games` : elle vérifiait le
// rôle, le statut de la SESSION et le droit du module, puis ouvrait. Une
// session d'un jeu encore en brouillon — donc éventuellement sans une seule
// question — passait en `lobby`, l'écran de salle affichait un code d'accès, et
// les joueurs connectés attendaient une manche qui ne viendrait jamais.
//
// Le lien « 🎛️ Piloter » est rendu inconditionnellement sur la page de suivi, et
// le bandeau ambre de l'éditeur n'a jamais suffi : ce n'est pas un avertissement
// qui manquait, c'est un refus.
//
// ── CE QUE CE FICHIER MESURE, ET LUI SEUL ──
//
// Que la garde APPLICATIVE existe, qu'elle NOMME le geste correct, et surtout
// qu'elle tombe AVANT la RPC. La RPC porte le même refus depuis le même wagon
// (filet du POST direct), mais sa phrase — « Transition impossible dans l'état
// actuel. » — ne dit à personne quoi faire. C'est en pgTAP qu'elle se prouve.
// ────────────────────────────────────────────────────────────

const SESSION_ID = "00000000-0000-4000-8000-0000000000f1";

const { state } = vi.hoisted(() => ({
  state: {
    /** Statut du jeu AU-DESSUS de la session. */
    statutJeu: "active" as string,
    /** La lecture du jeu échoue-t-elle ? (fail-closed attendu) */
    lectureCassee: false,
    /** Appels RPC observés, dans l'ordre. */
    rpc: [] as string[],
    /** La lecture du statut du jeu a-t-elle été tentée ? */
    lecturesJeu: 0,
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
    organization: { id: "org-1", addon_events: true },
    role: state.role,
  })),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: vi.fn(() => Promise.resolve(true)),
  observeSharedKey: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/event-realtime", () => ({
  broadcastEventRefresh: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/monitoring", () => ({
  reportError: vi.fn(),
  monitored: (_n: string, f: unknown) => f,
}));

/** Client RLS : la seule lecture qu'il sert est celle d'`authorizeRemote`. */
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      for (const m of ["select", "eq"]) c[m] = self;
      c.maybeSingle = () =>
        Promise.resolve({ data: { id: SESSION_ID }, error: null });
      return c;
    },
  })),
}));

/**
 * Client `service_role` : il sert DEUX lectures de `event_sessions` — le statut
 * du jeu avant la transition, et la révision d'état après. Une seule ligne les
 * satisfait toutes deux, ce qui reflète la réalité : c'est la même table.
 */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: (nom: string) => {
      state.rpc.push(nom);
      return Promise.resolve({ data: { state: "ok" }, error: null });
    },
    from: () => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      for (const m of ["select", "eq"]) c[m] = self;
      c.maybeSingle = () => {
        state.lecturesJeu += 1;
        if (state.lectureCassee) {
          return Promise.resolve({
            data: null,
            error: { message: "could not serialize access" },
          });
        }
        return Promise.resolve({
          data: {
            state_revision: 1,
            event_games: { status: state.statutJeu },
          },
          error: null,
        });
      };
      return c;
    },
  })),
}));

const { startEventSession } = await import("./events");

beforeEach(() => {
  state.statutJeu = "active";
  state.lectureCassee = false;
  state.rpc = [];
  state.lecturesJeu = 0;
  state.role = "owner";
});

describe("startEventSession — le jeu doit être ouvert avant la soirée", () => {
  it("jeu en BROUILLON : refus qui nomme le geste, et la RPC n'est pas appelée", async () => {
    state.statutJeu = "draft";

    const res = await startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    // Le refus doit dire QUOI FAIRE. « Transition impossible dans l'état
    // actuel. » — ce que rendrait la RPC seule — ne nomme aucun geste, et
    // l'organisateur le lit debout devant sa salle.
    expect(res.ok === false && res.error).toBe(
      "Ouvrez le jeu aux joueurs avant de lancer une session en direct.",
    );
    // L'ASSERTION QUI PORTE TOUT LE CORRECTIF : la garde est AVANT la RPC.
    expect(state.rpc).not.toContain("start_event_session");
  });

  it("jeu ARCHIVÉ : même refus — seul `active` ouvre", async () => {
    state.statutJeu = "archived";

    const res = await startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(state.rpc).not.toContain("start_event_session");
  });

  it("jeu OUVERT : la session démarre, rien n'a changé pour le cas nominal", async () => {
    // CONTRÔLE DE NON-VACUITÉ. Sans lui, une garde qui refuserait tout
    // laisserait les deux tests ci-dessus verts et fermerait le module un soir
    // d'événement — le pire moment pour découvrir une régression.
    const res = await startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(true);
    expect(state.rpc).toContain("start_event_session");
  });

  it("lecture du jeu EN PANNE : refus, pas d'ouverture à l'aveugle", async () => {
    // Fail-closed. « Je n'ai pas pu lire le statut du jeu » ne vaut pas « le
    // jeu est ouvert » : une garde qui échoue ouvert protège exactement les
    // jours où quelque chose ne va pas.
    state.lectureCassee = true;

    const res = await startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(state.rpc).not.toContain("start_event_session");
  });

  it("un caissier est refusé AVANT toute lecture du jeu", async () => {
    // L'ordre compte : la garde de rôle d'`authorizeRemote` reste la première,
    // et la précondition métier ne doit pas faire lire une table à quelqu'un
    // qui n'a rien à faire là.
    state.role = "cashier";

    const res = await startEventSession({ sessionId: SESSION_ID });

    expect(res.ok).toBe(false);
    expect(state.lecturesJeu).toBe(0);
    expect(state.rpc).toEqual([]);
  });

  it("un identifiant de session invalide n'atteint ni la garde ni la RPC", async () => {
    const res = await startEventSession({ sessionId: "pas-un-uuid" });

    expect(res.ok).toBe(false);
    expect(state.lecturesJeu).toBe(0);
    expect(state.rpc).toEqual([]);
  });
});
