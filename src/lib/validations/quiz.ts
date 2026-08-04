import { z } from "zod";
import {
  NUMBER_ANSWER_MAX,
  OPTION_ID_PATTERN,
  OPTION_LABEL_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
} from "@/lib/pronostics";
import {
  normalizeQuizText,
  QUIZ_IMAGE_URL_MAX,
  QUIZ_INTRO_MAX,
  QUIZ_NAME_MAX,
  QUIZ_POINTS_MAX,
  QUIZ_PRESET_PATTERN,
  QUIZ_PROMPT_MAX,
  QUIZ_TEXT_ANSWER_MAX,
  QUIZ_TEXT_VARIANT_MAX,
  QUIZ_TEXT_VARIANTS_MAX,
  QUIZ_TIME_LIMIT_MAX,
  QUIZ_TIME_LIMIT_MIN,
} from "@/lib/quiz";
import { codeTtlDaysSchema } from "@/lib/validations/reward-expiry";

// ────────────────────────────────────────────────────────────
// Créateur de quiz — schémas d'entrée
//
// MIROIR DE CONFORT, PAS L'AUTORITÉ. Toutes les bornes ci-dessous répliquent les
// fonctions SQL de la migration 20260803120000 (is_valid_quiz_answer,
// is_valid_quiz_solution, is_valid_quiz_question, plus les CHECK de `quizzes` /
// `quiz_questions`) : la base REVALIDE systématiquement, y compris la justesse et
// le chronomètre, qui ne sont JAMAIS calculés côté Node. Ces schémas servent à
// rendre un message lisible au commerçant et au joueur — jamais de barrière
// unique. Modelé sur validations/calendar.ts et validations/pronostics.ts.
// ────────────────────────────────────────────────────────────

const uuid = z.string().uuid("Identifiant invalide");

/** Habillage de la page publique (miroir du CHECK SQL). */
export const quizThemeSchema = z.enum([
  "neutre",
  "gourmand",
  "degustation",
  "culture",
  "produit",
  "sport",
  "entreprise",
]);

/** Forme de la réponse — LE MOTEUR (miroir du CHECK SQL). */
export const quizQuestionTypeSchema = z.enum([
  "choice",
  "number",
  "ranking",
  "text",
]);

/** Mode de récompense (5 modes, miroir du CHECK SQL). */
export const quizRewardModeSchema = z.enum([
  "threshold",
  "draw",
  "ranking",
  "instant",
  "none",
]);

/**
 * Modèle d'UI. Contraint en FORME seulement (miroir du CHECK
 * `^[a-z][a-z0-9_]{1,39}$`), exactement comme `contests.event_kind` : ajouter un
 * 8e modèle ne doit demander NI migration NI modification de ce schéma.
 */
export const quizPresetSchema = z
  .string()
  .trim()
  .regex(QUIZ_PRESET_PATTERN, "Modèle de question invalide");

const quizNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom du quiz est requis")
  .max(QUIZ_NAME_MAX, `Nom trop long (${QUIZ_NAME_MAX} caractères max)`);

/** Consigne affichée avant la première question. '' accepté. */
const introTextSchema = z
  .string()
  .trim()
  .max(QUIZ_INTRO_MAX, `Consigne trop longue (${QUIZ_INTRO_MAX} caractères max)`)
  .default("");

/**
 * URL publique suivable. '' → null (la page cible alors l'id). Sinon 3..64
 * caractères [a-z0-9-] (miroir du CHECK SQL et de l'unicité).
 */
const publicSlugSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]{3,64}$/, "Slug invalide (3 à 64 caractères a-z, 0-9, -)"),
  ])
  .nullable()
  .default(null);

const rewardLabelSchema = z
  .string()
  .trim()
  .max(120, "Lot trop long (120 caractères max)")
  .default("");

const rewardDetailsSchema = z
  .string()
  .trim()
  .max(2000, "Description trop longue (2000 caractères max)")
  .default("");

/**
 * Stock du lot — FINI et OBLIGATOIRE (ADR-031, miroir du NOT NULL SQL
 * reward_stock >= 0) : c'est le nombre MAXIMAL de joueurs récompensés. '' → 0
 * (« aucun lot »), état non destructeur.
 */
const rewardStockSchema = z
  .union([
    z.literal("").transform(() => 0),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(0, "Stock négatif interdit")
      .max(1_000_000, "Stock trop grand"),
  ])
  .default(0);

