import { describe, expect, it } from "vitest";
import {
  createEventGameSchema,
  createEventQuestionSchema,
  createEventSessionSchema,
  eventJoinCodeSchema,
  eventRedeemCodeSchema,
  joinEventSchema,
  revealEventQuestionSchema,
  submitEventAnswerSchema,
} from "./events";

const UUID = "00000000-0000-4000-8000-000000000001";
const OPT_A = "00000000-0000-4000-8000-0000000000a1";

describe("eventJoinCodeSchema", () => {
  it("accepte 6 caractères de l'alphabet sans ambiguïté (casse/espaces tolérés)", () => {
    expect(eventJoinCodeSchema.safeParse("ABC234").success).toBe(true);
    const ok = eventJoinCodeSchema.safeParse("  abc234 ");
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toBe("ABC234");
  });

  it("rejette I/O/0/1 et les longueurs incorrectes", () => {
    expect(eventJoinCodeSchema.safeParse("ABCI23").success).toBe(false); // I interdit
    expect(eventJoinCodeSchema.safeParse("ABO234").success).toBe(false); // O interdit
    expect(eventJoinCodeSchema.safeParse("ABC23").success).toBe(false); // trop court
    expect(eventJoinCodeSchema.safeParse("ABC2345").success).toBe(false); // trop long
  });
});

