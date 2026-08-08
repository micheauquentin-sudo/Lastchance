// @vitest-environment node
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ────────────────────────────────────────────────────────────
// quiz-context — chemin de LECTURE PUBLIC du Créateur de quiz
// (/quiz/[slug]) et contexte des actions publiques du parcours joueur.
//
// POURQUOI CE FICHIER : le module tient sa promesse la plus forte — la BONNE
// RÉPONSE ne franchit jamais la frontière avant que CE joueur ait répondu —
// en TROIS couches : la RPC `quiz_public_state`, le mapper `mapQuizPublicState`,
// et le type jouable qui n'a pas de champ pour la vérité. Les deux dernières
// sont prouvées par `quiz.test.ts` sur des jsonb fabriqués à la main, la
// première par pgTAP. PERSONNE ne prouvait la QUATRIÈME : que le chargeur
// public passe bien par ce mapper. Un `return { publicState: stateRaw }` —
// une ligne — suffirait à publier les réponses dans le payload RSC de la page,
// sans casser un seul test existant.
//
// Ce fichier exerce donc le chargeur RÉEL, avec une RPC délibérément SIMULÉE
// EN TRAIN DE FUIR : elle renvoie la vérité sur des questions non répondues,
// dans un champ imbriqué et jusque dans les options. Ce qui ressort du
// chargeur doit être propre.
//
// Le faux client respecte la PROJECTION (liste de colonnes) : sans cela, les
// assertions « telle colonne ne sort pas » ne pourraient jamais rougir, la
// ligne entière étant rendue de toute façon.
// ────────────────────────────────────────────────────────────

const { db, cookieJar, createAdminClientMock } = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  // Type NOMMÉ, sans quoi `builder` se référencerait dans son propre
  // initialiseur et retomberait en `any` implicite.
  type Builder = {
    eq: (column: string, value: unknown) => Builder;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  };

  /** Découpe une liste de colonnes PostgREST aux virgules de PREMIER niveau. */
  function splitTopLevel(columns: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of columns) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  /**
   * Applique la projection demandée, relations embarquées comprises. C'est ce
   * qui rend falsifiables les assertions de non-exposition : un retour à
   * `organizations(*)` ferait effectivement sortir les colonnes sensibles ici,
   * et le test rougirait — comme en production.
   */
  function project(row: Row, columns: string): Row {
    const out: Row = {};
    for (const part of splitTopLevel(columns)) {
      if (part === "*") {
        Object.assign(out, row);
        continue;
      }
      const embed = /^([A-Za-z_]+)(?:![A-Za-z_]+)?\((.*)\)$/.exec(part);
      if (!embed) {
        out[part] = row[part] ?? null;
        continue;
      }
      const [, name, inner] = embed;
      const value = row[name];
      if (Array.isArray(value)) {
        out[name] = value.map((entry) => project(entry as Row, inner));
      } else if (value && typeof value === "object") {
        out[name] = project(value as Row, inner);
      } else {
        out[name] = value ?? null;
      }
    }
    return out;
  }

  const db = {
    quizzes: [] as Row[],
    /** Table + colonnes + filtres de chaque requête, dans l'ordre. */
    queries: [] as Array<{
      table: string;
      columns: string;
      filters: Record<string, unknown>;
    }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    /** Réponse simulée de `quiz_public_state`. */
    rpcData: null as unknown,
    rpcError: null as { message: string } | null,
    reset(): void {
      db.quizzes = [];
      db.queries = [];
      db.rpcCalls = [];
      db.rpcData = null;
      db.rpcError = null;
    },
  };

  function createAdminClientMock() {
    return {
      from(table: string) {
        return {
          select(columns: string) {
            // `filters` est enregistré par RÉFÉRENCE puis rempli par les `eq`
            // successifs : complet au moment des assertions.
            const filters: Record<string, unknown> = {};
            db.queries.push({ table, columns, filters });
            const builder: Builder = {
              eq(column, value) {
                filters[column] = value;
                return builder;
              },
              maybeSingle: async () => {
                const row = db.quizzes.find((r) =>
                  Object.entries(filters).every(([k, v]) => r[k] === v),
                );
                return { data: row ? project(row, columns) : null, error: null };
              },
            };
            return builder;
          },
        };
      },
      rpc(name: string, args: Record<string, unknown>) {
        db.rpcCalls.push({ name, args });
        return Promise.resolve({ data: db.rpcData, error: db.rpcError });
      },
    };
  }

  return {
    db,
    cookieJar: { jar: {} as Record<string, string> },
    createAdminClientMock,
  };
});

