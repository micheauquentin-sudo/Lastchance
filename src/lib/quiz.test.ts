import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assignQuizRanks,
  compareQuizStandings,
  mapQuizAnswerResult,
  mapQuizDraw,
  mapQuizFinish,
  mapQuizJoin,
  mapQuizLeaderboard,
  mapQuizPublicState,
  mapQuizQuestion,
  mapQuizSpinGrant,
  normalizeQuizText,
  planQuizReorder,
  quizAnswerToJson,
  quizSolutionToJson,
  quizTimeRemainingMs,
  quizTimerView,
} from "./quiz";
import { normalizeQuizCode } from "./utils";
import {
  createQuizQuestionSchema,
  joinQuizSchema,
  quizAnswerInputSchema,
  quizAnswerSchema,
  quizRedeemCodeSchema,
  reorderQuizQuestionsSchema,
  updateQuizRewardSchema,
} from "./validations/quiz";

const QUIZ = "00000000-0000-4000-8000-000000000001";
const Q1 = "00000000-0000-4000-8000-0000000000a1";
const Q2 = "00000000-0000-4000-8000-0000000000a2";
const WHEEL = "00000000-0000-4000-8000-0000000000bb";

// ────────────────────────────────────────────────────────────
// mapQuizJoin — jsonb join_quiz
// ────────────────────────────────────────────────────────────

describe("mapQuizJoin", () => {
  it("mappe un join réussi (joined)", () => {
    const result = mapQuizJoin({
      state: "joined",
      quiz: {
        id: QUIZ,
        name: "Quiz du terroir",
        theme: "degustation",
        intro_text: "5 questions, un lot à gagner",
        question_count: 5,
        reward_mode: "threshold",
        reward_label: "Un café offert",
      },
      player: {
        id: "player-1",
        first_name: "Marco",
        avatar: "renard",
        score: 3,
        correct_count: 2,
        total_elapsed_ms: 4200,
        finished_at: null,
        marketing_opt_in: true,
        has_email: true,
      },
    });
    expect(result.state).toBe("joined");
    expect(result.quiz).toEqual({
      id: QUIZ,
      name: "Quiz du terroir",
      theme: "degustation",
      introText: "5 questions, un lot à gagner",
      questionCount: 5,
      rewardMode: "threshold",
      rewardLabel: "Un café offert",
    });
    expect(result.player?.firstName).toBe("Marco");
    expect(result.player?.totalElapsedMs).toBe(4200);
    expect(result.player?.hasEmail).toBe(true);
  });

  it("unavailable / jsonb non reconnu → défauts sûrs (aucun oracle)", () => {
    for (const raw of [{ state: "unavailable" }, null, 42, {}, { state: "bogus" }]) {
      const result = mapQuizJoin(raw);
      expect(result.state).toBe("unavailable");
      expect(result.quiz).toBeNull();
      expect(result.player).toBeNull();
    }
  });

  it("thème et mode inconnus retombent sur des valeurs sûres", () => {
    const result = mapQuizJoin({
      state: "joined",
      quiz: { id: QUIZ, theme: "hacker", reward_mode: "gratuit" },
      player: { id: "p" },
    });
    expect(result.quiz?.theme).toBe("neutre");
    expect(result.quiz?.rewardMode).toBe("none");
  });
});

// ────────────────────────────────────────────────────────────
// mapQuizQuestion — la vue joueur ne porte JAMAIS la vérité
// ────────────────────────────────────────────────────────────

