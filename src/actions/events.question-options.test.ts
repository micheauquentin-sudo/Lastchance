import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// updateEventQuestion — CORRIGER UNE COQUILLE EFFAÇAIT TOUTE LA SALLE
//
// `event_answers.option_id` cascade depuis `event_question_options`
// (20260727120000:264), et l'action réécrivait TOUTES les options par
// delete+insert à chaque enregistrement. Le commerçant qui corrigeait une
// faute de frappe dans l'intitulé, entre le verrouillage et le dévoilement,
// détruisait en silence toutes les réponses de la question en cours : plus
// personne ne marquait, et les codes EVENT- de fin de soirée partaient sur un
// classement faux.
//
// Rien ne pouvait l'en avertir : `authenticated` n'a même pas le droit de
// supprimer une ligne d'`event_answers` (:386) — c'est la contrainte
// référentielle, qui contourne RLS et les grants, qui les emportait.
//
// PRINCIPE : distinguer l'inoffensif du destructeur. Même nombre d'options →
// mise à jour EN PLACE (les `id` survivent, donc les réponses). Nombre
// différent → réécriture, mais seulement si AUCUNE réponse n'existe ; sinon
// refus, en nommant le nombre de réponses en jeu.
// ────────────────────────────────────────────────────────────

const QUESTION_ID = "00000000-0000-4000-8000-0000000000q1".replace("q", "a");

const { state } = vi.hoisted(() => ({
  state: {
    /** Options déjà en base, dans l'ordre des positions. */
    anciennes: [
      { id: "opt-a", position: 0 },
      { id: "opt-b", position: 1 },
      { id: "opt-c", position: 2 },
    ] as Array<{ id: string; position: number }>,
    /** Réponses déjà données à cette question. */
    reponses: 0,
    /** Les `delete` d'options réellement partis (le geste destructeur). */
    deletes: [] as string[],
    /** Les `insert` d'options réellement partis. */
    inserts: [] as Array<Record<string, unknown>>,
    /** Les `update` d'options, par id ciblé. */
    updates: [] as Array<{ id: string; fields: Record<string, unknown> }>,
    /** Les `update` de la ligne question elle-même. */
    updatesQuestion: [] as Array<Record<string, unknown>>,
    /** Filtres posés sur le comptage des réponses. */
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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from(table: string) {
      if (table === "event_questions") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          update: (fields: Record<string, unknown>) => {
            state.updatesQuestion.push(fields);
            return chaine;
          },
          eq: (col: string) =>
            col === "organization_id" && state.updatesQuestion.length > 0
              ? Promise.resolve({ error: null })
              : chaine,
          maybeSingle: () =>
            Promise.resolve({ data: { game_id: "game-1" }, error: null }),
        };
        return chaine;
      }

      if (table === "event_question_options") {
        // Trois chaînes distinctes partagent ce builder : la LECTURE
        // (`select…order`, thenable seulement au `order`), la mise à jour
        // ciblée (`update…eq(id)…eq(org)`) et la réécriture
        // (`delete…eq(question_id)…eq(org)` puis `insert`).
        let mode: "read" | "update" | "delete" | null = null;
        let cible: string | null = null;
        let champs: Record<string, unknown> | null = null;
        const chaine: Record<string, unknown> = {
          select: () => {
            mode = "read";
            return chaine;
          },
          update: (fields: Record<string, unknown>) => {
            mode = "update";
            champs = fields;
            return chaine;
          },
          delete: () => {
            mode = "delete";
            return chaine;
          },
          insert: (rows: Array<Record<string, unknown>>) => {
            state.inserts.push(...rows);
            return Promise.resolve({ error: null });
          },
          order: () => Promise.resolve({ data: state.anciennes, error: null }),
          eq: (col: string, val: unknown) => {
            if (col === "id") cible = String(val);
            if (col === "question_id" && mode === "delete") {
              state.deletes.push(String(val));
            }
            if (col === "organization_id" && mode !== "read") {
              if (mode === "update" && cible && champs) {
                state.updates.push({ id: cible, fields: champs });
              }
              return Promise.resolve({ error: null });
            }
            return chaine;
          },
        };
        return chaine;
      }

      if (table === "event_answers") {
        const chaine: Record<string, unknown> = {
          select: () => chaine,
          eq: (col: string, val: unknown) => {
            state.filtresComptage.push([col, val]);
            return state.filtresComptage.length === 2
              ? Promise.resolve({ count: state.reponses, error: null })
              : chaine;
          },
        };
        return chaine;
      }

      throw new Error(`table inattendue: ${table}`);
    },
  })),
}));

