import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mapEventJoin,
  mapEventPublicState,
  mapEventSubmit,
  mapEventTransition,
} from "./event";
import { normalizeEventCode, normalizeJackpotCode } from "./utils";

const UUID = "00000000-0000-4000-8000-000000000001";
const OPT_A = "00000000-0000-4000-8000-0000000000a1";
const OPT_B = "00000000-0000-4000-8000-0000000000b2";

// ────────────────────────────────────────────────────────────
// mapEventJoin
// ────────────────────────────────────────────────────────────

describe("mapEventJoin", () => {
  it("mappe un join réussi (player + session)", () => {
    const r = mapEventJoin({
      state: "joined",
      player: { id: UUID, pseudo: "Zoé", avatar: "renard", score: 0 },
      session: { id: UUID, status: "live", phase: "question_active" },
    });
    expect(r.state).toBe("joined");
    expect(r.player).toEqual({ id: UUID, pseudo: "Zoé", avatar: "renard", score: 0 });
    expect(r.session).toEqual({ id: UUID, status: "live", phase: "question_active" });
  });

  it("invalid_pseudo / unavailable : pas de player/session", () => {
    for (const state of ["invalid_pseudo", "unavailable"] as const) {
      const r = mapEventJoin({ state, player: { id: UUID }, session: { id: UUID } });
      expect(r.state).toBe(state);
      expect(r.player).toBeNull();
      expect(r.session).toBeNull();
    }
  });

  it("jsonb non reconnu → unavailable neutre", () => {
    for (const raw of [null, undefined, 42, "x", {}, { state: "bogus" }]) {
      expect(mapEventJoin(raw).state).toBe("unavailable");
    }
  });
});

// ────────────────────────────────────────────────────────────
// mapEventSubmit — JAMAIS de justesse
// ────────────────────────────────────────────────────────────

describe("mapEventSubmit", () => {
  it("mappe les états connus sans jamais exposer de justesse", () => {
    for (const state of [
      "recorded",
      "locked",
      "not_joined",
      "invalid_option",
      "already_answered",
      "unavailable",
    ] as const) {
      const r = mapEventSubmit({ state });
      expect(r).toEqual({ state });
      // Défense en profondeur : la forme du résultat n'a QUE `state`.
      expect(Object.keys(r)).toEqual(["state"]);
    }
  });

  it("ignore tout champ de justesse qui aurait fuité dans le jsonb", () => {
    const r = mapEventSubmit({
      state: "recorded",
      is_correct: true,
      points_awarded: 1500,
      correct_option_id: OPT_A,
    });
    expect(JSON.stringify(r)).not.toContain("is_correct");
    expect(JSON.stringify(r)).not.toContain("points_awarded");
    expect(JSON.stringify(r)).not.toContain("correct_option_id");
  });

  it("jsonb non reconnu → unavailable", () => {
    expect(mapEventSubmit({ state: "bogus" }).state).toBe("unavailable");
    expect(mapEventSubmit(null).state).toBe("unavailable");
  });
});

// ────────────────────────────────────────────────────────────
// mapEventPublicState — cœur de la sécurité (invariant #1)
// ────────────────────────────────────────────────────────────

describe("mapEventPublicState", () => {
  const sessionJson = {
    id: UUID,
    status: "live",
    phase: "question_active",
    join_code: "ABC234",
    reward_label: "Une tournée",
    reward_stock: 3,
    reward_claimed_count: 0,
  };
  const questionJson = {
    id: UUID,
    question_type: "quiz",
    prompt: "Capitale de l'Italie ?",
    time_limit_seconds: 20,
    started_at: "2026-07-27T20:00:00.000Z",
    // Le jsonb inclut MALICIEUSEMENT is_correct sur les options : le mapping ne
    // doit jamais le propager (invariant #1).
    options: [
      { id: OPT_A, label: "Rome", position: 0, is_correct: true },
      { id: OPT_B, label: "Milan", position: 1, is_correct: false },
    ],
  };

  it("mappe un état question_active sans AUCUNE correction", () => {
    const r = mapEventPublicState({
      state: "ok",
      session: sessionJson,
      question: questionJson,
      // Même si la RPC renvoyait par erreur la bonne réponse hors reveal, le
      // mapping l'écrase (défense en profondeur).
      correct_option_id: OPT_A,
      distribution: null,
      leaderboard: [],
      you: null,
    });
    expect(r.state).toBe("ok");
    // La bonne réponse N'EST PAS exposée hors reveal.
    expect(r.correctOptionId).toBeNull();
    // La distribution est masquée avant lock.
    expect(r.distribution).toBeNull();
    // Les options ne portent QUE id/label/position — is_correct n'est pas lu.
    expect(r.question?.options[0]).toEqual({ id: OPT_A, label: "Rome", position: 0 });
    expect(Object.keys(r.question!.options[0])).toEqual(["id", "label", "position"]);
    // Aucune trace de is_correct dans le payload sérialisé (preuve anti-fuite).
    expect(JSON.stringify(r)).not.toContain("is_correct");
  });

  it("PREUVE : la bonne réponse ne fuit dans AUCUNE phase non-reveal", () => {
    for (const phase of [
      "lobby",
      "question_active",
      "question_locked",
      "leaderboard",
    ] as const) {
      const r = mapEventPublicState({
        state: "ok",
        session: { ...sessionJson, phase },
        question: questionJson,
        correct_option_id: OPT_A, // fuite volontaire côté RPC
        distribution: null,
        leaderboard: [],
        you: null,
      });
      expect(r.correctOptionId).toBeNull();
    }
  });

  it("révèle la bonne réponse UNIQUEMENT en phase reveal", () => {
    const r = mapEventPublicState({
      state: "ok",
      session: { ...sessionJson, phase: "reveal" },
      question: questionJson,
      correct_option_id: OPT_A,
      distribution: [
        { option_id: OPT_A, label: "Rome", position: 0, votes: 12 },
        { option_id: OPT_B, label: "Milan", position: 1, votes: 3 },
      ],
      leaderboard: [{ pseudo: "Zoé", avatar: "renard", score: 1500, rank: 1 }],
      you: { pseudo: "Zoé", avatar: "renard", score: 1500, rank: 1, win: null },
    });
    expect(r.correctOptionId).toBe(OPT_A);
    expect(r.distribution).toHaveLength(2);
    expect(r.distribution?.[0]).toEqual({
      optionId: OPT_A,
      label: "Rome",
      position: 0,
      votes: 12,
    });
    expect(r.leaderboard[0]).toEqual({
      pseudo: "Zoé",
      avatar: "renard",
      score: 1500,
      rank: 1,
    });
  });

  it("mappe la vue « moi » avec le code du podium (jamais celui d'un autre)", () => {
    const r = mapEventPublicState({
      state: "ok",
      session: { ...sessionJson, phase: "ended", status: "ended" },
      question: null,
      correct_option_id: null,
      distribution: null,
      leaderboard: [],
      you: {
        pseudo: "Zoé",
        avatar: "renard",
        score: 4200,
        rank: 1,
        win: { rank: 1, code: "EVENT-ABCD2345" },
      },
    });
    expect(r.you?.win).toEqual({ rank: 1, code: "EVENT-ABCD2345" });
    expect(r.you?.score).toBe(4200);
  });

  it("state ≠ ok / session absente → unavailable neutre", () => {
    for (const raw of [
      null,
      { state: "unavailable" },
      { state: "ok" },
      { state: "ok", session: null },
    ]) {
      const r = mapEventPublicState(raw);
      expect(r.state).toBe("unavailable");
      expect(r.session).toBeNull();
      expect(r.correctOptionId).toBeNull();
      expect(r.leaderboard).toEqual([]);
    }
  });
});