describe("mapQuizQuestion", () => {
  const started = {
    state: "started",
    question: {
      id: Q1,
      position: 0,
      question_type: "choice",
      preset: "true_false",
      prompt: "Le safran vient-il d'un crocus ?",
      image_url: "https://exemple.test/safran.jpg",
      options: [
        { id: "a", label: "Oui" },
        { id: "b", label: "Non" },
      ],
      ranking_size: null,
      tolerance: null,
      points: 2,
      time_limit_seconds: 20,
    },
    started_at: "2026-08-03T10:00:00.000Z",
    server_now: "2026-08-03T10:00:05.000Z",
  };

  it("mappe la question présentée et le chronomètre serveur", () => {
    const result = mapQuizQuestion(started);
    expect(result.state).toBe("started");
    expect(result.question?.id).toBe(Q1);
    expect(result.question?.preset).toBe("true_false");
    expect(result.question?.options.map((o) => o.id)).toEqual(["a", "b"]);
    expect(result.question?.timeLimitSeconds).toBe(20);
    expect(result.startedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(result.serverNow).toBe("2026-08-03T10:00:05.000Z");
    expect(result.outcome).toBeNull();
  });

  it("NON-FUITE : aucune bonne réponse ne survit au mapping, même si la RPC en renvoyait", () => {
    const leaky = {
      ...started,
      correct_answer: "a",
      question: { ...started.question, correct_answer: "a", is_correct: true },
    };
    const serialized = JSON.stringify(mapQuizQuestion(leaky));
    expect(serialized).not.toContain("correct");
    expect(serialized).not.toContain("isCorrect");
  });

  it("already_answered expose l'issue figée, sans question ni vérité", () => {
    const result = mapQuizQuestion({
      state: "already_answered",
      question_id: Q1,
      is_correct: false,
      points_awarded: 0,
      elapsed_ms: 21000,
      timed_out: true,
      correct_answer: "a",
    });
    expect(result.question).toBeNull();
    expect(result.outcome).toEqual({
      isCorrect: false,
      pointsAwarded: 0,
      elapsedMs: 21000,
      timedOut: true,
    });
    expect(JSON.stringify(result)).not.toContain("correctAnswer");
  });

  it("état inconnu → unavailable neutre", () => {
    for (const raw of [null, {}, { state: "boom" }, "x"]) {
      const result = mapQuizQuestion(raw);
      expect(result.state).toBe("unavailable");
      expect(result.question).toBeNull();
    }
  });

  it("preset hors forme retombe sur le modèle par défaut", () => {
    const result = mapQuizQuestion({
      state: "started",
      question: { id: Q1, preset: "Nope!!" },
    });
    expect(result.question?.preset).toBe("multiple_choice");
  });
});

// ────────────────────────────────────────────────────────────
// mapQuizAnswerResult — la vérité n'est due qu'après avoir répondu
// ────────────────────────────────────────────────────────────

describe("mapQuizAnswerResult", () => {
  it("recorded : verdict, délai serveur et résultat officiel", () => {
    const result = mapQuizAnswerResult({
      state: "recorded",
      question_id: Q1,
      is_correct: true,
      points_awarded: 2,
      elapsed_ms: 3120,
      timed_out: false,
      correct_answer: "a",
      player: { score: 2, correct_count: 1, total_elapsed_ms: 3120 },
      progression: { answered_count: 1, question_count: 5 },
    });
    expect(result.state).toBe("recorded");
    expect(result.isCorrect).toBe(true);
    expect(result.pointsAwarded).toBe(2);
    expect(result.elapsedMs).toBe(3120);
    expect(result.correctAnswer).toBe("a");
    expect(result.player).toEqual({ score: 2, correctCount: 1, totalElapsedMs: 3120 });
    expect(result.progression).toEqual({ answeredCount: 1, questionCount: 5 });
  });

  it("too_late : hors délai, jamais scoré, vérité due (question consommée)", () => {
    const result = mapQuizAnswerResult({
      state: "too_late",
      question_id: Q1,
      is_correct: false,
      points_awarded: 0,
      elapsed_ms: 20000,
      timed_out: true,
      correct_answer: ["italie"],
    });
    expect(result.timedOut).toBe(true);
    expect(result.pointsAwarded).toBe(0);
    expect(result.correctAnswer).toEqual(["italie"]);
  });

  it("NON-FUITE : un refus ne dit ni la justesse ni la bonne réponse", () => {
    for (const state of ["invalid_answer", "not_started", "unavailable", "not_joined"]) {
      const result = mapQuizAnswerResult({
        state,
        // La RPC ne les renvoie pas ; on vérifie que même dans ce cas rien ne fuit.
        correct_answer: "a",
        is_correct: true,
        points_awarded: 10,
        elapsed_ms: 42,
        timed_out: true,
        player: { score: 10, correct_count: 1, total_elapsed_ms: 42 },
      });
      expect(result.correctAnswer).toBeNull();
      expect(result.isCorrect).toBeNull();
      expect(result.pointsAwarded).toBeNull();
      expect(result.elapsedMs).toBeNull();
      expect(result.timedOut).toBe(false);
      expect(result.player).toBeNull();
    }
  });

  it("jsonb non reconnu → unavailable neutre", () => {
    expect(mapQuizAnswerResult(null).state).toBe("unavailable");
    expect(mapQuizAnswerResult({ state: "nope" }).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// mapQuizFinish
// ────────────────────────────────────────────────────────────

describe("mapQuizFinish", () => {
  it("clôture avec lot émis (code de caisse)", () => {
    const result = mapQuizFinish({
      state: "finished",
      player: {
        id: "p1",
        score: 8,
        correct_count: 4,
        total_elapsed_ms: 15000,
        finished_at: "2026-08-03T10:10:00.000Z",
      },
      progression: { answered_count: 5, question_count: 5 },
      reward_mode: "threshold",
      reward_threshold: 3,
      pending_draw: false,
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
      emitted: true,
    });
    expect(result.state).toBe("finished");
    expect(result.emitted).toBe(true);
    expect(result.reward?.code).toBe("QUIZ-ABCD2345");
    expect(result.player?.score).toBe(8);
    expect(result.progression).toEqual({ answeredCount: 5, questionCount: 5 });
  });

  it("mode différé : pendingDraw, aucun lot encore émis", () => {
    const result = mapQuizFinish({
      state: "finished",
      player: { id: "p1" },
      reward_mode: "draw",
      pending_draw: true,
      reward: null,
      emitted: false,
    });
    expect(result.rewardMode).toBe("draw");
    expect(result.pendingDraw).toBe(true);
    expect(result.reward).toBeNull();
    expect(result.emitted).toBe(false);
  });

  it("already_finished : idempotent, jamais `emitted`", () => {
    const result = mapQuizFinish({
      state: "already_finished",
      player: { id: "p1", score: 3 },
      reward: { source: "instant", code: "QUIZ-ABCD2345" },
      emitted: true,
    });
    expect(result.state).toBe("already_finished");
    expect(result.emitted).toBe(false);
    expect(result.reward?.code).toBe("QUIZ-ABCD2345");
  });

  it("jsonb non reconnu → unavailable neutre", () => {
    const result = mapQuizFinish({ state: "???" });
    expect(result.state).toBe("unavailable");
    expect(result.player).toBeNull();
    expect(result.reward).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// mapQuizSpinGrant / mapQuizDraw
// ────────────────────────────────────────────────────────────

describe("mapQuizSpinGrant", () => {
  it("mappe un tirage produit", () => {
    const result = mapQuizSpinGrant({
      state: "spun",
      spin_id: "spin-1",
      wheel_id: WHEEL,
      prize_id: "prize-1",
      is_losing: false,
    });
    expect(result).toEqual({
      state: "spun",
      spinId: "spin-1",
      wheelId: WHEEL,
      prizeId: "prize-1",
      isLosing: false,
    });
  });

  it("état inconnu → unavailable", () => {
    expect(mapQuizSpinGrant({ state: "zzz" }).state).toBe("unavailable");
    expect(mapQuizSpinGrant(null).state).toBe("unavailable");
  });
});

describe("mapQuizDraw", () => {
  it("mappe un tirage effectué", () => {
    const result = mapQuizDraw({
      state: "drawn",
      mode: "ranking",
      winners: 3,
      out_of_stock: false,
    });
    expect(result).toEqual({
      state: "drawn",
      mode: "ranking",
      winners: 3,
      outOfStock: false,
      drawnAt: null,
    });
  });

  it("already_drawn conserve la date et ne réémet rien", () => {
    const result = mapQuizDraw({
      state: "already_drawn",
      drawn_at: "2026-08-04T09:00:00.000Z",
      winners: 2,
    });
    expect(result.state).toBe("already_drawn");
    expect(result.drawnAt).toBe("2026-08-04T09:00:00.000Z");
    expect(result.winners).toBe(2);
  });

  it("invalid_mode et jsonb inconnu", () => {
    expect(mapQuizDraw({ state: "invalid_mode" }).state).toBe("invalid_mode");
    expect(mapQuizDraw(undefined).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// mapQuizPublicState — INVARIANT #2 (défense en profondeur)
// ────────────────────────────────────────────────────────────

describe("mapQuizPublicState", () => {
  const state = {
    state: "ok",
    server_now: "2026-08-03T10:00:10.000Z",
    quiz: {
      id: QUIZ,
      name: "Quiz du terroir",
      theme: "culture",
      status: "active",
      intro_text: null,
      question_count: 2,
      reward_mode: "ranking",
      reward_threshold: null,
      draw_top_n: null,
      draw_state: "pending",
      reward_label: "Une bouteille",
      reward_details: null,
      reward_stock: 3,
      reward_claimed_count: 1,
    },
    questions: [
      {
        id: Q2,
        position: 1,
        question_type: "text",
        preset: "free_prediction",
        prompt: "Quel pays ?",
        options: null,
        status: "in_progress",
        started_at: "2026-08-03T10:00:00.000Z",
        time_limit_seconds: 30,
        // La RPC ne renvoie PAS ces champs pour une question non répondue : on
        // vérifie que même si elle le faisait, rien ne passerait.
        correct_answer: ["italie"],
        your_answer: "france",
        is_correct: true,
        points_awarded: 5,
        elapsed_ms: 9000,
        timed_out: true,
      },
      {
        id: Q1,
        position: 0,
        question_type: "choice",
        preset: "multiple_choice",
        prompt: "Le safran ?",
        options: [
          { id: "a", label: "Oui" },
          { id: "b", label: "Non" },
        ],
        status: "answered",
        correct_answer: "a",
        your_answer: "b",
        is_correct: false,
        points_awarded: 0,
        elapsed_ms: 4000,
        timed_out: false,
      },
    ],
    player: {
      id: "p1",
      first_name: "Marco",
      avatar: "renard",
      score: 0,
      correct_count: 0,
      total_elapsed_ms: 4000,
      finished_at: null,
    },
    progression: { answered_count: 1, question_count: 2 },
    reward: null,
  };

  it("mappe le quiz, le joueur et la progression", () => {
    const result = mapQuizPublicState(state);
    expect(result.state).toBe("ok");
    expect(result.serverNow).toBe("2026-08-03T10:00:10.000Z");
    expect(result.quiz?.rewardMode).toBe("ranking");
    expect(result.quiz?.rewardStock).toBe(3);
    expect(result.quiz?.drawState).toBe("pending");
    expect(result.player?.firstName).toBe("Marco");
    expect(result.progression).toEqual({ answeredCount: 1, questionCount: 2 });
  });

  it("ordonne les questions par position", () => {
    const result = mapQuizPublicState(state);
    expect(result.questions.map((q) => q.id)).toEqual([Q1, Q2]);
  });

  it("une question RÉPONDUE porte la vérité et l'issue du joueur", () => {
    const answered = mapQuizPublicState(state).questions.find((q) => q.id === Q1);
    expect(answered?.status).toBe("answered");
    expect(answered?.correctAnswer).toBe("a");
    expect(answered?.yourAnswer).toBe("b");
    expect(answered?.isCorrect).toBe(false);
    expect(answered?.pointsAwarded).toBe(0);
    expect(answered?.elapsedMs).toBe(4000);
  });

  it("NON-FUITE : une question NON répondue ne porte JAMAIS de bonne réponse", () => {
    const pending = mapQuizPublicState(state).questions.find((q) => q.id === Q2);
    expect(pending?.status).toBe("in_progress");
    expect(pending?.correctAnswer).toBeNull();
    expect(pending?.yourAnswer).toBeNull();
    expect(pending?.isCorrect).toBeNull();
    expect(pending?.pointsAwarded).toBeNull();
    expect(pending?.elapsedMs).toBeNull();
    expect(pending?.timedOut).toBe(false);
    // Le chronomètre déjà lancé reste affichable.
    expect(pending?.startedAt).toBe("2026-08-03T10:00:00.000Z");
  });

  it("NON-FUITE : idem pour un statut `pending` (jamais présentée)", () => {
    const result = mapQuizPublicState({
      ...state,
      questions: [
        {
          id: Q1,
          position: 0,
          question_type: "choice",
          status: "pending",
          correct_answer: "a",
          your_answer: "a",
          is_correct: true,
        },
      ],
    });
    const q = result.questions[0];
    expect(q.status).toBe("pending");
    expect(q.correctAnswer).toBeNull();
    expect(q.yourAnswer).toBeNull();
    expect(q.isCorrect).toBeNull();
  });

  it("state ≠ ok ou jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, {}, { state: "unavailable" }, { state: "ok" }]) {
      const result = mapQuizPublicState(raw);
      expect(result.state).toBe("unavailable");
      expect(result.quiz).toBeNull();
      expect(result.questions).toEqual([]);
      expect(result.player).toBeNull();
      expect(result.reward).toBeNull();
    }
  });

  it("sans identité cookie, aucune vue « moi »", () => {
    const result = mapQuizPublicState({ ...state, player: null, reward: null });
    expect(result.player).toBeNull();
    expect(result.reward).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// Classement (l'ordre fait foi en SQL, ceci est un repli d'affichage)
// ────────────────────────────────────────────────────────────

describe("classement", () => {
  it("ordonne par score décroissant puis temps croissant", () => {
    const entries = [
      { score: 5, totalElapsedMs: 9000 },
      { score: 8, totalElapsedMs: 12000 },
      { score: 8, totalElapsedMs: 7000 },
    ];
    expect([...entries].sort(compareQuizStandings)).toEqual([
      { score: 8, totalElapsedMs: 7000 },
      { score: 8, totalElapsedMs: 12000 },
      { score: 5, totalElapsedMs: 9000 },
    ]);
  });

  it("ex æquo partagés : le rang suivant saute (sémantique rank())", () => {
    const ranked = assignQuizRanks([
      { score: 8, totalElapsedMs: 7000 },
      { score: 8, totalElapsedMs: 7000 },
      { score: 5, totalElapsedMs: 1000 },
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("mapQuizLeaderboard conserve les rangs SQL et n'expose aucun email", () => {
    const rows = mapQuizLeaderboard([
      {
        player_id: "p1",
        first_name: "Marco",
        avatar: "renard",
        score: 8,
        correct_count: 4,
        total_elapsed_ms: 7000,
        finished_at: "2026-08-03T10:10:00.000Z",
        rank: 1,
        total_players: 12,
        email: "fuite@exemple.test",
      },
    ]);
    expect(rows[0].rank).toBe(1);
    expect(rows[0].totalPlayers).toBe(12);
    expect(JSON.stringify(rows)).not.toContain("fuite@exemple.test");
  });

  it("rang absent → dérivé localement (repli)", () => {
    const rows = mapQuizLeaderboard([
      { player_id: "p1", score: 3, total_elapsed_ms: 5000 },
      { player_id: "p2", score: 9, total_elapsed_ms: 5000 },
    ]);
    expect(rows.map((r) => [r.playerId, r.rank])).toEqual([
      ["p2", 1],
      ["p1", 2],
    ]);
  });

  it("entrée non objet ignorée", () => {
    expect(mapQuizLeaderboard([null, 3, "x"])).toEqual([]);
    expect(mapQuizLeaderboard(null)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// Chronomètre — AFFICHAGE SEUL
// ────────────────────────────────────────────────────────────

describe("chronomètre (affichage)", () => {
  it("temps restant dérivé des instants SERVEUR", () => {
    expect(
      quizTimeRemainingMs({
        serverNow: "2026-08-03T10:00:05.000Z",
        startedAt: "2026-08-03T10:00:00.000Z",
        timeLimitSeconds: 20,
      }),
    ).toBe(15000);
  });

  it("jamais négatif (la base tranche seule le hors-délai)", () => {
    expect(
      quizTimeRemainingMs({
        serverNow: "2026-08-03T10:01:00.000Z",
        startedAt: "2026-08-03T10:00:00.000Z",
        timeLimitSeconds: 20,
      }),
    ).toBe(0);
  });

  it("null sans chronomètre, sans présentation ou sur date illisible", () => {
    expect(
      quizTimeRemainingMs({
        serverNow: "2026-08-03T10:00:05.000Z",
        startedAt: "2026-08-03T10:00:00.000Z",
        timeLimitSeconds: null,
      }),
    ).toBeNull();
    expect(
      quizTimeRemainingMs({
        serverNow: "2026-08-03T10:00:05.000Z",
        startedAt: null,
        timeLimitSeconds: 20,
      }),
    ).toBeNull();
    expect(
      quizTimeRemainingMs({
        serverNow: "pas-une-date",
        startedAt: "2026-08-03T10:00:00.000Z",
        timeLimitSeconds: 20,
      }),
    ).toBeNull();
  });

  it("quizTimerView agrège limite, écoulé et expiration indicative", () => {
    expect(
      quizTimerView({
        serverNow: "2026-08-03T10:00:25.000Z",
        startedAt: "2026-08-03T10:00:00.000Z",
        timeLimitSeconds: 20,
      }),
    ).toEqual({ limitMs: 20000, elapsedMs: 25000, remainingMs: 0, expired: true });

    expect(
      quizTimerView({
        serverNow: null,
        startedAt: null,
        timeLimitSeconds: null,
      }),
    ).toEqual({ limitMs: null, elapsedMs: 0, remainingMs: null, expired: false });
  });
});

// ────────────────────────────────────────────────────────────
// Sérialisation des réponses / de la vérité
// ────────────────────────────────────────────────────────────

describe("sérialisation jsonb", () => {
  it("réponse joueur : chaîne, nombre, tableau d'ids, chaîne libre", () => {
    expect(quizAnswerToJson({ type: "choice", optionId: "a" })).toBe("a");
    expect(quizAnswerToJson({ type: "number", value: 12.5 })).toBe(12.5);
    expect(quizAnswerToJson({ type: "ranking", order: ["a", "b"] })).toEqual(["a", "b"]);
    expect(quizAnswerToJson({ type: "text", value: "Italie" })).toBe("Italie");
  });

  it("vérité : `text` est un TABLEAU de variantes acceptées", () => {
    expect(quizSolutionToJson({ type: "text", variants: ["Italie", "l'Italie"] })).toEqual([
      "Italie",
      "l'Italie",
    ]);
    expect(quizSolutionToJson({ type: "choice", optionId: "b" })).toBe("b");
  });

  it("normalizeQuizText réplique quiz_normalize_text (aperçu commerçant)", () => {
    expect(normalizeQuizText("L'Italie !")).toBe("l italie");
    expect(normalizeQuizText("  Crème Brûlée  ")).toBe("creme brulee");
    expect(normalizeQuizText("Château-Neuf")).toBe("chateau neuf");
    expect(normalizeQuizText("!!!")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// planQuizReorder
// ────────────────────────────────────────────────────────────

describe("planQuizReorder", () => {
  const questions = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("aucun mouvement si l'ordre est déjà celui demandé", () => {
    expect(planQuizReorder(questions, ["a", "b", "c"])).toEqual([]);
  });

  it("gare au-dessus du maximum puis redescend (aucune collision d'unicité)", () => {
    const moves = planQuizReorder(questions, ["c", "a", "b"]);
    expect(moves).not.toBeNull();
    // Application séquentielle : aucune position occupée deux fois en même temps.
    const positions = new Map(questions.map((q) => [q.id, q.position]));
    for (const move of moves!) {
      const taken = [...positions.entries()].filter(
        ([id, pos]) => id !== move.id && pos === move.position,
      );
      expect(taken).toEqual([]);
      positions.set(move.id, move.position);
    }
    expect([...positions.entries()].sort()).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 0],
    ]);
  });

  it("refuse un ordre incomplet, inconnu ou avec doublon", () => {
    expect(planQuizReorder(questions, ["a", "b"])).toBeNull();
    expect(planQuizReorder(questions, ["a", "b", "z"])).toBeNull();
    expect(planQuizReorder(questions, ["a", "a", "b"])).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// Validations — miroir de confort (la base reste l'autorité)
// ────────────────────────────────────────────────────────────

describe("quizAnswerInputSchema", () => {
  it("accepte les quatre formes valides", () => {
    expect(quizAnswerInputSchema.safeParse({ type: "choice", optionId: "a" }).success).toBe(true);
    expect(quizAnswerInputSchema.safeParse({ type: "number", value: "12.5" }).success).toBe(true);
    expect(
      quizAnswerInputSchema.safeParse({ type: "ranking", order: ["a", "b", "c"] }).success,
    ).toBe(true);
    expect(quizAnswerInputSchema.safeParse({ type: "text", value: "Italie" }).success).toBe(true);
  });

  it("ranking : identifiants DISTINCTS exigés", () => {
    const parsed = quizAnswerInputSchema.safeParse({ type: "ranking", order: ["a", "a"] });
    expect(parsed.success).toBe(false);
  });

  it("text : borné et non vide après normalisation", () => {
    expect(quizAnswerInputSchema.safeParse({ type: "text", value: "!!!" }).success).toBe(false);
    expect(
      quizAnswerInputSchema.safeParse({ type: "text", value: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("type inconnu ou champ manquant refusé", () => {
    expect(quizAnswerInputSchema.safeParse({ type: "score", home: 1 }).success).toBe(false);
    expect(quizAnswerInputSchema.safeParse({ type: "choice" }).success).toBe(false);
  });
});

describe("quizAnswerSchema (contre la question visée)", () => {
  const question = {
    questionType: "ranking" as const,
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ],
    rankingSize: 2,
  };

  it("exige exactement `rankingSize` éléments connus", () => {
    expect(quizAnswerSchema(question).safeParse({ type: "ranking", order: ["a", "b"] }).success).toBe(
      true,
    );
    expect(
      quizAnswerSchema(question).safeParse({ type: "ranking", order: ["a", "b", "c"] }).success,
    ).toBe(false);
    expect(
      quizAnswerSchema(question).safeParse({ type: "ranking", order: ["a", "z"] }).success,
    ).toBe(false);
  });

  it("refuse une réponse d'un autre type", () => {
    expect(quizAnswerSchema(question).safeParse({ type: "choice", optionId: "a" }).success).toBe(
      false,
    );
  });

  it("choice : l'option doit exister", () => {
    const choice = {
      questionType: "choice" as const,
      options: [{ id: "a", label: "A" }],
      rankingSize: null,
    };
    expect(quizAnswerSchema(choice).safeParse({ type: "choice", optionId: "a" }).success).toBe(true);
    expect(quizAnswerSchema(choice).safeParse({ type: "choice", optionId: "b" }).success).toBe(
      false,
    );
  });
});

describe("createQuizQuestionSchema", () => {
  const base = {
    quiz_id: QUIZ,
    prompt: "Le safran vient-il d'un crocus ?",
    preset: "true_false",
    image_url: "",
    time_limit_seconds: "",
    points: 1,
    tolerance: "",
    ranking_size: "",
  };

  it("choice : options + vérité parmi les options", () => {
    const parsed = createQuizQuestionSchema.safeParse({
      ...base,
      question_type: "choice",
      options: [
        { id: "a", label: "Oui" },
        { id: "b", label: "Non" },
      ],
      correct_answer: { type: "choice", optionId: "a" },
    });
    expect(parsed.success).toBe(true);
  });

  it("choice : vérité hors options refusée", () => {
    const parsed = createQuizQuestionSchema.safeParse({
      ...base,
      question_type: "choice",
      options: [
        { id: "a", label: "Oui" },
        { id: "b", label: "Non" },
      ],
      correct_answer: { type: "choice", optionId: "z" },
    });
    expect(parsed.success).toBe(false);
  });

  it("choice : moins de 2 options refusé, doublon d'identifiant refusé", () => {
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "choice",
        options: [{ id: "a", label: "Oui" }],
        correct_answer: { type: "choice", optionId: "a" },
      }).success,
    ).toBe(false);
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "choice",
        options: [
          { id: "a", label: "Oui" },
          { id: "a", label: "Non" },
        ],
        correct_answer: { type: "choice", optionId: "a" },
      }).success,
    ).toBe(false);
  });

  it("ranking : top N borné par le nombre d'options, ordre officiel distinct", () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "ranking",
        preset: "ranking",
        options,
        ranking_size: 3,
        correct_answer: { type: "ranking", order: ["c", "a", "b"] },
      }).success,
    ).toBe(true);
    // top N > nombre d'options
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "ranking",
        options,
        ranking_size: 4,
        correct_answer: { type: "ranking", order: ["a", "b", "c"] },
      }).success,
    ).toBe(false);
    // ordre officiel de mauvaise longueur
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "ranking",
        options,
        ranking_size: 3,
        correct_answer: { type: "ranking", order: ["a", "b"] },
      }).success,
    ).toBe(false);
    // doublon dans l'ordre officiel
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "ranking",
        options,
        ranking_size: 2,
        correct_answer: { type: "ranking", order: ["a", "a"] },
      }).success,
    ).toBe(false);
  });

  it("number : aucune option, tolérance facultative", () => {
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "number",
        preset: "estimate",
        options: [],
        tolerance: 5,
        correct_answer: { type: "number", value: 42 },
      }).success,
    ).toBe(true);
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "number",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        correct_answer: { type: "number", value: 42 },
      }).success,
    ).toBe(false);
  });

  it("text : variantes acceptées 1..10, pas d'option ni de tolérance", () => {
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "text",
        preset: "free_prediction",
        options: [],
        correct_answer: { type: "text", variants: ["Italie", "l'Italie"] },
      }).success,
    ).toBe(true);
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "text",
        options: [],
        tolerance: 3,
        correct_answer: { type: "text", variants: ["Italie"] },
      }).success,
    ).toBe(false);
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "text",
        options: [],
        correct_answer: { type: "text", variants: ["!!!"] },
      }).success,
    ).toBe(false);
  });

  it("vérité d'un autre type que la question : refusée", () => {
    expect(
      createQuizQuestionSchema.safeParse({
        ...base,
        question_type: "text",
        options: [],
        correct_answer: { type: "number", value: 1 },
      }).success,
    ).toBe(false);
  });

  it("chronomètre : 5..600 s, '' = aucun", () => {
    const shape = {
      ...base,
      question_type: "text" as const,
      options: [],
      correct_answer: { type: "text" as const, variants: ["Italie"] },
    };
    expect(createQuizQuestionSchema.safeParse({ ...shape, time_limit_seconds: 30 }).success).toBe(
      true,
    );
    expect(createQuizQuestionSchema.safeParse({ ...shape, time_limit_seconds: 2 }).success).toBe(
      false,
    );
    expect(createQuizQuestionSchema.safeParse({ ...shape, time_limit_seconds: 601 }).success).toBe(
      false,
    );
    const none = createQuizQuestionSchema.safeParse({ ...shape, time_limit_seconds: "" });
    expect(none.success && none.data.time_limit_seconds).toBeNull();
  });

  it("preset libre de forme (un 8e modèle ne demande aucune migration)", () => {
    const shape = {
      ...base,
      question_type: "text" as const,
      options: [],
      correct_answer: { type: "text" as const, variants: ["Italie"] },
    };
    expect(createQuizQuestionSchema.safeParse({ ...shape, preset: "audio_blind" }).success).toBe(
      true,
    );
    expect(createQuizQuestionSchema.safeParse({ ...shape, preset: "Bad Preset" }).success).toBe(
      false,
    );
  });

  it("image mystère : URL http(s) bornée, '' = aucune", () => {
    const shape = {
      ...base,
      question_type: "text" as const,
      options: [],
      correct_answer: { type: "text" as const, variants: ["Italie"] },
    };
    expect(
      createQuizQuestionSchema.safeParse({
        ...shape,
        preset: "mystery_image",
        image_url: "https://exemple.test/a.jpg",
      }).success,
    ).toBe(true);
    expect(
      createQuizQuestionSchema.safeParse({
        ...shape,
        image_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });
});

describe("updateQuizRewardSchema", () => {
  const base = {
    id: QUIZ,
    reward_threshold: "",
    draw_top_n: "",
    reward_label: "",
    reward_details: "",
    reward_stock: "",
    target_wheel_id: "",
  };

  it("threshold exige un seuil, draw exige un vivier", () => {
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "threshold",
        reward_threshold: 3,
        reward_label: "Un café",
        reward_stock: 10,
      }).success,
    ).toBe(true);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "threshold",
        reward_label: "Un café",
        reward_stock: 10,
      }).success,
    ).toBe(false);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "draw",
        draw_top_n: 20,
        reward_label: "Une bouteille",
        reward_stock: 3,
      }).success,
    ).toBe(true);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "draw",
        reward_label: "Une bouteille",
        reward_stock: 3,
      }).success,
    ).toBe(false);
  });

  it("champ d'un autre mode refusé (miroir du CHECK par mode)", () => {
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "instant",
        reward_threshold: 3,
        reward_label: "Un café",
        reward_stock: 5,
      }).success,
    ).toBe(false);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "ranking",
        draw_top_n: 5,
        reward_label: "Un café",
        reward_stock: 5,
      }).success,
    ).toBe(false);
  });

  it("`none` : rien à provisionner", () => {
    expect(updateQuizRewardSchema.safeParse({ ...base, reward_mode: "none" }).success).toBe(true);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "none",
        reward_stock: 5,
      }).success,
    ).toBe(false);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "none",
        reward_label: "Un café",
      }).success,
    ).toBe(false);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "none",
        target_wheel_id: WHEEL,
      }).success,
    ).toBe(false);
  });

  it("mode qui émet : libellé exigé sauf tour de roue offert", () => {
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "instant",
        reward_stock: 5,
      }).success,
    ).toBe(false);
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "instant",
        reward_stock: 5,
        target_wheel_id: WHEEL,
      }).success,
    ).toBe(true);
  });

  it("tour de roue offert INTERDIT sur un mode différé (émission tardive)", () => {
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "ranking",
        reward_stock: 3,
        target_wheel_id: WHEEL,
      }).success,
    ).toBe(false);
  });

  it("stock négatif refusé, '' → 0", () => {
    expect(
      updateQuizRewardSchema.safeParse({
        ...base,
        reward_mode: "instant",
        reward_label: "Un café",
        reward_stock: -1,
      }).success,
    ).toBe(false);
    const parsed = updateQuizRewardSchema.safeParse({ ...base, reward_mode: "none" });
    expect(parsed.success && parsed.data.reward_stock).toBe(0);
  });
});