// La factory `vi.mock` est hissée au-dessus des imports : elle ne peut lire
// que des valeurs issues de `vi.hoisted`.
// Ce fichier éprouve le GARDE-BARRIÈRE du contexte, pas le chargeur d'octrois.
// Sans octroi, le verdict doit être exactement celui d'avant P0.4 — c'est ce
// que ce double fige. Que l'octroi OUVRE le module est prouvé là où la
// décision vit : src/lib/module-acces-public.test.ts.
vi.mock("@/lib/module-grants-loader", () => ({
  chargerOctroisVivants: () => Promise.resolve([]),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name in cookieJar.jar ? { value: cookieJar.jar[name] } : undefined,
  }),
}));

import {
  hasQuizAccess,
  loadQuizActionContext,
  loadQuizPublicContext,
  quizTokenCookieName,
} from "./quiz-context";

/** Le refus unique du module — recopié, car c'est sa stabilité qu'on teste. */
const UNAVAILABLE = "Ce quiz n'est pas disponible.";

const QUIZ_ID = "7c2f9e10-0000-4000-8000-000000000001";
const SLUG = "quiz-de-marcel";
const ORG_ID = "org-marcel";
const OTHER_ORG_ID = "org-voisin";

/** Vérité qu'aucune question NON répondue ne doit laisser franchir. */
const VERITE = "LA-REPONSE-EST-42";
/** Vérité cachée dans une OPTION (champ annexe hors du contrat du mapper). */
const VERITE_OPTION = "CETTE-OPTION-EST-LA-BONNE";
/** Donnée d'un AUTRE joueur, qu'un jsonb élargi pourrait charrier. */
const AUTRE_JOUEUR = "voisin@exemple.test";
/** Secret d'organisation qu'un `organizations(*)` ferait sortir. */
const SECRET_ORG = "whsec-webhook-du-commerce";

type Over = Record<string, unknown>;

function org(over: Over = {}) {
  return {
    id: ORG_ID,
    name: "Chez Marcel",
    logo_url: null,
    subscription_status: "active",
    trial_ends_at: "2026-01-01T00:00:00.000Z",
    past_due_since: null,
    addon_quiz: true,
    comp_access: false,
    comp_access_until: null,
    timezone: "Europe/Paris",
    // Colonnes JAMAIS demandées : présentes dans la ligne brute pour que la
    // projection ait quelque chose à retenir.
    webhook_secret: SECRET_ORG,
    stripe_customer_id: "cus_marcel",
    ...over,
  };
}

function quiz(over: Over = {}) {
  return {
    id: QUIZ_ID,
    organization_id: ORG_ID,
    status: "active",
    public_slug: SLUG,
    reward_mode: "threshold",
    share_enabled: true,
    organizations: org(),
    ...over,
  };
}

/**
 * Questions VOLONTAIREMENT FUYANTES : la RPC est simulée en train de renvoyer
 * la vérité sur trois questions que le joueur n'a pas répondues (dont une au
 * statut inconnu, dont une dans un objet imbriqué), et jusque dans un champ
 * annexe des options. La RPC réelle ne fait rien de tel ; c'est le chargeur
 * qu'on teste, et un chargeur qui recopierait le jsonb brut publierait tout.
 */
const QUESTIONS = [
  {
    // RÉPONDUE par ce joueur : la vérité lui est due (écran de récap).
    id: "q-1",
    position: 1,
    question_type: "choice",
    preset: "multiple_choice",
    prompt: "Quelle est la capitale ?",
    image_url: null,
    options: [
      { id: "o-1", label: "Paris" },
      { id: "o-2", label: "Lyon" },
    ],
    ranking_size: null,
    tolerance: null,
    points: 10,
    time_limit_seconds: null,
    status: "answered",
    started_at: "2026-07-30T11:59:00.000Z",
    correct_answer: "o-1",
    your_answer: "o-1",
    is_correct: true,
    points_awarded: 10,
    elapsed_ms: 4200,
    timed_out: false,
  },
  {
    // EN COURS : le chronomètre tourne, la vérité ne doit pas partir.
    id: "q-2",
    position: 2,
    question_type: "number",
    preset: "estimate",
    prompt: "Combien de fûts en cave ?",
    image_url: null,
    options: [],
    ranking_size: null,
    tolerance: 3,
    points: 20,
    time_limit_seconds: 30,
    status: "in_progress",
    started_at: "2026-07-30T11:59:50.000Z",
    // Vérité IMBRIQUÉE : un mapper qui recopierait l'objet la publierait.
    correct_answer: { value: VERITE, indices: [VERITE] },
    your_answer: VERITE,
    is_correct: true,
    points_awarded: 20,
    elapsed_ms: 999,
    timed_out: true,
  },
  {
    // PAS ENCORE PRÉSENTÉE : ni la vérité, ni un indice dans les options.
    id: "q-3",
    position: 3,
    question_type: "choice",
    preset: "true_false",
    prompt: "Le vin de Marcel est-il bio ?",
    image_url: null,
    options: [
      { id: "o-3", label: "Oui", is_correct: true, explication: VERITE_OPTION },
      { id: "o-4", label: "Non", is_correct: false },
    ],
    ranking_size: null,
    tolerance: null,
    points: 5,
    time_limit_seconds: null,
    status: "pending",
    correct_answer: VERITE,
    your_answer: null,
    is_correct: null,
    points_awarded: null,
    elapsed_ms: null,
    timed_out: false,
  },
  {
    // Statut INCONNU (colonne élargie, faute de frappe SQL, jsonb bricolé) :
    // tout ce qui n'est pas explicitement `answered` doit rester muet.
    id: "q-4",
    position: 4,
    question_type: "text",
    preset: "free_prediction",
    prompt: "Le nom du chien du patron ?",
    image_url: null,
    options: [],
    ranking_size: null,
    tolerance: null,
    points: 5,
    time_limit_seconds: null,
    status: "presque_repondu",
    correct_answer: VERITE,
    your_answer: VERITE,
    is_correct: true,
    points_awarded: 5,
    elapsed_ms: 1,
    timed_out: true,
  },
];