// ────────────────────────────────────────────────────────────
// mapEventTransition
// ────────────────────────────────────────────────────────────

describe("mapEventTransition", () => {
  it("mappe les états connus", () => {
    for (const state of [
      "ok",
      "invalid_transition",
      "unknown_question",
      "already_played",
      "missing_correct_option",
    ] as const) {
      expect(mapEventTransition({ state }).state).toBe(state);
    }
  });

  it("état inconnu / jsonb invalide → invalid_transition (échec propre)", () => {
    expect(mapEventTransition({ state: "bogus" }).state).toBe("invalid_transition");
    expect(mapEventTransition(null).state).toBe("invalid_transition");
  });
});

// ────────────────────────────────────────────────────────────
// normalizeEventCode — routage caisse (préfixe distinct EVENT-)
// ────────────────────────────────────────────────────────────

describe("normalizeEventCode", () => {
  it("normalise une saisie tolérante vers EVENT-XXXXXXXX", () => {
    for (const raw of ["event abcd2345", "  EVENT-abcd2345 ", "eventabcd2345", "ABCD2345"]) {
      expect(normalizeEventCode(raw)).toBe("EVENT-ABCD2345");
    }
  });

  it("rejette les codes d'autres familles et les formes invalides", () => {
    expect(normalizeEventCode("GAIN-ABCD2345")).toBe("");
    expect(normalizeEventCode("CHASSE-ABCD2345")).toBe("");
    expect(normalizeEventCode("FIDELITE-ABCD2345")).toBe("");
    expect(normalizeEventCode("JACKPOT-ABCD2345")).toBe("");
    // Alphabet exclut I/O/0/1 et exige 8 caractères.
    expect(normalizeEventCode("EVENT-ABCI2345")).toBe("");
    expect(normalizeEventCode("EVENT-ABCD234")).toBe("");
    expect(normalizeEventCode("")).toBe("");
  });

  it("non-régression : les autres familles rejettent un code EVENT-", () => {
    expect(normalizeJackpotCode("EVENT-ABCD2345")).toBe("");
  });
});

// ────────────────────────────────────────────────────────────
// ADR-032 — aucun failClosed sur une clé PARTAGÉE (garde statique)
// ────────────────────────────────────────────────────────────

describe("ADR-032 — clés partagées jamais fail-closed (actions/events.ts)", () => {
  const src = readFileSync(
    fileURLToPath(new URL("../actions/events.ts", import.meta.url)),
    "utf8",
  );

  it("la clé partagée event:public:ip ne passe QUE par observeSharedKey", () => {
    // Le seul usage de la clé partagée est dans observeEventPressure.
    expect(src).toContain("observeSharedKey");
    // Elle n'est jamais associée à un failClosed dans une fenêtre proche.
    expect(/event:public:ip[\s\S]{0,300}failClosed/.test(src)).toBe(false);
  });

  it("failClosed n'est employé qu'avec des clés d'identité/opérateur", () => {
    // Chaque `failClosed: true` doit être précédé (fenêtre proche) d'une clé
    // propre à un porteur (event:player) ou à un opérateur (event:remote).
    const matches = src.match(/rateLimitBucket\("event:[^"]+"[\s\S]{0,200}?failClosed: true/g) ?? [];
    for (const m of matches) {
      expect(/event:player|event:remote/.test(m)).toBe(true);
    }
    // Et il existe bien au moins un seau d'identité fail-closed (sinon le test
    // ci-dessus passerait à vide).
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