/** threshold : nombre de BONNES RÉPONSES requis. '' → null. */
const rewardThresholdSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(1, "Au moins une bonne réponse")
      .max(500, "500 bonnes réponses maximum"),
  ])
  .nullable()
  .default(null);

/** draw : taille du vivier des meilleurs dans lequel on tire au sort. */
const drawTopNSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(1, "Au moins un joueur dans le vivier")
      .max(10_000, "10 000 joueurs maximum"),
  ])
  .nullable()
  .default(null);

/** Roue cible d'un tour offert — UUID ; '' → null. */
const targetWheelIdSchema = z
  .union([z.literal("").transform(() => null), uuid])
  .nullable()
  .default(null);

// ── Dashboard commerçant — quiz ──

export const createQuizSchema = z.object({
  name: quizNameSchema,
});

/** Réglages d'un quiz (hors récompense et statut : schémas dédiés). */
export const updateQuizSchema = z.object({
  id: uuid,
  name: quizNameSchema,
  theme: quizThemeSchema,
  public_slug: publicSlugSchema,
  intro_text: introTextSchema,
  // Échéance du code QUIZ- (null = sans limite). Portée par les réglages du
  // quiz et non par `updateQuizRewardSchema` : les deux écrivent bien la table
  // `quizzes`, mais c'est le parti déjà pris pour `contests.code_ttl_seconds`
  // (réglages du championnat, pas dotation). `.optional()` : le champ n'est
  // écrit que si le formulaire le porte — voir la garde `has` côté action.
  code_ttl_days: codeTtlDaysSchema.optional(),
});

/**
 * Mode de récompense + dotation. Miroir des CHECK SQL :
 *  · quizzes_reward_mode_fields_check : threshold ⇒ seuil seul ; draw ⇒ vivier
 *    seul ; les autres modes ne portent ni l'un ni l'autre ;
 *  · quizzes_reward_none_check : `none` ⇒ rien à provisionner (stock 0, pas de
 *    libellé, pas de roue) ;
 *  · quizzes_wheel_mode_check : un tour de roue offert n'a de sens qu'en émission
 *    IMMÉDIATE (threshold / instant) — un jeton émis des heures après le passage
 *    du joueur ne serait jamais consommé.
 * Sans ces refine, le commerçant récolterait une erreur SQL brute 23514.
 */
export const updateQuizRewardSchema = z
  .object({
    id: uuid,
    reward_mode: quizRewardModeSchema,
    reward_threshold: rewardThresholdSchema,
    draw_top_n: drawTopNSchema,
    reward_label: rewardLabelSchema,
    reward_details: rewardDetailsSchema,
    reward_stock: rewardStockSchema,
    target_wheel_id: targetWheelIdSchema,
  })
  .superRefine((data, ctx) => {
    const mode = data.reward_mode;

    if (mode === "threshold" && data.reward_threshold === null) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_threshold"],
        message: "Indiquez le nombre de bonnes réponses qui donne le lot",
      });
    }
    if (mode !== "threshold" && data.reward_threshold !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["reward_threshold"],
        message: "Le seuil de bonnes réponses ne s'applique qu'au mode « seuil »",
      });
    }
    if (mode === "draw" && data.draw_top_n === null) {
      ctx.addIssue({
        code: "custom",
        path: ["draw_top_n"],
        message: "Indiquez parmi combien de meilleurs joueurs le sort est tiré",
      });
    }
    if (mode !== "draw" && data.draw_top_n !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["draw_top_n"],
        message: "Le vivier ne s'applique qu'au mode « tirage au sort »",
      });
    }

    if (mode === "none") {
      if (data.reward_stock !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["reward_stock"],
          message: "Un quiz sans gain n'a pas de stock à provisionner",
        });
      }
      if (data.reward_label !== "") {
        ctx.addIssue({
          code: "custom",
          path: ["reward_label"],
          message: "Un quiz sans gain n'a pas de lot à décrire",
        });
      }
      if (data.target_wheel_id !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["target_wheel_id"],
          message: "Un quiz sans gain n'offre pas de tour de roue",
        });
      }
      return;
    }

    // Modes qui émettent : le lot doit être nommé (affiché au joueur et en caisse).
    if (data.target_wheel_id === null && data.reward_label === "") {
      ctx.addIssue({
        code: "custom",
        path: ["reward_label"],
        message: "Indiquez le libellé du lot remis au joueur",
      });
    }
    if (
      data.target_wheel_id !== null &&
      mode !== "threshold" &&
      mode !== "instant"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["target_wheel_id"],
        message:
          "Un tour de roue offert n'est possible qu'en remise immédiate (seuil ou systématique)",
      });
    }
  });

