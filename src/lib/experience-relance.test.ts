import { describe, expect, it } from "vitest";

import {
  KINDS_RELANCE,
  etatSourceRelance,
  serialiserRelance,
  type SourceRelance,
} from "./experience-relance";
import {
  calendarBlueprintSchema,
  eventBlueprintSchema,
  huntBlueprintSchema,
  loyaltyBlueprintSchema,
  pronosticsBlueprintSchema,
  quizBlueprintSchema,
} from "@/platform/experiences/templates/schemas";

const MAINTENANT = new Date("2026-08-06T12:00:00Z");

// ── Sources d'exemple, une par kind ──────────────────────────

const QUIZ: SourceRelance = {
  kind: "quiz",
  name: "Quiz de Noël",
  theme: "gourmand",
  intro_text: "Cinq questions, un panier garni.",
  reward_label: "Panier garni",
  reward_details: "À retirer en boutique",
  reward_stock: 3,
  questions: [
    {
      position: 1,
      question_type: "choice",
      prompt: "Quelle épice dans le pain d'épices ?",
      // Identifiants en MAJUSCULES, comme le builder du dépôt les écrit.
      options: [
        { id: "A", label: "Cannelle" },
        { id: "B", label: "Paprika" },
      ],
      correct_answer: "A",
      preset: "multiple_choice",
      time_limit_seconds: 30,
      points: 2,
    },
    {
      position: 0,
      question_type: "choice",
      prompt: "Combien de bougies sur la couronne ?",
      options: [
        { id: "X", label: "Deux" },
        { id: "Y", label: "Quatre" },
      ],
      correct_answer: "Y",
      preset: "multiple_choice",
      time_limit_seconds: null,
      points: 1,
    },
  ],
};

const HUNT: SourceRelance = {
  kind: "hunt",
  name: "Chasse du centre-ville",
  order_mode: "ordered",
  min_scan_interval_seconds: 120,
  reward_label: "Bon d'achat",
  reward_details: null,
  reward_stock: null,
  steps: [
    { position: 2, label: "La fontaine", hint_text: "Face à la mairie" },
    { position: 1, label: "La boulangerie", hint_text: null },
  ],
};

const CALENDAR: SourceRelance = {
  kind: "calendar",
  name: "Avent 2025",
  theme: "noel",
  merchant_content: "Ouvert tous les jours",
  completion_reward_label: "Coffret",
  completion_reward_details: null,
  completion_reward_stock: 5,
  days: [
    { day_index: 2, content_text: "Deuxième case", is_special: true },
    { day_index: 1, content_text: null, is_special: false },
  ],
};

const LOYALTY: SourceRelance = {
  kind: "loyalty",
  name: "Passeport café",
  validation_mode: "staff",
  rotating_period_seconds: 60,
  min_stamp_interval_seconds: 86_400,
  silver_threshold: 5,
  gold_threshold: 10,
  milestones: [
    {
      position: 1,
      visit_count: 5,
      reward_type: "lot",
      reward_label: "Café offert",
      reward_details: "Taille au choix",
      reward_stock: null,
    },
    {
      position: 2,
      visit_count: 10,
      reward_type: "points",
      reward_label: "50 points",
      reward_details: null,
      reward_stock: 0,
    },
  ],
};

const EVENT: SourceRelance = {
  kind: "event",
  name: "Soirée quiz",
  session_label: "Salle du fond",
  reward_label: "Tournée",
  reward_details: null,
  reward_stock: 1,
  questions: [
    {
      position: 0,
      question_type: "quiz",
      prompt: "Capitale de l'Italie ?",
      time_limit_seconds: 20,
      points_base: 1_000,
      options: [
        { position: 1, label: "Milan", is_correct: false },
        { position: 0, label: "Rome", is_correct: true },
      ],
    },
    {
      position: 1,
      question_type: "poll",
      prompt: "Plutôt salé ou sucré ?",
      time_limit_seconds: 15,
      points_base: 0,
      options: [
        { position: 0, label: "Salé", is_correct: false },
        { position: 1, label: "Sucré", is_correct: false },
      ],
    },
  ],
};

const PRONOSTICS: SourceRelance = {
  kind: "pronostics",
  name: "Coupe du quartier",
  competition_key: "custom",
  event_kind: "football",
  collect_email: true,
  collect_phone: false,
  scoring: { exact: 5, diff: 3, winner: 1 },
  matches: [
    {
      position: 1,
      home_name: "Les Bleus",
      away_name: "Les Verts",
      kickoff_at: "2026-05-11T20:00:00Z",
    },
    {
      position: 0,
      home_name: "Les Rouges",
      away_name: "Les Jaunes",
      kickoff_at: "2026-05-10T18:00:00Z",
    },
  ],
};

