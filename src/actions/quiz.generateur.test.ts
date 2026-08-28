import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// genererQuestionsQuiz — LE GÉNÉRATEUR ÉCRIT CE QU'IL A MONTRÉ
//
// Ce que cette suite garde, et qui ne se voit pas dans le typage :
//   · le client n'envoie AUCUNE question — seulement des critères et une
//     graine. Le tirage est rejoué serveur : rien d'arbitraire ne peut être
//     inséré par un appel direct à l'action ;
//   · la même graine rend la même liste, dans le même ordre — c'est ce qui rend
//     l'aperçu de l'éditeur honnête ;
//   · l'organisation vient de la SESSION et se retrouve dans le filtre de
//     lecture ET dans chaque ligne écrite (isolation multi-tenant) ;
//   · les positions repartent APRÈS les questions existantes, sans trou ni
//     collision avec l'unicité (quiz_id, position) ;
//   · un caissier n'écrit rien, un quiz d'une autre organisation non plus ;
//   · une seule requête d'insertion pour N questions : cent allers-retours
//     laisseraient un quiz à moitié rempli au premier réseau qui hoquette.
// ────────────────────────────────────────────────────────────

const QUIZ_ID = "77777777-7777-4777-8777-777777777777";
const ORG_ID = "org-1";

interface Insertion {
  table: string;
  rows: Array<Record<string, unknown>>;
}

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    /** Le quiz existe-t-il DANS l'organisation de la session ? */
    quizVisible: true,
    /** Questions déjà posées (position + intitulé). */
    existantes: [] as Array<{ position: number; prompt: string }>,
    insertions: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
    filtresLecture: [] as Array<Record<string, unknown>>,
    erreurInsertion: null as { message: string } | null,
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
      const filtres: Record<string, unknown> = {};
      let colonnes = "";
      const builder: Record<string, unknown> = {
        select: (cols: string) => {
          colonnes = cols;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filtres[col] = val;
          return builder;
        },
        maybeSingle: async () => ({
          data: state.quizVisible ? { id: QUIZ_ID } : null,
          error: null,
        }),
        insert: async (rows: Array<Record<string, unknown>>) => {
          state.insertions.push({ table, rows });
          return { error: state.erreurInsertion };
        },
        // La lecture des questions existantes s'attend DIRECTEMENT après ses
        // deux `eq` : le builder est donc lui-même une promesse.
        then: (
          resolve: (v: { data: unknown; error: null }) => unknown,
        ) => {
          if (table === "quiz_questions" && colonnes.includes("position")) {
            state.filtresLecture.push({ ...filtres });
            return Promise.resolve({ data: state.existantes, error: null }).then(
              resolve,
            );
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return builder;
    },
  })),
}));

const { genererQuestionsQuiz } = await import("./quiz");
const { genererQuestions } = await import("@/lib/quiz-banque");

function insertions(): Insertion[] {
  return state.insertions.filter((i) => i.table === "quiz_questions");
}