export const setQuizStatusSchema = z.object({
  id: uuid,
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteQuizSchema = z.object({
  id: uuid,
});

/**
 * Marqueur du refus « des codes QUIZ- attendent encore d'être retirés ».
 *
 * `quiz_rewards` cascade depuis `quizzes` (20260803120000:789-790) : supprimer
 * le quiz emportait les codes `QUIZ-` non remis en caisse. Le texte de
 * confirmation annonçait « ce quiz, ses questions et les participations » sans
 * jamais nommer les lots — ce que le joueur, lui, tient déjà en main.
 *
 * `deleteQuiz` le place dans son message ; l'écran ne montre la case
 * qu'APRÈS ce refus précis, jamais sur « Suppression impossible ».
 */
export const QUIZ_DELETE_LOSS_HINT = "Cochez la case de confirmation";

/** Déclenchement du tirage différé (draw / ranking) — owner|editor. */
export const drawQuizWinnersSchema = z.object({
  id: uuid,
});

// ── Dashboard commerçant — questions ──

const optionIdSchema = z
  .string()
  .trim()
  .regex(OPTION_ID_PATTERN, "Identifiant d'option invalide");

const questionOptionSchema = z.object({
  id: optionIdSchema,
  label: z
    .string()
    .trim()
    .min(1, "Libellé d'option requis")
    .max(OPTION_LABEL_MAX, `Libellé trop long (${OPTION_LABEL_MAX} caractères max)`),
});

/**
 * Liste d'options : 0 entrée acceptée ici (number / text n'en ont pas), le
 * minimum de 2 est exigé PAR TYPE dans le superRefine (miroir de
 * is_valid_contest_options, réutilisé par is_valid_quiz_question).
 */
const questionOptionsSchema = z
  .array(questionOptionSchema)
  .max(OPTIONS_MAX, `${OPTIONS_MAX} options maximum`)
  .superRefine((options, ctx) => {
    const seen = new Set<string>();
    options.forEach((option, index) => {
      if (seen.has(option.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Deux options portent le même identifiant",
        });
      }
      seen.add(option.id);
    });
  });

/**
 * Résultat officiel saisi par le commerçant. Union discriminée miroir de
 * `is_valid_quiz_solution` : la vérité d'une question `text` est un TABLEAU de
 * variantes acceptées (« Italie », « l'Italie »…), les trois autres types
 * partagent la forme d'une réponse de joueur.
 */
export const quizSolutionInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), optionId: optionIdSchema }),
  z.object({
    type: z.literal("number"),
    value: z.coerce
      .number()
      .refine((v) => Number.isFinite(v), "Valeur invalide")
      .min(-NUMBER_ANSWER_MAX, "Valeur trop petite")
      .max(NUMBER_ANSWER_MAX, "Valeur trop grande"),
  }),
  z.object({
    type: z.literal("ranking"),
    order: z
      .array(optionIdSchema)
      .min(OPTIONS_MIN, `Classez au moins ${OPTIONS_MIN} éléments`)
      .max(OPTIONS_MAX, `${OPTIONS_MAX} éléments maximum`),
  }),
  z.object({
    type: z.literal("text"),
    variants: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Variante vide")
          .max(
            QUIZ_TEXT_VARIANT_MAX,
            `Variante trop longue (${QUIZ_TEXT_VARIANT_MAX} caractères max)`,
          ),
      )
      .min(1, "Indiquez au moins une réponse acceptée")
      .max(
        QUIZ_TEXT_VARIANTS_MAX,
        `${QUIZ_TEXT_VARIANTS_MAX} variantes acceptées maximum`,
      )
      .superRefine((variants, ctx) => {
        variants.forEach((variant, index) => {
          // Miroir de quiz_normalize_text : une variante qui se réduit à rien
          // (ponctuation seule) ne pourrait jamais être trouvée par un joueur.
          if (normalizeQuizText(variant) === "") {
            ctx.addIssue({
              code: "custom",
              path: [index],
              message: "Cette variante ne contient aucun caractère comparable",
            });
          }
        });
      }),
  }),
]);

const promptSchema = z
  .string()
  .trim()
  .min(1, "L'intitulé de la question est requis")
  .max(QUIZ_PROMPT_MAX, `Intitulé trop long (${QUIZ_PROMPT_MAX} caractères max)`);