function publicStateRaw(over: Over = {}) {
  return {
    state: "ok",
    server_now: "2026-07-30T12:00:00.000Z",
    quiz: {
      id: QUIZ_ID,
      name: "Le quiz de Marcel",
      theme: "gourmand",
      status: "active",
      intro_text: "Trois questions, un dessert à gagner.",
      question_count: 4,
      reward_mode: "threshold",
      reward_threshold: 2,
      draw_top_n: null,
      draw_state: "pending",
      reward_label: "Un dessert offert",
      reward_details: null,
      reward_stock: 10,
      reward_claimed_count: 3,
    },
    questions: QUESTIONS,
    player: {
      id: "player-moi",
      first_name: "Marco",
      avatar: "fox",
      score: 10,
      correct_count: 1,
      total_elapsed_ms: 4200,
      finished_at: null,
    },
    // Champ HORS CONTRAT : le mapper est une liste blanche, pas un passe-plat.
    all_players: [{ id: "player-voisin", email: AUTRE_JOUEUR, score: 40 }],
    progression: { answered_count: 1, question_count: 4 },
    reward: {
      source: "threshold",
      rank: null,
      code: "QUIZ-ABCD2345",
      spin_grant_token: null,
      target_wheel_id: null,
      resulting_spin_id: null,
      out_of_stock: false,
      redeemed_at: null,
    },
    ...over,
  };
}

/**
 * Hash recalculé ici, jamais importé de `@/lib/pronostics` : un test qui
 * réutilise la fonction hachée ne prouve que sa cohérence avec elle-même.
 */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

beforeEach(() => {
  db.reset();
  db.quizzes = [quiz()];
  db.rpcData = publicStateRaw();
  cookieJar.jar = {};
  vi.restoreAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. Résolution : UUID ou public_slug
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — résolution du quiz", () => {
  it("un UUID est cherché sur `id`, jamais sur le slug", async () => {
    // Rouge si l'UUID partait vers `public_slug` : les liens de partage bâtis
    // sur l'identifiant (et les redirections internes) cesseraient de résoudre.
    const ctx = await loadQuizPublicContext(QUIZ_ID);

    expect(db.queries[0].filters).toEqual({ id: QUIZ_ID });
    expect(ctx.ok).toBe(true);
  });

  it("un slug est cherché sur `public_slug`, en minuscules", async () => {
    // Conséquence produit : un slug recopié à la main depuis une ardoise, en
    // capitales, doit ouvrir le quiz. Rouge si le `.toLowerCase()` sautait —
    // le QR marcherait, la saisie manuelle non.
    const ctx = await loadQuizPublicContext("Quiz-De-Marcel");

    expect(db.queries[0].filters).toEqual({ public_slug: SLUG });
    expect(ctx.ok).toBe(true);
  });

  it("une chaîne qui CONTIENT un UUID reste un slug", async () => {
    // Rouge si le motif perdait ses ancres `^…$` : une saisie arbitraire
    // partirait vers une colonne `uuid` et ferait échouer la requête (22P02)
    // au lieu de rendre un 404 propre.
    await loadQuizPublicContext(`prefixe-${QUIZ_ID}`);

    expect(db.queries[0].filters).toEqual({ public_slug: `prefixe-${QUIZ_ID}` });
  });
});