describe("genererQuestionsQuiz", () => {
  beforeEach(() => {
    state.role = "owner";
    state.quizVisible = true;
    state.existantes = [];
    state.insertions = [];
    state.filtresLecture = [];
    state.erreurInsertion = null;
    vi.clearAllMocks();
  });

  it("écrit exactement le tirage que la graine a produit, dans l'ordre", async () => {
    const attendu = genererQuestions({
      themes: ["cinema"],
      genres: ["question"],
      mode: { type: "nombre", nombre: 6 },
      graine: 99,
      difficulteMax: 3,
      exclure: [],
    });

    const res = await genererQuestionsQuiz({
      quizId: QUIZ_ID,
      themes: ["cinema"],
      genres: ["question"],
      mode: "nombre",
      nombre: 6,
      graine: 99,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.ajoutees).toBe(attendu.questions.length);
    expect(insertions()).toHaveLength(1);
    expect(insertions()[0].rows.map((r) => r.prompt)).toEqual(
      attendu.questions.map((q) => q.prompt),
    );
  });

  it("pose l'organisation de la SESSION sur chaque ligne, et dans le filtre de lecture", async () => {
    await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 4, graine: 1 });

    expect(state.filtresLecture[0]).toEqual({
      quiz_id: QUIZ_ID,
      organization_id: ORG_ID,
    });
    for (const row of insertions()[0].rows) {
      expect(row.organization_id).toBe(ORG_ID);
      expect(row.quiz_id).toBe(QUIZ_ID);
    }
  });

  it("numérote les positions à la suite des questions existantes", async () => {
    state.existantes = [
      { position: 0, prompt: "Déjà là" },
      { position: 3, prompt: "Et celle-ci" },
    ];

    await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 3, graine: 2 });

    expect(insertions()[0].rows.map((r) => r.position)).toEqual([4, 5, 6]);
  });

  it("ne repropose pas un intitulé déjà posé dans le quiz", async () => {
    const premier = genererQuestions({
      genres: ["question"],
      mode: { type: "nombre", nombre: 5 },
      graine: 31,
      difficulteMax: 3,
      exclure: [],
    });
    state.existantes = premier.questions.map((q, i) => ({
      position: i,
      prompt: q.prompt,
    }));

    await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 5, graine: 31 });

    const ecrits = insertions()[0].rows.map((r) => r.prompt);
    for (const dejaPose of premier.questions) {
      expect(ecrits).not.toContain(dejaPose.prompt);
    }
  });

  it("écrit un sondage à 0 point, avec son modèle et sa vérité de forme", async () => {
    const res = await genererQuestionsQuiz({
      quizId: QUIZ_ID,
      genres: ["sondage"],
      nombre: 3,
      graine: 5,
    });

    expect(res.ok).toBe(true);
    const rows = insertions()[0].rows;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.preset).toBe("sondage");
      expect(row.points).toBe(0);
      expect(row.question_type).toBe("choice");
      // `correct_answer` est `not null` : la première proposition la remplit,
      // et n'est jamais rendue au joueur (quizPresetSansVerite).
      expect(row.correct_answer).toBe("opt_1");
    }
  });

  it("convertit une durée en nombre de questions", async () => {
    const res = await genererQuestionsQuiz({
      quizId: QUIZ_ID,
      mode: "duree",
      minutes: 15,
      graine: 12,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Un quart d'heure ne tient ni en trois questions ni en trois cents.
    expect(res.data.ajoutees).toBeGreaterThanOrEqual(15);
    expect(res.data.ajoutees).toBeLessThanOrEqual(50);
    expect(insertions()[0].rows).toHaveLength(res.data.ajoutees);
  });

  it("n'écrit qu'UNE fois, même pour cinquante questions", async () => {
    await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 50, graine: 4 });

    expect(insertions()).toHaveLength(1);
    expect(insertions()[0].rows).toHaveLength(50);
  });

  it("signale le manque au lieu de le taire", async () => {
    const res = await genererQuestionsQuiz({
      quizId: QUIZ_ID,
      themes: ["animaux"],
      nombre: 100,
      graine: 3,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.manquantes).toBe(100 - res.data.ajoutees);
    expect(res.data.ajoutees).toBeLessThan(100);
  });

  it("refuse un caissier, sans rien écrire", async () => {
    state.role = "viewer";

    const res = await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 5 });

    expect(res.ok).toBe(false);
    expect(insertions()).toHaveLength(0);
  });

  it("refuse un quiz qui n'est pas dans l'organisation de la session", async () => {
    state.quizVisible = false;

    const res = await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 5 });

    expect(res).toEqual({ ok: false, error: "Quiz introuvable" });
    expect(insertions()).toHaveLength(0);
  });

  it("refuse un identifiant de quiz invalide avant toute lecture", async () => {
    const res = await genererQuestionsQuiz({ quizId: "pas-un-uuid", nombre: 5 });

    expect(res.ok).toBe(false);
    expect(state.filtresLecture).toHaveLength(0);
    expect(insertions()).toHaveLength(0);
  });

  it("refuse un thème de forme invalide (rien n'est deviné)", async () => {
    const res = await genererQuestionsQuiz({
      quizId: QUIZ_ID,
      themes: ["Cinéma; drop table"],
      nombre: 5,
    });

    expect(res.ok).toBe(false);
    expect(insertions()).toHaveLength(0);
  });

  it("refuse d'ajouter à un quiz déjà plein", async () => {
    state.existantes = Array.from({ length: 200 }, (_, i) => ({
      position: i,
      prompt: `Question ${i}`,
    }));

    const res = await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 5 });

    expect(res.ok).toBe(false);
    expect(insertions()).toHaveLength(0);
  });

  it("remonte l'échec d'écriture sans prétendre avoir ajouté", async () => {
    state.erreurInsertion = { message: "boom" };

    const res = await genererQuestionsQuiz({ quizId: QUIZ_ID, nombre: 5 });

    expect(res.ok).toBe(false);
  });
});