/** « Image mystère » : un média attaché à la question. '' → null. */
const imageUrlSchema = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .max(QUIZ_IMAGE_URL_MAX, "URL trop longue")
      .refine((v) => /^https?:\/\//.test(v), "URL invalide"),
  ])
  .nullable()
  .default(null);

/**
 * Chronomètre TRANSVERSAL : '' → null (le joueur prend son temps), sinon 5..600 s
 * (miroir du CHECK SQL). Applicable à n'importe quel type de question — « question
 * chronométrée » n'est pas un type mais cette option.
 */
const timeLimitSecondsSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier de secondes requis")
      .min(QUIZ_TIME_LIMIT_MIN, `Au moins ${QUIZ_TIME_LIMIT_MIN} secondes`)
      .max(QUIZ_TIME_LIMIT_MAX, `${QUIZ_TIME_LIMIT_MAX} secondes maximum`),
  ])
  .nullable()
  .default(null);

const pointsSchema = z.coerce
  .number()
  .int("Nombre entier requis")
  .min(0, "Points négatifs interdits")
  .max(QUIZ_POINTS_MAX, `${QUIZ_POINTS_MAX} points maximum`)
  .default(1);

/** number : écart absolu toléré. '' → null (valeur exacte exigée). */
const toleranceSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .min(0, "Tolérance négative interdite")
      .max(NUMBER_ANSWER_MAX, "Tolérance hors bornes"),
  ])
  .nullable()
  .default(null);

/** ranking : taille du top attendu. '' → null. */
const rankingSizeSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier requis")
      .min(OPTIONS_MIN, `Classez au moins ${OPTIONS_MIN} éléments`)
      .max(OPTIONS_MAX, `${OPTIONS_MAX} éléments maximum`),
  ])
  .nullable()
  .default(null);

interface QuestionShape {
  question_type: "choice" | "number" | "ranking" | "text";
  options: Array<{ id: string; label: string }>;
  correct_answer: z.infer<typeof quizSolutionInputSchema>;
  tolerance: number | null;
  ranking_size: number | null;
}

/**
 * Cohérence type ↔ champs ↔ vérité — miroir applicatif de
 * `is_valid_quiz_question` :
 *  · choice  ⇒ 2..50 options, ni top N ni tolérance, vérité = un id d'option ;
 *  · ranking ⇒ 2..50 options, top N de 2 à nb d'options, pas de tolérance,
 *              vérité = exactement `ranking_size` ids DISTINCTS des options ;
 *  · number  ⇒ aucune option, pas de top N, tolérance facultative >= 0,
 *              vérité = un nombre ;
 *  · text    ⇒ aucune option, ni top N ni tolérance, vérité = 1..10 variantes.
 */
function refineQuestion(q: QuestionShape, ctx: z.RefinementCtx): void {
  const type = q.question_type;
  const optionIds = new Set(q.options.map((o) => o.id));

  if (q.correct_answer.type !== type) {
    ctx.addIssue({
      code: "custom",
      path: ["correct_answer"],
      message: "Le résultat officiel ne correspond pas au type de question",
    });
    return;
  }

  if (type === "choice" || type === "ranking") {
    if (q.options.length < OPTIONS_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `Proposez au moins ${OPTIONS_MIN} options`,
      });
    }
    if (q.tolerance !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["tolerance"],
        message: "La tolérance ne s'applique qu'à une estimation chiffrée",
      });
    }
  } else {
    if (q.options.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Ce type de question ne prend pas d'options",
      });
    }
    if (q.ranking_size !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["ranking_size"],
        message: "Ce type de question n'a pas de top N",
      });
    }
  }

  if (type === "choice") {
    if (q.ranking_size !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["ranking_size"],
        message: "Un choix unique n'a pas de top N",
      });
    }
    if (
      q.correct_answer.type === "choice" &&
      !optionIds.has(q.correct_answer.optionId)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["correct_answer"],
        message: "La bonne réponse doit être l'une des options proposées",
      });
    }
  }

  if (type === "ranking") {
    const size = q.ranking_size;
    if (size === null) {
      ctx.addIssue({
        code: "custom",
        path: ["ranking_size"],
        message: "Indiquez le nombre d'éléments à classer",
      });
    } else if (size > q.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["ranking_size"],
        message: "Le top N ne peut pas dépasser le nombre d'options",
      });
    }
    if (q.correct_answer.type === "ranking") {
      const order = q.correct_answer.order;
      if (size !== null && order.length !== size) {
        ctx.addIssue({
          code: "custom",
          path: ["correct_answer"],
          message: `Le classement officiel doit compter exactement ${size} éléments`,
        });
      }
      if (new Set(order).size !== order.length) {
        ctx.addIssue({
          code: "custom",
          path: ["correct_answer"],
          message: "Un même élément ne peut pas être classé deux fois",
        });
      }
      if (order.some((id) => !optionIds.has(id))) {
        ctx.addIssue({
          code: "custom",
          path: ["correct_answer"],
          message: "Le classement officiel contient une option inconnue",
        });
      }
    }
  }

  if (type === "text" && q.tolerance !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["tolerance"],
      message: "La tolérance ne s'applique qu'à une estimation chiffrée",
    });
  }
}

