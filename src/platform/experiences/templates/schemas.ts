import { z } from "zod";

const shortText = z.string().trim().min(1).max(120);
const details = z.string().trim().max(2_000).optional();
const safeUrl = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
    message: "L’URL doit utiliser HTTP ou HTTPS",
  });

export const blueprintAssetsSchema = z
  .array(
    z
      .object({
        key: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,39}$/),
        url: safeUrl,
        alt: z.string().trim().max(160).optional(),
      })
      .strict(),
  )
  .max(16)
  .refine((assets) => new Set(assets.map((asset) => asset.key)).size === assets.length, {
    message: "Chaque asset doit avoir une clé unique",
  });

export const blueprintRewardsSchema = z
  .array(
    z
      .object({
        slot: z.string().trim().regex(/^[a-z][a-z0-9:_-]{0,39}$/),
        label: shortText,
        details,
        stock: z.number().int().min(0).max(1_000_000),
      })
      .strict(),
  )
  .max(32)
  .refine(
    (rewards) => new Set(rewards.map((reward) => reward.slot)).size === rewards.length,
    { message: "Chaque dotation doit avoir un emplacement unique" },
  );

const optionSchema = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9_-]{1,32}$/),
    label: z.string().trim().min(1).max(200),
  })
  .strict();

export const quizBlueprintSchema = z
  .object({
    name: shortText,
    theme: z
      .enum([
        "neutre",
        "gourmand",
        "degustation",
        "culture",
        "produit",
        "sport",
        "entreprise",
      ])
      .default("neutre"),
    intro_text: z.string().trim().max(2_000).optional(),
    questions: z
      .array(
        z
          .object({
            prompt: z.string().trim().min(1).max(500),
            options: z.array(optionSchema).min(2).max(20),
            correct_option_id: z.string().trim().min(1).max(32),
            preset: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/).default("multiple_choice"),
            image_asset_key: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,39}$/).optional(),
            time_limit_seconds: z.number().int().min(5).max(600).optional(),
            points: z.number().int().min(0).max(1_000).default(1),
          })
          .strict()
          .refine(
            (question) =>
              question.options.some((option) => option.id === question.correct_option_id),
            { message: "La bonne réponse doit référencer une option" },
          ),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const huntBlueprintSchema = z
  .object({
    name: shortText,
    order_mode: z.enum(["free", "ordered"]).default("free"),
    min_scan_interval_seconds: z.number().int().min(0).max(86_400).default(0),
    steps: z
      .array(
        z
          .object({
            label: shortText,
            hint_text: z.string().trim().max(500).optional(),
          })
          .strict(),
      )
      .min(2)
      .max(10),
  })
  .strict();

export const calendarBlueprintSchema = z
  .object({
    name: shortText,
    // Recopie littérale de la palette partagée (`lib/seasonal-theme.ts`) — la
    // parité est tenue par `seasonal-theme.test.ts`, qui compare ces `options`
    // à `SEASONAL_THEMES` : un blueprint ne peut pas proposer un habillage que
    // le calendrier refuserait à l'enregistrement.
    theme: z.enum([
      "neutre",
      "noel",
      "saint_valentin",
      "anniversaire",
      "soldes",
      "festival",
      "prairie",
      "musique",
      "football",
      "restaurant",
      "espace",
    ]),
    start_offset_days: z.number().int().min(0).max(365).default(0),
    merchant_content: z.string().trim().max(4_000).optional(),
    days: z
      .array(
        z
          .object({
            content_text: z.string().trim().max(2_000).default(""),
            is_special: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();

export const loyaltyBlueprintSchema = z
  .object({
    name: shortText,
    validation_mode: z.enum(["rotating_code", "staff"]).default("staff"),
    rotating_period_seconds: z.number().int().min(15).max(3_600).default(60),
    min_stamp_interval_seconds: z.number().int().min(300).max(604_800).default(86_400),
    silver_threshold: z.number().int().min(1).max(999),
    gold_threshold: z.number().int().min(2).max(1_000),
    milestones: z
      .array(
        z
          .object({
            visit_count: z.number().int().min(1).max(1_000),
            label: shortText,
            details,
            stock: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine((value) => value.gold_threshold > value.silver_threshold, {
    message: "Le seuil or doit dépasser le seuil argent",
  })
  .refine(
    (value) =>
      new Set(value.milestones.map((milestone) => milestone.visit_count)).size ===
      value.milestones.length,
    { message: "Les paliers doivent avoir des seuils distincts" },
  );

export const eventBlueprintSchema = z
  .object({
    name: shortText,
    session_label: z.string().trim().max(120).optional(),
    questions: z
      .array(
        z
          .object({
            type: z.enum(["quiz", "poll", "prono"]),
            prompt: z.string().trim().min(1).max(500),
            time_limit_seconds: z.number().int().min(5).max(300).default(20),
            points_base: z.number().int().min(0).max(100_000).default(1_000),
            media_asset_key: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,39}$/).optional(),
            options: z
              .array(
                z
                  .object({
                    label: z.string().trim().min(1).max(200),
                    is_correct: z.boolean().default(false),
                  })
                  .strict(),
              )
              .min(2)
              .max(20),
          })
          .strict()
          .refine(
            (question) =>
              question.type !== "quiz" ||
              question.options.filter((option) => option.is_correct).length === 1,
            { message: "Une question quiz doit avoir exactement une bonne réponse" },
          )
          .refine(
            (question) =>
              question.type === "quiz" ||
              question.options.every((option) => !option.is_correct),
            { message: "Les sondages et pronostics ne portent pas de réponse correcte au modèle" },
          ),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const pronosticsBlueprintSchema = z
  .object({
    name: shortText,
    competition_key: z.string().trim().min(1).max(80).default("custom"),
    event_kind: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/).default("football"),
    collect_email: z.boolean().default(true),
    collect_phone: z.boolean().default(false),
    scoring: z
      .object({
        exact: z.number().int().min(0).max(100),
        diff: z.number().int().min(0).max(100),
        winner: z.number().int().min(0).max(100),
      })
      .strict(),
    matches: z
      .array(
        z
          .object({
            home_name: z.string().trim().min(1).max(60),
            away_name: z.string().trim().min(1).max(60),
            kickoff_offset_hours: z.number().int().min(1).max(8_760),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export const unsupportedBlueprintSchema = z.object({ name: shortText }).passthrough();