// ────────────────────────────────────────────────────────────
// 2. Refus indistinguables — et AUCUN appel à la RPC
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — refus indistinguables", () => {
  const refusals: Array<[string, () => void]> = [
    ["quiz inconnu", () => { db.quizzes = []; }],
    [
      "organisation embarquée absente",
      () => { db.quizzes = [quiz({ organizations: null })]; },
    ],
    [
      "organisation embarquée d'un AUTRE tenant",
      () => { db.quizzes = [quiz({ organizations: org({ id: OTHER_ORG_ID }) })]; },
    ],
    [
      "module quiz coupé",
      () => { db.quizzes = [quiz({ organizations: org({ addon_quiz: false }) })]; },
    ],
    [
      "essai expiré",
      () => {
        db.quizzes = [
          quiz({
            organizations: org({
              subscription_status: "trialing",
              trial_ends_at: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    [
      "impayé au-delà du délai de grâce",
      () => {
        db.quizzes = [
          quiz({
            organizations: org({
              subscription_status: "past_due",
              past_due_since: "2020-01-01T00:00:00.000Z",
            }),
          }),
        ];
      },
    ],
    ["quiz en brouillon", () => { db.quizzes = [quiz({ status: "draft" })]; }],
    ["quiz archivé", () => { db.quizzes = [quiz({ status: "archived" })]; }],
  ];

  it("tous les motifs rendent la même phrase et n'appellent JAMAIS la RPC", async () => {
    // Deux propriétés qui se tiennent. (1) Un message par motif ferait de la
    // page un oracle sur l'état COMMERCIAL du commerçant : « essai expiré » se
    // lirait depuis l'extérieur. (2) `quiz_public_state` est la fonction qui
    // matérialise l'état du joueur ; l'appeler avant d'avoir statué sur le
    // tenant et l'abonnement, c'est la faire travailler pour un visiteur qu'on
    // va refuser — sur un chemin ouvert à Internet.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = new Set<string>();

    for (const [label, setup] of refusals) {
      db.reset();
      db.rpcData = publicStateRaw();
      db.quizzes = [quiz()];
      setup();

      const ctx = await loadQuizPublicContext(SLUG);
      if (ctx.ok) throw new Error(`« ${label} » aurait dû fermer le quiz`);
      messages.add(ctx.error);
      expect(db.rpcCalls, label).toEqual([]);
    }

    expect(messages).toEqual(new Set([UNAVAILABLE]));
  });

  it("l'incohérence de tenant est TRACÉE, pas seulement refusée", async () => {
    // La service role contourne la RLS : un quiz dont l'organisation embarquée
    // pointe ailleurs est un état qui ne devrait pas exister. Le refuser
    // silencieusement le rendrait invisible ; rouge si le `console.error`
    // disparaissait — plus personne ne saurait qu'une donnée a divergé.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.quizzes = [quiz({ organizations: org({ id: OTHER_ORG_ID }) })];

    await loadQuizPublicContext(SLUG);

    expect(spy).toHaveBeenCalled();
  });

  it("ne demande que les colonnes publiques, du quiz comme de l'organisation", async () => {
    // `organizations(*)` ramènerait `webhook_secret` et `stripe_customer_id`
    // dans un contexte servi à un anonyme — invisible du typage, la ligne étant
    // castée depuis `unknown`. Le faux respecte la projection : si la liste
    // s'élargissait, le secret ressortirait ici comme en production.
    const ctx = await loadQuizPublicContext(SLUG);

    expect(db.queries[0].columns).toContain(
      "organizations(id, name, logo_url, subscription_status, trial_ends_at, past_due_since, addon_quiz, comp_access, comp_access_until, timezone)",
    );
    expect(db.queries[0].columns).not.toContain("*");
    expect(JSON.stringify(ctx)).not.toContain(SECRET_ORG);
    expect(JSON.stringify(ctx)).not.toContain("cus_marcel");
  });

  it("une seule requête précède la RPC", async () => {
    // Chemin ouvert à Internet : rouge si quelqu'un rajoutait une lecture
    // séquentielle (organisation, questions) avant les gardes.
    await loadQuizPublicContext(SLUG);

    expect(db.queries).toHaveLength(1);
    expect(db.rpcCalls).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// 3. Identité du joueur — sous quel nom la RPC est appelée
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — identité passée à la RPC", () => {
  it("sans cookie : aucune identité n'est envoyée", async () => {
    // `p_player_token_hash` porte un DEFAULT NULL en SQL : `undefined` est ici
    // correct (supabase-js le retire du corps JSON, Postgres applique le
    // défaut). Rouge si une valeur factice partait à sa place — la RPC
    // chercherait un joueur de hash vide et pourrait attribuer ses réponses,
    // son score et son code QUIZ-… au premier visiteur venu.
    const ctx = await loadQuizPublicContext(SLUG);

    expect(db.rpcCalls).toHaveLength(1);
    expect(db.rpcCalls[0].name).toBe("quiz_public_state");
    expect(db.rpcCalls[0].args).toEqual({
      p_quiz_id: QUIZ_ID,
      p_player_token_hash: undefined,
    });
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(false);
  });

  it("avec cookie : seul le SHA-256 part, jamais le jeton", async () => {
    // Le cookie est le mot de passe du joueur sur ce quiz. Rouge si
    // `hashPlayerToken` sautait : le jeton brut transiterait vers la base, et
    // une fuite de journal suffirait à rejouer l'identité — donc à lire les
    // réponses déjà données et le code de retrait.
    const TOKEN = "jeton-du-joueur";
    cookieJar.jar[quizTokenCookieName(QUIZ_ID)] = TOKEN;

    const ctx = await loadQuizPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBe(sha256(TOKEN));
    expect(JSON.stringify(db.rpcCalls[0].args)).not.toContain(TOKEN);
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(true);
    // Ni le jeton ni son hash ne repartent vers l'appelant (donc vers le RSC).
    expect(JSON.stringify(ctx)).not.toContain(TOKEN);
    expect(JSON.stringify(ctx)).not.toContain(sha256(TOKEN));
  });

  it("le cookie est nommé par QUIZ : celui d'un autre quiz est ignoré", async () => {
    // Deux quiz d'un même commerce sur le même téléphone doivent avoir deux
    // identités. Rouge si le nom du cookie perdait l'identifiant : le score et
    // le code de retrait d'un quiz s'afficheraient sur l'autre.
    cookieJar.jar[quizTokenCookieName("un-autre-quiz")] = "jeton";

    const ctx = await loadQuizPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBeUndefined();
    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.hasIdentity).toBe(false);
  });

  it("le cookie est cherché sur l'identifiant RÉSOLU, pas sur l'URL", async () => {
    // Le visiteur arrive par le slug ; son cookie est nommé par l'UUID. Rouge
    // si le nom était construit sur le paramètre d'URL : le même joueur aurait
    // deux identités selon qu'il vient du QR ou du lien, et perdrait sa partie
    // en cours à mi-parcours.
    const TOKEN = "jeton-du-joueur";
    cookieJar.jar[quizTokenCookieName(QUIZ_ID)] = TOKEN;

    await loadQuizPublicContext(SLUG);

    expect(db.rpcCalls[0].args.p_player_token_hash).toBe(sha256(TOKEN));
  });
});

// ────────────────────────────────────────────────────────────
// 4. LE CŒUR — la vérité ne franchit pas la frontière
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — non-fuite de la bonne réponse", () => {
  it("aucune vérité d'une question non répondue ne sort, même imbriquée", async () => {
    // INVARIANT #2 du module, vérifié ici À TRAVERS LE CHEMIN PUBLIC RÉEL. La
    // RPC est simulée en train de fuir sur trois questions ; c'est le passage
    // par `mapQuizPublicState` qui doit tout annuler. Rouge si le chargeur
    // rendait `stateRaw` brut (une ligne suffit) : les bonnes réponses
    // seraient lisibles dans le payload RSC AVANT que le joueur ne joue — le
    // quiz cesserait purement et simplement d'être un quiz.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    const dump = JSON.stringify(ctx);
    expect(dump).not.toContain(VERITE);
    expect(dump).not.toContain(VERITE_OPTION);
  });

  it("question EN COURS : chronomètre conservé, vérité et issue à null", async () => {
    // `startedAt` doit survivre (le compte à rebours s'affiche à partir de lui)
    // alors que tout le reste tombe : c'est la distinction qu'un filtrage
    // grossier « on efface tout sauf answered » perdrait, en cassant le timer.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    const q2 = ctx.publicState.questions[1];
    expect(q2.status).toBe("in_progress");
    expect(q2.startedAt).toBe("2026-07-30T11:59:50.000Z");
    expect(q2).toMatchObject({
      correctAnswer: null,
      yourAnswer: null,
      isCorrect: null,
      pointsAwarded: null,
      elapsedMs: null,
      timedOut: false,
    });
  });

  it("question au statut INCONNU : traitée comme non répondue", async () => {
    // Rouge si le mapping de statut basculait en liste noire
    // (`answered = status !== "pending"`) : n'importe quelle valeur inattendue
    // — colonne élargie, faute de frappe dans une future migration — ouvrirait
    // la vérité. La liste blanche fait qu'un statut inconnu ferme.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    const q4 = ctx.publicState.questions[3];
    expect(q4.status).toBe("pending");
    expect(q4.correctAnswer).toBeNull();
    expect(q4.yourAnswer).toBeNull();
    expect(q4.isCorrect).toBeNull();
  });

  it("les options ne portent QUE id et label", async () => {
    // La RPC est simulée en ajoutant `is_correct` et une explication aux
    // options : recopiées telles quelles, elles désigneraient la bonne réponse
    // sans même passer par `correct_answer`. Rouge si le mapper d'options
    // devenait un passe-plat (`...option`).
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    const options = ctx.publicState.questions[2].options;
    expect(options).toEqual([
      { id: "o-3", label: "Oui" },
      { id: "o-4", label: "Non" },
    ]);
    for (const option of options) {
      expect(Object.keys(option).sort()).toEqual(["id", "label"]);
    }
  });

  it("un champ hors contrat à la racine (autres joueurs) est ignoré", async () => {
    // Le mapper est une LISTE BLANCHE. Rouge s'il devenait un passe-plat : une
    // future clé du jsonb — ici l'email d'un autre participant — serait publiée
    // sans que personne n'ait à toucher au TypeScript.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(JSON.stringify(ctx)).not.toContain(AUTRE_JOUEUR);
    expect(JSON.stringify(ctx)).not.toContain("player-voisin");
  });

  it("la question DÉJÀ répondue rend bien sa correction au joueur", async () => {
    // Contrôle NÉGATIF du filtrage : si le chargeur masquait tout, les tests
    // ci-dessus seraient verts pour la mauvaise raison. L'écran de récap doit
    // dire au joueur ce qu'il fallait répondre — sinon le quiz n'apprend rien.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    const q1 = ctx.publicState.questions[0];
    expect(q1.status).toBe("answered");
    expect(q1.correctAnswer).toBe("o-1");
    expect(q1.yourAnswer).toBe("o-1");
    expect(q1.isCorrect).toBe(true);
    expect(q1.pointsAwarded).toBe(10);
  });

  it("rend de quoi jouer : quiz, progression et lot du joueur courant", async () => {
    // Second contrôle négatif, côté utile : le code QUIZ-… du joueur DOIT
    // sortir — c'est ce qu'il présente en caisse. Rouge si un durcissement
    // excessif le supprimait : le lot deviendrait irretirable.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.quizId).toBe(QUIZ_ID);
    expect(ctx.publicSlug).toBe(SLUG);
    expect(ctx.organization.id).toBe(ORG_ID);
    expect(ctx.publicState.quiz?.name).toBe("Le quiz de Marcel");
    expect(ctx.publicState.progression).toEqual({
      answeredCount: 1,
      questionCount: 4,
    });
    expect(ctx.publicState.player?.id).toBe("player-moi");
    expect(ctx.publicState.reward?.code).toBe("QUIZ-ABCD2345");
  });

  it("les questions sortent triées par position, quel que soit l'ordre du jsonb", async () => {
    // Rouge si le tri sautait : un joueur reprenant sa partie verrait les
    // questions dans le désordre du jsonb, donc pas dans l'ordre où la RPC les
    // lui a présentées.
    db.rpcData = publicStateRaw({ questions: [...QUESTIONS].reverse() });

    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.publicState.questions.map((q) => q.position)).toEqual([1, 2, 3, 4]);
  });
});

// ────────────────────────────────────────────────────────────
// 4 bis. Le partage de fin de partie — un réglage du commerçant
//
// Les boutons « Défier un ami » / « Partager mon score » étaient rendus sans
// qu'aucun réglage ne puisse les éteindre. `quizzes.share_enabled` les met
// entre les mains du commerçant ; ce qui doit rester vrai, c'est que le
// drapeau VOYAGE bien jusqu'à la page — un contexte qui l'oublierait laisserait
// l'interrupteur du dashboard sans effet visible, et le commerçant croirait
// avoir coupé quelque chose.
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — partage en fin de partie", () => {
  it("le réglage du commerçant traverse jusqu'au contexte", async () => {
    db.quizzes = [quiz({ share_enabled: false })];

    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.shareEnabled).toBe(false);
  });

  it("partage laissé actif : le contexte le dit", async () => {
    // Contrôle positif : sans lui, un `shareEnabled: false` écrit en dur
    // passerait le test précédent en éteignant le partage partout.
    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.shareEnabled).toBe(true);
  });

  it("colonne absente de la ligne : le partage RESTE proposé", async () => {
    // La ligne est castée depuis `unknown` : rien ne garantit la présence du
    // champ au typage. Le repli doit reconduire le comportement LIVRÉ (partage
    // proposé) et non l'éteindre en silence chez tous les commerçants — c'est
    // pourquoi la lecture est `!== false` et non `Boolean(...)`.
    db.quizzes = [quiz({ share_enabled: null })];

    const ctx = await loadQuizPublicContext(SLUG);

    if (!ctx.ok) throw new Error(ctx.error);
    expect(ctx.shareEnabled).toBe(true);
  });

  it("le drapeau est lu par la MÊME requête, sans aller-retour supplémentaire", async () => {
    // Chemin ouvert à Internet : rouge si quelqu'un ajoutait une lecture
    // dédiée au partage plutôt que de l'inscrire dans la projection.
    await loadQuizPublicContext(SLUG);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].columns).toContain("share_enabled");
  });
});