const questionFields = {
  question_type: quizQuestionTypeSchema,
  preset: quizPresetSchema.default("multiple_choice"),
  prompt: promptSchema,
  options: questionOptionsSchema.default([]),
  correct_answer: quizSolutionInputSchema,
  image_url: imageUrlSchema,
  time_limit_seconds: timeLimitSecondsSchema,
  points: pointsSchema,
  tolerance: toleranceSchema,
  ranking_size: rankingSizeSchema,
};

/** Ajout d'une question (la position est attribuée par l'action : fin de liste). */
export const createQuizQuestionSchema = z
  .object({ quiz_id: uuid, ...questionFields })
  .superRefine(refineQuestion);

/** Modification d'une question existante (édition par son id). */
export const updateQuizQuestionSchema = z
  .object({ id: uuid, ...questionFields })
  .superRefine(refineQuestion);

export const deleteQuizQuestionSchema = z.object({
  id: uuid,
});

/** Réordonnancement : l'ordre COMPLET des questions du quiz. */
export const reorderQuizQuestionsSchema = z.object({
  quiz_id: uuid,
  order: z.array(uuid).min(1, "Ordre vide").max(500, "Trop de questions"),
});

// ── Parcours public (clients du commerçant) ──

/**
 * URL/slug public résolu par joinQuiz : slug [a-z0-9-]{3,64} OU UUID (la page
 * peut cibler l'id). Casse tolérée, normalisée en minuscules.
 */
export const quizSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(64, "Lien invalide")
  .regex(
    /^([a-z0-9-]{3,64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    "Lien invalide",
  );

/** Prénom affiché au classement — FACULTATIF. '' → undefined (aucune PII). */
const optInFirstNameSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(1, "Prénom invalide").max(60, "Prénom trop long").optional(),
);

/**
 * Email opt-in RGPD : consentement EXPLICITE côté UI (jamais pré-coché). '' →
 * undefined (aucune PII collectée). Miroir léger du CHECK SQL (3..320, présence
 * d'un @).
 */
const optInEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Email invalide")
    .max(320, "Email trop long")
    .refine((v) => v.includes("@"), "Email invalide")
    .optional(),
);

/** Clé d'avatar du catalogue applicatif. '' → undefined. */
const optInAvatarSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^[a-z]{1,20}$/, "Avatar invalide")
    .optional(),
);

/**
 * Rejoindre un quiz : slug + identité facultative.
 *
 * RGPD — LE COUPLAGE EST ICI, PAS DANS L'INTERFACE : un email n'est ACCEPTÉ que
 * si le consentement l'accompagne. La case à cocher du composant client ne peut
 * pas faire office de garde (une server action est un endpoint : `joinQuiz({ slug,
 * email: "victime@…", marketingOptIn: false })` est un appel parfaitement
 * légitime du point de vue du transport). On REFUSE explicitement au lieu
 * d'ignorer en silence : un joueur qui a saisi son adresse doit apprendre
 * pourquoi elle n'a pas été prise — un abandon muet lui laisserait croire qu'il
 * est inscrit. Depuis l'UI (où les deux champs sont liés) ce refus ne se produit
 * jamais : la règle n'ajoute aucune friction, elle ferme le chemin direct.
 */
export const joinQuizSchema = z
  .object({
    slug: quizSlugSchema,
    firstName: optInFirstNameSchema,
    email: optInEmailSchema,
    avatar: optInAvatarSchema,
    marketingOptIn: z.coerce.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.email && !data.marketingOptIn) {
      ctx.addIssue({
        code: "custom",
        path: ["marketingOptIn"],
        message:
          "Cochez la case d'accord pour que votre email soit enregistré, ou laissez le champ vide.",
      });
    }
  });

/** Présenter une question (pose le chronomètre serveur) : quiz + question. */
export const startQuizQuestionSchema = z.object({
  quizId: uuid,
  questionId: uuid,
});