const SOURCES: Record<string, SourceRelance> = {
  quiz: QUIZ,
  hunt: HUNT,
  calendar: CALENDAR,
  loyalty: LOYALTY,
  event: EVENT,
  pronostics: PRONOSTICS,
};

const SCHEMAS = {
  quiz: quizBlueprintSchema,
  hunt: huntBlueprintSchema,
  calendar: calendarBlueprintSchema,
  loyalty: loyaltyBlueprintSchema,
  event: eventBlueprintSchema,
  pronostics: pronosticsBlueprintSchema,
};

describe("etatSourceRelance", () => {
  it("n'accepte qu'une animation terminée", () => {
    expect(
      etatSourceRelance("loyalty", { status: "active" }, MAINTENANT),
    ).toBe("not_completed");
    expect(
      etatSourceRelance("loyalty", { status: "draft" }, MAINTENANT),
    ).toBe("not_completed");
    expect(
      etatSourceRelance("loyalty", { status: "archived" }, MAINTENANT),
    ).toBe("completed");
  });

  it("suit la clôture propre de chaque module", () => {
    expect(
      etatSourceRelance(
        "hunt",
        { status: "active", starts_at: null, ends_at: "2026-08-05T00:00:00Z" },
        MAINTENANT,
      ),
    ).toBe("completed");
    expect(
      etatSourceRelance(
        "quiz",
        { status: "active", draw_state: "done", drawn_at: "2026-08-01T00:00:00Z" },
        MAINTENANT,
      ),
    ).toBe("completed");
    expect(
      etatSourceRelance(
        "pronostics",
        { status: "active", finalized_at: null },
        MAINTENANT,
      ),
    ).toBe("not_completed");
    expect(
      etatSourceRelance(
        "calendar",
        { status: "active", start_date: "2025-12-01", day_count: 24 },
        MAINTENANT,
      ),
    ).toBe("completed");
  });
});

describe("serialiserRelance — la sortie passe le schéma de son kind", () => {
  it("couvre les six kinds applicables par le moteur universel", () => {
    expect([...KINDS_RELANCE].sort()).toEqual(
      ["calendar", "event", "hunt", "loyalty", "pronostics", "quiz"].sort(),
    );
  });

  it.each(KINDS_RELANCE)("%s — configuration valide au schéma", (kind) => {
    const resultat = serialiserRelance(SOURCES[kind]);
    expect(resultat.ok, resultat.ok ? "" : resultat.error).toBe(true);
    if (!resultat.ok) return;
    expect(SCHEMAS[kind].safeParse(resultat.configuration).success).toBe(true);
  });
});

describe("serialiserRelance — AUCUNE donnée joueur ne sort", () => {
  it("ne recopie que les clés de la liste blanche d'une option", () => {
    const pollue: SourceRelance = {
      ...QUIZ,
      questions: [
        {
          ...QUIZ.questions[0],
          options: [
            {
              id: "A",
              label: "Cannelle",
              // Ce que le schéma `.strict()` refuserait s'il l'atteignait :
              // il ne l'atteint jamais, le mappeur ne copie ni l'un ni l'autre.
              player_id: "00000000-0000-4000-8000-0000000000ff",
              email: "alice@example.test",
            },
            { id: "B", label: "Paprika" },
          ],
        },
      ],
    };

    const resultat = serialiserRelance(pollue);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    const rendu = JSON.stringify(resultat);
    expect(rendu).not.toContain("player_id");
    expect(rendu).not.toContain("alice@example.test");
  });

  it("n'emporte ni jeton d'étape, ni slug, ni compteur de participation", () => {
    for (const kind of KINDS_RELANCE) {
      const resultat = serialiserRelance(SOURCES[kind]);
      expect(resultat.ok).toBe(true);
      if (!resultat.ok) continue;
      const rendu = JSON.stringify(resultat.configuration);
      for (const interdit of [
        "token",
        "public_slug",
        "slug",
        "claimed",
        "redeem",
        "scan_count",
        "player",
        "participant",
      ]) {
        expect(rendu, `${kind} transporte « ${interdit} »`).not.toContain(interdit);
      }
    }
  });
});