const { updateEventQuestion } = await import("./events");

function question(options: Array<{ label: string; is_correct: boolean }>) {
  return {
    id: QUESTION_ID,
    questionType: "quiz" as const,
    prompt: "Quelle est la capitale de la France ?",
    timeLimitSeconds: 20,
    pointsBase: 100,
    options,
  };
}

const TROIS = [
  { label: "Paris", is_correct: true },
  { label: "Lyon", is_correct: false },
  { label: "Marseille", is_correct: false },
];

beforeEach(() => {
  state.anciennes = [
    { id: "opt-a", position: 0 },
    { id: "opt-b", position: 1 },
    { id: "opt-c", position: 2 },
  ];
  state.reponses = 0;
  state.deletes = [];
  state.inserts = [];
  state.updates = [];
  state.updatesQuestion = [];
  state.filtresComptage = [];
  state.role = "owner";
});

describe("updateEventQuestion — la coquille corrigée en direct", () => {
  it("corriger un libellé ne supprime AUCUNE option, donc aucune réponse", async () => {
    state.reponses = 42;

    const res = await updateEventQuestion(
      question([
        { label: "Paris", is_correct: true },
        { label: "Lyon", is_correct: false },
        { label: "Marseille", is_correct: false }, // « Marsseille » corrigé
      ]),
    );

    expect(res.ok).toBe(true);
    // LE POINT DE TOUT LE CORRECTIF : plus aucun delete.
    expect(state.deletes).toEqual([]);
    expect(state.inserts).toEqual([]);
    // Chaque option est mise à jour SUR SON ID : les réponses qui pointent
    // dessus survivent.
    expect(state.updates.map((u) => u.id)).toEqual(["opt-a", "opt-b", "opt-c"]);
    expect(state.updates[2].fields).toEqual({
      label: "Marseille",
      is_correct: false,
      position: 2,
    });
  });

  it("refuse d'AJOUTER une option quand la salle a déjà répondu, et nomme le nombre", async () => {
    state.reponses = 42;

    const res = await updateEventQuestion(
      question([...TROIS, { label: "Toulouse", is_correct: false }]),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("42");
    // Rien n'est parti : ni la question, ni les options.
    expect(state.updatesQuestion).toEqual([]);
    expect(state.deletes).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it("refuse d'en RETIRER une pour la même raison", async () => {
    state.reponses = 7;

    const res = await updateEventQuestion(question(TROIS.slice(0, 2)));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("7");
    expect(state.deletes).toEqual([]);
  });

  it("laisse ajouter une option tant que personne n'a répondu", async () => {
    // CONTRÔLE NÉGATIF DE LA GARDE : préparer sa soirée reste libre. Une
    // garde qui bloquerait aussi ce cas rendrait l'éditeur inutilisable et
    // apprendrait au commerçant à contourner.
    state.reponses = 0;

    const res = await updateEventQuestion(
      question([...TROIS, { label: "Toulouse", is_correct: false }]),
    );

    expect(res.ok).toBe(true);
    expect(state.deletes).toEqual([QUESTION_ID]);
    expect(state.inserts).toHaveLength(4);
  });

  it("compte les réponses de CETTE question et de SON organisation", async () => {
    state.reponses = 1;

    await updateEventQuestion(question(TROIS.slice(0, 2)));

    // Un comptage non scopé ferait refuser une modification à cause de
    // l'activité d'un autre commerçant, et divulguerait son volume.
    expect(state.filtresComptage).toEqual([
      ["question_id", QUESTION_ID],
      ["organization_id", "org-1"],
    ]);
  });

  it("ne compte rien quand le nombre d'options ne bouge pas", async () => {
    // Le chemin non destructeur ne doit pas payer un aller-retour de plus.
    await updateEventQuestion(question(TROIS));

    expect(state.filtresComptage).toEqual([]);
  });

  it("laisse la garde de rôle passer avant toute lecture d'options", async () => {
    state.role = "cashier";

    const res = await updateEventQuestion(question(TROIS));

    expect(res.ok).toBe(false);
    expect(state.updates).toEqual([]);
    expect(state.updatesQuestion).toEqual([]);
  });
});