/**
 * Réponse d'un joueur, AVANT confrontation à la question visée (qui reste faite
 * EN BASE, avec les options, le `ranking_size` et le chronomètre de la question).
 * Miroir de `is_valid_quiz_answer` : choice = un id, number = un nombre,
 * ranking = des ids DISTINCTS, text = une chaîne bornée non vide après
 * normalisation.
 */
export const quizAnswerInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choice"), optionId: optionIdSchema }),
  z.object({
    type: z.literal("number"),
    value: z.coerce
      .number()
      .refine((v) => Number.isFinite(v), "Valeur invalide")
      .min(-NUMBER_ANSWER_MAX, "Valeur trop petite")
      .max(NUMBER_ANSWER_MAX, "Valeur trop grande"),
  }),
  z.object({
    type: z.literal("ranking"),
    order: z
      .array(optionIdSchema)
      .min(OPTIONS_MIN, `Classez au moins ${OPTIONS_MIN} éléments`)
      .max(OPTIONS_MAX, `${OPTIONS_MAX} éléments maximum`)
      .refine(
        (order) => new Set(order).size === order.length,
        "Un même élément ne peut pas être classé deux fois",
      ),
  }),
  z.object({
    type: z.literal("text"),
    value: z
      .string()
      .trim()
      .min(1, "Réponse vide")
      .max(
        QUIZ_TEXT_ANSWER_MAX,
        `Réponse trop longue (${QUIZ_TEXT_ANSWER_MAX} caractères max)`,
      )
      .refine(
        (v) => normalizeQuizText(v) !== "",
        "Cette réponse ne contient aucun caractère comparable",
      ),
  }),
]);

export const submitQuizAnswerSchema = z.object({
  quizId: uuid,
  questionId: uuid,
  answer: quizAnswerInputSchema,
});

/** Question contre laquelle une réponse est confrontée (confort UI). */
export interface QuizAnsweredQuestionShape {
  questionType: "choice" | "number" | "ranking" | "text";
  options: Array<{ id: string; label: string }>;
  rankingSize: number | null;
}

/**
 * Réponse validée CONTRE la question visée — miroir applicatif de
 * `is_valid_quiz_answer` (type cohérent, option connue, top N de la bonne taille
 * et sans doublon), pour un message utile AVANT l'aller-retour serveur. La forme
 * reste revalidée en SQL, qui seul fait autorité. Miroir de contestAnswerSchema.
 */
export function quizAnswerSchema(question: QuizAnsweredQuestionShape) {
  const optionIds = new Set(question.options.map((o) => o.id));
  return quizAnswerInputSchema.superRefine((answer, ctx) => {
    if (answer.type !== question.questionType) {
      ctx.addIssue({
        code: "custom",
        message: "Réponse incompatible avec cette question",
      });
      return;
    }
    if (answer.type === "choice" && !optionIds.has(answer.optionId)) {
      ctx.addIssue({ code: "custom", path: ["optionId"], message: "Option inconnue" });
    }
    if (answer.type === "ranking") {
      const size = question.rankingSize ?? 0;
      if (size < OPTIONS_MIN || answer.order.length !== size) {
        ctx.addIssue({
          code: "custom",
          path: ["order"],
          message: `Classez exactement ${size} éléments`,
        });
      }
      if (answer.order.some((id) => !optionIds.has(id))) {
        ctx.addIssue({ code: "custom", path: ["order"], message: "Option inconnue" });
      }
    }
  });
}

/** Clore sa participation : quiz seul (l'identité vient du cookie). */
export const finishQuizSchema = z.object({
  quizId: uuid,
});

/** Consommer un tour offert : quiz + jeton de spin (48 hex). */
export const consumeQuizSpinSchema = z.object({
  quizId: uuid,
  grantToken: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{48}$/, "Jeton de tour offert invalide"),
});

/** Repli polling : l'état public d'un quiz par son UUID. */
export const getQuizStateSchema = z.object({
  quizId: uuid,
});

/** Classement public d'un quiz (page joueur / écran). */
export const getQuizLeaderboardSchema = z.object({
  quizId: uuid,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ── Caisse (remise en caisse) ──

/**
 * Code de retrait présenté en caisse (QUIZ-XXXXXXXX). Casse et espaces autour
 * tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL). Miroir strict de
 * calendarRedeemCodeSchema / referralRedeemCodeSchema.
 */
export const quizRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^QUIZ-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