describe("serialiserRelance — traductions par module", () => {
  it("quiz : renumérote les options et remappe la bonne réponse", () => {
    const resultat = serialiserRelance(QUIZ);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = quizBlueprintSchema.parse(resultat.configuration);

    // Trié par position : la question 0 vient en premier.
    expect(configuration.questions[0].prompt).toContain("bougies");
    expect(configuration.questions[0].options.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(configuration.questions[0].correct_option_id).toBe("o2");
    expect(configuration.questions[1].correct_option_id).toBe("o1");
    // Une limite de temps absente reste absente, elle ne devient pas zéro.
    expect(configuration.questions[0].time_limit_seconds).toBeUndefined();
    expect(configuration.questions[1].time_limit_seconds).toBe(30);
  });

  it("quiz : écarte les questions non représentables par le blueprint", () => {
    const resultat = serialiserRelance({
      ...QUIZ,
      questions: [
        ...QUIZ.questions,
        {
          position: 5,
          question_type: "ranking",
          prompt: "Classez ces desserts",
          options: [{ id: "a", label: "Tarte" }],
          correct_answer: ["a"],
          preset: "ranking",
          time_limit_seconds: null,
          points: 1,
        },
      ],
    });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(quizBlueprintSchema.parse(resultat.configuration).questions).toHaveLength(2);
  });

  it("hunt : étapes ordonnées, aucun jeton, dotation principale reprise", () => {
    const resultat = serialiserRelance(HUNT);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = huntBlueprintSchema.parse(resultat.configuration);
    expect(configuration.steps.map((s) => s.label)).toEqual([
      "La boulangerie",
      "La fontaine",
    ]);
    expect(configuration.steps[0].hint_text).toBeUndefined();
    // `reward_stock` nullable en base → 0, jamais `null` dans la dotation.
    expect(resultat.defaultRewards).toEqual([
      { slot: "primary", label: "Bon d'achat", stock: 0 },
    ]);
  });

  it("calendrier : repart d'aujourd'hui, pas de la date d'origine", () => {
    const resultat = serialiserRelance(CALENDAR);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = calendarBlueprintSchema.parse(resultat.configuration);
    expect(configuration.start_offset_days).toBe(0);
    expect(configuration.days.map((j) => j.content_text)).toEqual([
      "",
      "Deuxième case",
    ]);
  });

  it("fidélité : les paliers en points ne deviennent pas des lots", () => {
    const resultat = serialiserRelance(LOYALTY);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = loyaltyBlueprintSchema.parse(resultat.configuration);
    expect(configuration.milestones).toHaveLength(1);
    expect(configuration.milestones[0].label).toBe("Café offert");
    // Les dotations d'un passeport vivent dans ses paliers.
    expect(resultat.defaultRewards).toEqual([]);
  });

  it("événement : options triées, dotation prise sur la salle", () => {
    const resultat = serialiserRelance(EVENT);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = eventBlueprintSchema.parse(resultat.configuration);
    expect(configuration.session_label).toBe("Salle du fond");
    expect(configuration.questions[0].options.map((o) => o.label)).toEqual([
      "Rome",
      "Milan",
    ]);
    expect(resultat.defaultRewards).toEqual([
      { slot: "primary", label: "Tournée", stock: 1 },
    ]);
  });

  it("pronostics : coups d'envoi ABSOLUS convertis en décalages relatifs", () => {
    const resultat = serialiserRelance(PRONOSTICS);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const configuration = pronosticsBlueprintSchema.parse(resultat.configuration);
    // Le premier match repart à J+1 ; l'écart de 26 h est conservé.
    expect(configuration.matches[0].kickoff_offset_hours).toBe(24);
    expect(configuration.matches[1].kickoff_offset_hours).toBe(50);
    expect(configuration.matches[0].home_name).toBe("Les Rouges");
    expect(configuration.scoring).toEqual({ exact: 5, diff: 3, winner: 1 });
    // L'échelle de rangs n'est pas recopiée : elle n'est pas représentable.
    expect(resultat.defaultRewards).toEqual([]);
  });

  it("une dotation sans libellé n'est pas inventée", () => {
    const resultat = serialiserRelance({ ...HUNT, reward_label: "  " });
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.defaultRewards).toEqual([]);
  });
});

describe("serialiserRelance — refus explicites", () => {
  it("refuse une chasse trop courte plutôt que d'inventer une étape", () => {
    const resultat = serialiserRelance({
      ...HUNT,
      steps: [{ position: 1, label: "Seule étape", hint_text: null }],
    });
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.error).toContain("ne peut pas être recopiée");
  });

  it("refuse un quiz dont aucune question n'est représentable", () => {
    const resultat = serialiserRelance({ ...QUIZ, questions: [] });
    expect(resultat.ok).toBe(false);
  });
});