// ────────────────────────────────────────────────────────────
// 5. Fail-closed sur la RPC
// ────────────────────────────────────────────────────────────
describe("loadQuizPublicContext — fail-closed", () => {
  it("une RPC en erreur ferme la page", async () => {
    // Rouge si l'erreur était ignorée : `mapQuizPublicState(null)` rend un état
    // « unavailable » silencieux, et la page afficherait un quiz vide plutôt
    // qu'un 404 — le joueur croirait sa partie perdue et recommencerait.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    db.rpcError = { message: "deadlock detected" };

    const ctx = await loadQuizPublicContext(SLUG);

    if (ctx.ok) throw new Error("RPC en erreur : la page doit être fermée");
    expect(ctx.error).toBe(UNAVAILABLE);
    expect(spy).toHaveBeenCalled();
  });

  it.each([
    ["un état non `ok`", { state: "unavailable" }],
    ["un jsonb sans quiz", { quiz: null }],
  ])("%s ferme la page", async (_label, over) => {
    // Rouge si le chargeur se contentait de l'absence d'erreur SQL : la RPC
    // refuse aussi PAR LA DONNÉE (garde d'addon rejouée côté SQL), pas
    // seulement par exception.
    db.rpcData = publicStateRaw(over);

    const ctx = await loadQuizPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });

  it("une réponse RPC informe (null) ferme la page", async () => {
    db.rpcData = null;

    const ctx = await loadQuizPublicContext(SLUG);

    expect(ctx.ok).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 6. Contexte d'action — la garde anti-robot en dépend
// ────────────────────────────────────────────────────────────
describe("loadQuizActionContext — contexte minimal des actions publiques", () => {
  const refusals: Array<[string, () => void]> = [
    ["quiz inconnu", () => { db.quizzes = []; }],
    ["organisation absente", () => { db.quizzes = [quiz({ organizations: null })]; }],
    [
      "organisation d'un autre tenant",
      () => { db.quizzes = [quiz({ organizations: org({ id: OTHER_ORG_ID }) })]; },
    ],
    [
      "module coupé",
      () => { db.quizzes = [quiz({ organizations: org({ addon_quiz: false }) })]; },
    ],
    ["quiz archivé", () => { db.quizzes = [quiz({ status: "archived" })]; }],
  ];

  it.each(refusals)("refuse SANS motif quand %s", async (_label, setup) => {
    // Le contrat de refus est ici plus pauvre que celui de la page : PAS de
    // champ `error`. Rouge si un motif s'y glissait — ces contextes servent des
    // actions POST, dont la réponse est directement lisible par l'appelant.
    setup();

    const ctx = await loadQuizActionContext(QUIZ_ID);

    expect(ctx).toEqual({ ok: false });
  });

  it("n'appelle jamais la RPC d'état public, et ne lit qu'une ligne", async () => {
    // Une action publique n'a pas à reconstruire tout l'état du quiz pour
    // vérifier une garde : c'est l'amplification de lecture qu'on refuse sur un
    // chemin ouvert. Rouge si quelqu'un « réutilisait » le chargeur de page.
    await loadQuizActionContext(QUIZ_ID);

    expect(db.rpcCalls).toEqual([]);
    expect(db.queries).toHaveLength(1);
  });

  it("ne résout QUE par identifiant, jamais par slug", async () => {
    // Rouge si ce chargeur acceptait aussi le slug : les actions publiques
    // recevraient une clé devinable là où la page a déjà résolu l'UUID.
    const ctx = await loadQuizActionContext(SLUG);

    expect(db.queries[0].filters).toEqual({ id: SLUG });
    expect(ctx.ok).toBe(false);
  });

  it("rend l'organisation résolue en base, jamais celle passée en entrée", async () => {
    // `organizationId` sort de la LIGNE lue : c'est lui qui scopera ensuite les
    // écritures. Rouge s'il venait de l'appelant.
    const ctx = await loadQuizActionContext(QUIZ_ID);

    if (!ctx.ok) throw new Error("le quiz nominal doit être accepté");
    expect(ctx.quizId).toBe(QUIZ_ID);
    expect(ctx.organizationId).toBe(ORG_ID);
    expect(ctx.admin).toBeDefined();
  });

  it.each(["threshold", "draw", "ranking", "instant", "none"])(
    "recopie le mode de récompense connu « %s »",
    async (mode) => {
      db.quizzes = [quiz({ reward_mode: mode })];

      const ctx = await loadQuizActionContext(QUIZ_ID);

      if (!ctx.ok) throw new Error("le quiz nominal doit être accepté");
      expect(ctx.rewardMode).toBe(mode);
    },
  );

  it.each([["mode inventé", "surprise"], ["valeur vide", ""], ["null", null]])(
    "un mode inconnu (%s) retombe sur `threshold`, JAMAIS sur `none`",
    async (_label, mode) => {
      // LA garde de ce fichier. `finishQuiz` est le SEUL appel émetteur du
      // parcours public, et il n'oppose le challenge anti-robot que si
      // `rewardMode !== "none"`. Un défaut par le bas (« valeur inconnue → rien
      // à gagner → pas de friction ») laisserait un script vider le stock d'un
      // quiz dont la colonne a été élargie par une future migration. Le mapper
      // d'affichage, lui, retombe volontairement sur `none` — l'asymétrie est
      // le sujet : une valeur inconnue ne doit RIEN promettre au joueur, et
      // TOUT exiger de la machine.
      db.quizzes = [quiz({ reward_mode: mode })];

      const ctx = await loadQuizActionContext(QUIZ_ID);

      if (!ctx.ok) throw new Error("le quiz nominal doit être accepté");
      expect(ctx.rewardMode).toBe("threshold");
      expect(ctx.rewardMode).not.toBe("none");
    },
  );
});

// ────────────────────────────────────────────────────────────
// 7. hasQuizAccess — les deux conditions, pas une seule
// ────────────────────────────────────────────────────────────
describe("hasQuizAccess", () => {
  const NOW = new Date("2026-07-30T12:00:00.000Z");

  type AccessOrg = Parameters<typeof hasQuizAccess>[0];

  function accessOrg(over: Partial<AccessOrg> = {}): AccessOrg {
    return {
      addon_quiz: true,
      subscription_status: "active",
      trial_ends_at: "2026-01-01T00:00:00.000Z",
      past_due_since: null,
      comp_access: false,
      comp_access_until: null,
      ...over,
    };
  }

  it("exige l'addon ET l'accès actif", async () => {
    // Les RPC `service_role` gardent l'addon et le statut du quiz mais NON
    // l'abonnement : c'est ce prédicat, et lui seul, qui referme la porte
    // devant un commerçant dont l'essai est terminé. Rouge si l'un des deux
    // termes sautait — un `&&` devenu `||` ouvrirait le quiz d'un essai expiré,
    // c'est-à-dire ferait jouer et distribuer des lots pour un compte qui ne
    // paie plus.
    expect(hasQuizAccess(accessOrg({ addon_quiz: false }), NOW)).toBe(false);
    expect(
      hasQuizAccess(
        accessOrg({
          subscription_status: "trialing",
          trial_ends_at: "2020-01-01T00:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
    expect(hasQuizAccess(accessOrg(), NOW)).toBe(true);
  });

  it("un octroi vivant sur `quiz` suffit — add-on éteint et abonnement résilié", async () => {
    // LA RÉGRESSION QUE CE FICHIER NE COUVRAIT PAS, et qui a réellement existé.
    //
    // Le lot 2 (migration 20260907120000) a fait de « tout add-on peut être
    // acheté seul » une règle de base : `org_has_module_access` accorde le
    // module dès qu'un octroi daté est vivant, sans exiger ni abonnement ni
    // booléen `addon_*`. Six fonctions de `subscription.ts` ont reçu cette
    // branche ; `hasQuizAccess` vivait ici et ne l'a pas reçue.
    //
    // Le commerçant qui achetait le seul Quiz se voyait donc accorder le
    // module par Postgres et refuser par cet écran — précisément le module
    // qu'il venait de payer. Rouge si quelqu'un réintroduisait une règle
    // locale au lieu de déléguer à `droitEffectifModule`.
    expect(
      hasQuizAccess(
        accessOrg({
          addon_quiz: false,
          subscription_status: "canceled",
          live_module_grants: ["quiz"],
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("un octroi vivant sur un AUTRE module n'ouvre pas le quiz", async () => {
    // Le contre-exemple, sans lequel le test précédent passerait aussi avec un
    // prédicat « au moins un octroi, peu importe lequel ». L'octroi porte le
    // socle commun (`hasActiveAccess`), pas les autres modules : ici l'add-on
    // quiz est éteint, donc la seconde branche refuse.
    expect(
      hasQuizAccess(
        accessOrg({
          addon_quiz: false,
          subscription_status: "canceled",
          live_module_grants: ["hunts"],
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it("un accès offert par le back-office suffit, sans abonnement Stripe", async () => {
    // Chemin réel du commerçant en démonstration : rouge si `hasQuizAccess`
    // court-circuitait `hasActiveAccess` par un test de statut en dur.
    expect(
      hasQuizAccess(
        accessOrg({
          subscription_status: "canceled",
          comp_access: true,
          comp_access_until: null,
        }),
        NOW,
      ),
    ).toBe(true);
  });
});