describe("schémas du parcours public", () => {
  it("joinQuizSchema : PII facultative, opt-in par défaut faux", () => {
    const parsed = joinQuizSchema.safeParse({
      slug: "quiz-terroir",
      firstName: "",
      email: "",
      avatar: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.firstName).toBeUndefined();
      expect(parsed.data.email).toBeUndefined();
      expect(parsed.data.avatar).toBeUndefined();
      expect(parsed.data.marketingOptIn).toBe(false);
    }
  });

  it("joinQuizSchema : slug ou UUID, email normalisé", () => {
    expect(joinQuizSchema.safeParse({ slug: QUIZ }).success).toBe(true);
    expect(joinQuizSchema.safeParse({ slug: "ab" }).success).toBe(false);
    const parsed = joinQuizSchema.safeParse({
      slug: "quiz-terroir",
      email: "  MARCO@Exemple.test ",
      marketingOptIn: true,
    });
    expect(parsed.success && parsed.data.email).toBe("marco@exemple.test");
  });

  it("reorderQuizQuestionsSchema exige des UUID", () => {
    expect(reorderQuizQuestionsSchema.safeParse({ quiz_id: QUIZ, order: [Q1, Q2] }).success).toBe(
      true,
    );
    expect(reorderQuizQuestionsSchema.safeParse({ quiz_id: QUIZ, order: ["a"] }).success).toBe(
      false,
    );
  });
});

