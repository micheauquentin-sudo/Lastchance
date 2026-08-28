import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// genererQuestionsEvenement — LA BANQUE VERSÉE DANS UNE SOIRÉE
//
// Jumeau de `quiz.generateur.test.ts`, avec deux invariants de plus, propres au
// live (les options vivent dans leur PROPRE table) :
//   · les options sont rattachées par POSITION relue en base, jamais par
//     l'ordre supposé du retour de PostgREST — une option collée à la mauvaise
//     question resterait invisible jusqu'à la soirée ;
//   · un échec d'écriture des options défait les questions déjà insérées : une
//     question sans option est injouable et n'aurait rien dit.
//
// Et un filtre : le live ne sait pas recevoir une estimation chiffrée ni une
// réponse libre — on y répond en tapant sur un bouton.
// ────────────────────────────────────────────────────────────

const GAME_ID = "88888888-8888-4888-8888-888888888888";
const ORG_ID = "org-1";

interface Ecriture {
  table: string;
  rows: Array<Record<string, unknown>>;
}

const { state } = vi.hoisted(() => ({
  state: {
    role: "owner" as string,
    jeuVisible: true,
    existantes: [] as Array<{ position: number; prompt: string }>,
    ecritures: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
    suppressions: [] as Array<{ table: string; ids: unknown }>,
    erreurQuestions: null as { message: string } | null,
    erreurOptions: null as { message: string } | null,
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

/** Identifiants stables et LISIBLES : `q-<position>` rend les assertions de
 *  rattachement option → question évidentes à relire. */
function idPour(position: number): string {
  return `q-${position}`;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      const filtres: Record<string, unknown> = {};
      let colonnes = "";
      let inserees: Array<Record<string, unknown>> = [];
      const builder: Record<string, unknown> = {
        select: (cols: string) => {
          colonnes = cols;
          // `.insert(...).select("id, position")` : le retour porte les lignes
          // écrites, dans un ordre que PostgREST ne garantit pas. On le REND
          // volontairement à l'envers pour prouver que l'action ne s'y fie pas.
          if (table === "event_questions" && inserees.length > 0) {
            if (state.erreurQuestions) {
              return Promise.resolve({ data: null, error: state.erreurQuestions });
            }
            return Promise.resolve({
              data: [...inserees]
                .reverse()
                .map((r) => ({ id: idPour(r.position as number), position: r.position })),
              error: null,
            });
          }
          return builder;
        },
        eq: (col: string, val: unknown) => {
          filtres[col] = val;
          return builder;
        },
        in: (col: string, vals: unknown) => {
          state.suppressions.push({ table, ids: vals });
          return builder;
        },
        delete: () => builder,
        maybeSingle: async () => ({
          data: state.jeuVisible ? { id: GAME_ID } : null,
          error: null,
        }),
        insert: (rows: Array<Record<string, unknown>>) => {
          state.ecritures.push({ table, rows });
          if (table === "event_questions") {
            // Le retour se joue dans `.select(...)` : l'échec doit rester
            // CHAÎNABLE, comme chez PostgREST.
            inserees = rows;
            return builder;
          }
          return Promise.resolve({ error: state.erreurOptions });
        },
        then: (resolve: (v: { data: unknown; error: null }) => unknown) => {
          if (table === "event_questions" && colonnes.includes("position")) {
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

const { genererQuestionsEvenement } = await import("./events");
const { compatibleEvenement, genererQuestions, questionEvenementAEcrire } =
  await import("@/lib/quiz-banque");

function ecrites(table: string): Ecriture[] {
  return state.ecritures.filter((e) => e.table === table);
}

describe("genererQuestionsEvenement", () => {
  beforeEach(() => {
    state.role = "owner";
    state.jeuVisible = true;
    state.existantes = [];
    state.ecritures = [];
    state.suppressions = [];
    state.erreurQuestions = null;
    state.erreurOptions = null;
    vi.clearAllMocks();
  });

  it("écrit le tirage de la graine, en deux requêtes et pas 2N", async () => {
    const attendu = genererQuestions({
      genres: ["question"],
      mode: { type: "nombre", nombre: 8 },
      graine: 77,
      difficulteMax: 3,
      exclure: [],
      pourEvenement: true,
      plafond: 60,
    });

    const res = await genererQuestionsEvenement({
      gameId: GAME_ID,
      nombre: 8,
      graine: 77,
    });

    expect(res.ok).toBe(true);
    expect(ecrites("event_questions")).toHaveLength(1);
    expect(ecrites("event_question_options")).toHaveLength(1);
    expect(ecrites("event_questions")[0].rows.map((r) => r.prompt)).toEqual(
      attendu.questions.map((q) => q.prompt),
    );
  });

  it("ne tire que des questions jouables en direct", async () => {
    await genererQuestionsEvenement({
      gameId: GAME_ID,
      genres: ["question", "sondage", "pronostic"],
      nombre: 30,
      graine: 4,
    });

    const types = ecrites("event_questions")[0].rows.map((r) => r.question_type);
    for (const type of types) expect(["quiz", "poll", "prono"]).toContain(type);
    // Aucune estimation chiffrée ni réponse libre n'a pu passer : elles n'ont
    // pas de traduction live, et le vivier les écarte en amont.
    expect(types).toHaveLength(30);
  });

  it("rattache chaque option à SA question, malgré un retour désordonné", async () => {
    await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 5, graine: 2 });

    const questions = ecrites("event_questions")[0].rows;
    const options = ecrites("event_question_options")[0].rows;

    for (const question of questions) {
      const attendues = options.filter(
        (o) => o.question_id === idPour(question.position as number),
      );
      expect(attendues.length, `question ${question.position}`).toBeGreaterThanOrEqual(2);
      // Les positions d'options repartent de 0 pour chaque question.
      expect(attendues.map((o) => o.position)).toEqual(
        attendues.map((_, i) => i),
      );
    }
    expect(options).toHaveLength(
      questions.reduce(
        (total, q) =>
          total +
          options.filter((o) => o.question_id === idPour(q.position as number)).length,
        0,
      ),
    );
  });

  it("marque une seule bonne réponse par quiz, aucune en sondage", async () => {
    await genererQuestionsEvenement({
      gameId: GAME_ID,
      genres: ["question", "sondage"],
      nombre: 15,
      graine: 6,
    });

    const questions = ecrites("event_questions")[0].rows;
    const options = ecrites("event_question_options")[0].rows;
    for (const question of questions) {
      const justes = options.filter(
        (o) =>
          o.question_id === idPour(question.position as number) && o.is_correct,
      ).length;
      expect(justes, `${question.question_type}`).toBe(
        question.question_type === "quiz" ? 1 : 0,
      );
    }
  });

  it("pose l'organisation de la session sur les questions ET leurs options", async () => {
    await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 4, graine: 1 });

    for (const row of ecrites("event_questions")[0].rows) {
      expect(row.organization_id).toBe(ORG_ID);
      expect(row.game_id).toBe(GAME_ID);
    }
    for (const row of ecrites("event_question_options")[0].rows) {
      expect(row.organization_id).toBe(ORG_ID);
    }
  });

  it("numérote les positions à la suite des questions existantes", async () => {
    state.existantes = [
      { position: 0, prompt: "Manche d'ouverture" },
      { position: 7, prompt: "Manche finale" },
    ];

    await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 3, graine: 2 });

    expect(ecrites("event_questions")[0].rows.map((r) => r.position)).toEqual([
      8, 9, 10,
    ]);
  });

  it("ne repropose pas un intitulé déjà posé", async () => {
    const premier = genererQuestions({
      genres: ["question"],
      mode: { type: "nombre", nombre: 5 },
      graine: 23,
      difficulteMax: 3,
      exclure: [],
      pourEvenement: true,
      plafond: 60,
    });
    state.existantes = premier.questions.map((q, i) => ({
      position: i,
      prompt: q.prompt,
    }));

    await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 5, graine: 23 });

    const ecrits = ecrites("event_questions")[0].rows.map((r) => r.prompt);
    for (const pose of premier.questions) expect(ecrits).not.toContain(pose.prompt);
  });

  it("reprend le barème du live, pronostic compris", async () => {
    const res = await genererQuestionsEvenement({
      gameId: GAME_ID,
      genres: ["pronostic"],
      nombre: 2,
      graine: 3,
    });

    expect(res.ok).toBe(true);
    for (const row of ecrites("event_questions")[0].rows) {
      expect(row.question_type).toBe("prono");
      // L'animateur désignera l'option gagnante au reveal : un pronostic
      // rapporte, contrairement au quiz asynchrone où rien ne peut l'arbitrer.
      expect(row.points_base).toBeGreaterThan(0);
    }
  });

  it("défait les questions insérées si leurs options échouent", async () => {
    state.erreurOptions = { message: "boom" };

    const res = await genererQuestionsEvenement({
      gameId: GAME_ID,
      nombre: 4,
      graine: 8,
    });

    expect(res.ok).toBe(false);
    expect(state.suppressions).toHaveLength(1);
    expect(state.suppressions[0].table).toBe("event_questions");
    // Toutes les questions insérées repartent — l'ordre du `in (…)` n'a aucune
    // portée, seul l'ensemble compte.
    expect(new Set(state.suppressions[0].ids as string[])).toEqual(
      new Set([idPour(0), idPour(1), idPour(2), idPour(3)]),
    );
  });

  it("remonte un échec d'écriture des questions sans toucher aux options", async () => {
    state.erreurQuestions = { message: "boom" };

    const res = await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 4 });

    expect(res.ok).toBe(false);
    expect(ecrites("event_question_options")).toHaveLength(0);
  });

  it("refuse un caissier, sans rien écrire", async () => {
    state.role = "viewer";

    const res = await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 5 });

    expect(res.ok).toBe(false);
    expect(state.ecritures).toHaveLength(0);
  });

  it("refuse un jeu qui n'est pas dans l'organisation de la session", async () => {
    state.jeuVisible = false;

    const res = await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 5 });

    expect(res).toEqual({ ok: false, error: "Jeu introuvable" });
    expect(state.ecritures).toHaveLength(0);
  });

  it("refuse d'ajouter à un jeu déjà plein", async () => {
    state.existantes = Array.from({ length: 80 }, (_, i) => ({
      position: i,
      prompt: `Manche ${i}`,
    }));

    const res = await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 5 });

    expect(res.ok).toBe(false);
    expect(state.ecritures).toHaveLength(0);
  });

  it("produit une charge conforme à ce que le module de banque annonce", async () => {
    const tirage = genererQuestions({
      genres: ["question"],
      mode: { type: "nombre", nombre: 3 },
      graine: 55,
      difficulteMax: 3,
      exclure: [],
      pourEvenement: true,
      plafond: 60,
    });

    await genererQuestionsEvenement({ gameId: GAME_ID, nombre: 3, graine: 55 });

    const rows = ecrites("event_questions")[0].rows;
    tirage.questions.forEach((q, i) => {
      expect(compatibleEvenement(q)).toBe(true);
      const charge = questionEvenementAEcrire(q);
      expect(rows[i].prompt).toBe(charge.prompt);
      expect(rows[i].question_type).toBe(charge.questionType);
      expect(rows[i].time_limit_seconds).toBe(charge.timeLimitSeconds);
      expect(rows[i].points_base).toBe(charge.pointsBase);
    });
  });
});