describe("joinEventSchema", () => {
  it("pseudo 1..24, avatar catalogue, join_code valide", () => {
    const ok = joinEventSchema.safeParse({
      joinCode: "ABC234",
      pseudo: "  Zoé  ",
      avatar: "renard",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.pseudo).toBe("Zoé");
  });

  it("rejette un pseudo vide ou trop long", () => {
    expect(
      joinEventSchema.safeParse({ joinCode: "ABC234", pseudo: "", avatar: "" }).success,
    ).toBe(false);
    expect(
      joinEventSchema.safeParse({
        joinCode: "ABC234",
        pseudo: "x".repeat(25),
        avatar: "",
      }).success,
    ).toBe(false);
  });

  it("rejette un avatar hors catalogue, accepte le vide", () => {
    expect(
      joinEventSchema.safeParse({ joinCode: "ABC234", pseudo: "Zoé", avatar: "dragon" }).success,
    ).toBe(false);
    expect(
      joinEventSchema.safeParse({ joinCode: "ABC234", pseudo: "Zoé", avatar: "" }).success,
    ).toBe(true);
  });
});

describe("submitEventAnswerSchema", () => {
  it("exige trois UUID", () => {
    expect(
      submitEventAnswerSchema.safeParse({
        sessionId: UUID,
        questionId: UUID,
        optionId: OPT_A,
      }).success,
    ).toBe(true);
    expect(
      submitEventAnswerSchema.safeParse({ sessionId: "x", questionId: UUID, optionId: OPT_A })
        .success,
    ).toBe(false);
  });
});

describe("revealEventQuestionSchema", () => {
  it("correctOptionId optionnel ('' → undefined pour quiz/poll)", () => {
    const empty = revealEventQuestionSchema.safeParse({ sessionId: UUID, correctOptionId: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.correctOptionId).toBeUndefined();
    const absent = revealEventQuestionSchema.safeParse({ sessionId: UUID });
    expect(absent.success).toBe(true);
    if (absent.success) expect(absent.data.correctOptionId).toBeUndefined();
  });

  it("accepte un UUID d'option (prono), rejette une valeur non-UUID", () => {
    expect(
      revealEventQuestionSchema.safeParse({ sessionId: UUID, correctOptionId: OPT_A }).success,
    ).toBe(true);
    expect(
      revealEventQuestionSchema.safeParse({ sessionId: UUID, correctOptionId: "nope" }).success,
    ).toBe(false);
  });
});

describe("createEventGameSchema", () => {
  it("nom 1..120", () => {
    expect(createEventGameSchema.safeParse({ name: "" }).success).toBe(false);
    expect(createEventGameSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
    const ok = createEventGameSchema.safeParse({ name: "  Quiz du vendredi  " });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.name).toBe("Quiz du vendredi");
  });
});

describe("createEventQuestionSchema — cohérence type ↔ corrections", () => {
  const base = {
    game_id: UUID,
    prompt: "Capitale de l'Italie ?",
    time_limit_seconds: 20,
    points_base: 1000,
  };

  it("quiz : exactement une bonne réponse", () => {
    expect(
      createEventQuestionSchema.safeParse({
        ...base,
        question_type: "quiz",
        options: [
          { label: "Rome", is_correct: true },
          { label: "Milan", is_correct: false },
        ],
      }).success,
    ).toBe(true);
    // Aucune bonne réponse → refusé.
    expect(
      createEventQuestionSchema.safeParse({
        ...base,
        question_type: "quiz",
        options: [
          { label: "Rome", is_correct: false },
          { label: "Milan", is_correct: false },
        ],
      }).success,
    ).toBe(false);
    // Deux bonnes réponses → refusé.
    expect(
      createEventQuestionSchema.safeParse({
        ...base,
        question_type: "quiz",
        options: [
          { label: "Rome", is_correct: true },
          { label: "Milan", is_correct: true },
        ],
      }).success,
    ).toBe(false);
  });

  it("poll / prono : aucune bonne réponse à l'avance", () => {
    for (const question_type of ["poll", "prono"] as const) {
      expect(
        createEventQuestionSchema.safeParse({
          ...base,
          question_type,
          options: [
            { label: "A", is_correct: false },
            { label: "B", is_correct: false },
          ],
        }).success,
      ).toBe(true);
      expect(
        createEventQuestionSchema.safeParse({
          ...base,
          question_type,
          options: [
            { label: "A", is_correct: true },
            { label: "B", is_correct: false },
          ],
        }).success,
      ).toBe(false);
    }
  });

  it("exige au moins deux options", () => {
    expect(
      createEventQuestionSchema.safeParse({
        ...base,
        question_type: "poll",
        options: [{ label: "A", is_correct: false }],
      }).success,
    ).toBe(false);
  });

  it("time_limit 5..300, points_base 0..100000, prompt 1..500", () => {
    const quiz = (o: Record<string, unknown>) =>
      createEventQuestionSchema.safeParse({
        ...base,
        question_type: "quiz",
        options: [
          { label: "Rome", is_correct: true },
          { label: "Milan", is_correct: false },
        ],
        ...o,
      });
    expect(quiz({ time_limit_seconds: 4 }).success).toBe(false);
    expect(quiz({ time_limit_seconds: 301 }).success).toBe(false);
    expect(quiz({ time_limit_seconds: 5 }).success).toBe(true);
    expect(quiz({ points_base: -1 }).success).toBe(false);
    expect(quiz({ points_base: 100_001 }).success).toBe(false);
    expect(quiz({ points_base: 0 }).success).toBe(true);
    expect(quiz({ prompt: "" }).success).toBe(false);
    expect(quiz({ prompt: "x".repeat(501) }).success).toBe(false);
  });
});

describe("createEventSessionSchema", () => {
  it("stock FINI : '' → 0 (podium seul), borné", () => {
    const ok = createEventSessionSchema.safeParse({ game_id: UUID, reward_stock: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.reward_stock).toBe(0);
    expect(
      createEventSessionSchema.safeParse({ game_id: UUID, reward_stock: "-1" }).success,
    ).toBe(false);
    const three = createEventSessionSchema.safeParse({ game_id: UUID, reward_stock: "3" });
    expect(three.success).toBe(true);
    if (three.success) expect(three.data.reward_stock).toBe(3);
  });

  it("label / reward_label bornés", () => {
    expect(
      createEventSessionSchema.safeParse({ game_id: UUID, label: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      createEventSessionSchema.safeParse({ game_id: UUID, reward_label: "x".repeat(121) }).success,
    ).toBe(false);
  });
});

describe("eventRedeemCodeSchema", () => {
  it("EVENT-XXXXXXXX, casse tolérée, autres familles rejetées", () => {
    expect(eventRedeemCodeSchema.safeParse("event-abcd2345").success).toBe(true);
    expect(eventRedeemCodeSchema.safeParse("  EVENT-ABCD2345 ").success).toBe(true);
    expect(eventRedeemCodeSchema.safeParse("JACKPOT-ABCD2345").success).toBe(false);
    expect(eventRedeemCodeSchema.safeParse("EVENT-ABCI2345").success).toBe(false); // I interdit
  });
});