// ────────────────────────────────────────────────────────────
// Caisse — 8e préfixe QUIZ-…
// ────────────────────────────────────────────────────────────

describe("normalizeQuizCode / quizRedeemCodeSchema", () => {
  it("normalise les saisies de caisse", () => {
    expect(normalizeQuizCode("quiz abcd2345")).toBe("QUIZ-ABCD2345");
    expect(normalizeQuizCode("QUIZ-ABCD2345")).toBe("QUIZ-ABCD2345");
    expect(normalizeQuizCode("abcd2345")).toBe("QUIZ-ABCD2345");
    expect(normalizeQuizCode("  quiz_abcd2345 ")).toBe("QUIZ-ABCD2345");
  });

  it("STRICT : rejette les 7 autres préfixes (autorité du préfixe en caisse)", () => {
    for (const code of [
      "GAIN-ABCD2345",
      "CHASSE-ABCD2345",
      "FIDELITE-ABCD2345",
      "JACKPOT-ABCD2345",
      "EVENT-ABCD2345",
      "CADEAU-ABCD2345",
      "PARRAIN-ABCD2345",
    ]) {
      expect(normalizeQuizCode(code)).toBe("");
    }
  });

  it("rejette une forme invalide (alphabet sans I/O/0/1)", () => {
    expect(normalizeQuizCode("quiz abcd234")).toBe("");
    expect(normalizeQuizCode("quiz ABCD2I45")).toBe("");
    expect(normalizeQuizCode("")).toBe("");
  });

  it("quizRedeemCodeSchema accepte la forme canonique, casse tolérée", () => {
    expect(quizRedeemCodeSchema.safeParse(" quiz-abcd2345 ").success).toBe(true);
    expect(quizRedeemCodeSchema.safeParse("CADEAU-ABCD2345").success).toBe(false);
    expect(quizRedeemCodeSchema.safeParse("QUIZ-ABCD2I45").success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// ADR-032 — AUCUN failClosed sur une clé PARTAGÉE (garde de conception)
// ────────────────────────────────────────────────────────────

describe("ADR-032 — contrôle d'abus du parcours public quiz", () => {
  const source = readFileSync(new URL("../actions/quiz.ts", import.meta.url), "utf8");
  // Espaces normalisés : robuste au formatage (retours à la ligne de Prettier).
  const flat = source.replace(/\s+/g, " ");

  it("la clé PARTAGÉE (IP) passe par observeSharedKey (fail-OPEN), jamais par un refus", () => {
    expect(flat).toMatch(/observeSharedKey\(\s*rateLimitBucket\(\s*"quiz:public:ip"/);
  });

  it("la clé IP partagée n'est JAMAIS remise à un rateLimit failClosed", () => {
    // Aucune occurrence de "quiz:public:ip" suivie d'un failClosed (interrupteur interdit).
    expect(/"quiz:public:ip"[^;]*failClosed/.test(flat)).toBe(false);
  });

  it("le failClosed n'est employé QUE sur la clé d'IDENTITÉ (quiz:player)", () => {
    expect(flat).toMatch(/"quiz:player"[^;]*failClosed:\s*true/);
    const failClosedCount = (flat.match(/failClosed:\s*true/g) ?? []).length;
    const playerFailClosed = (flat.match(/"quiz:player"[\s\S]*?failClosed:\s*true/g) ?? []).length;
    expect(failClosedCount).toBeGreaterThan(0);
    expect(playerFailClosed).toBe(failClosedCount);
  });

  it("aucun seau n'est consommé avant la résolution de l'identité", () => {
    // resolveQuizIdentity (cookie) précède systématiquement allowQuizPlayerAction.
    const order = [...flat.matchAll(/resolveQuizIdentity|allowQuizPlayerAction/g)].map(
      (m) => m[0],
    );
    // La première occurrence est la définition de resolveQuizIdentity ; chaque
    // appel d'allowQuizPlayerAction est précédé d'une résolution d'identité.
    let identityKnown = false;
    for (const token of order) {
      if (token === "resolveQuizIdentity") identityKnown = true;
      else expect(identityKnown).toBe(true);
    }
  });

  it("le chronomètre et la justesse ne sont jamais recalculés côté Node", () => {
    // Aucun paramètre de temps ni de score n'est envoyé aux RPC du parcours.
    expect(/p_elapsed|p_now|p_started_at|p_score|p_is_correct/.test(flat)).toBe(false);
  });
});
