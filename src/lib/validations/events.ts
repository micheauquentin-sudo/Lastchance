import { z } from "zod";
import { isAvatarId } from "@/lib/avatars";

// ────────────────────────────────────────────────────────────
// Mode événement en direct — schémas d'entrée
//
// Bornes applicatives plus strictes ou égales aux CHECK SQL de la migration
// 20260727120000_events_live : l'UI reste lisible, la base garde sa marge.
// Modelé sur validations/jackpot.ts (mêmes verrous économiques : stock FINI
// OBLIGATOIRE, séparation CONTENU / RUN).
// ────────────────────────────────────────────────────────────

/** UUID générique partagé par les actions (contenu, session, remote). */
const uuid = z.string().uuid("Identifiant invalide");

// ── Parcours public (clients du commerçant) ──

/** Pseudo saisi au join, affiché au classement — 1..24 (miroir CHECK SQL). */
const pseudoSchema = z
  .string()
  .trim()
  .min(1, "Votre pseudo est requis")
  .max(24, "Pseudo trop long (24 caractères max)");

/** Clé d'avatar : validée contre le catalogue applicatif, vide accepté. */
const avatarSchema = z
  .string()
  .trim()
  .max(20)
  .refine((value) => value === "" || isAvatarId(value), {
    message: "Avatar inconnu",
  })
  .default("");

/**
 * Code d'accès court d'une session (QR / URL). Alphabet sans ambiguïté
 * (I/O/0/1 exclus), 6 caractères — miroir du CHECK SQL et du trigger. Casse et
 * espaces autour tolérés (la RPC applique upper + btrim).
 */
export const eventJoinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/, "Code d'accès invalide");

/** Rejoindre une session par son code (POST du bouton). */
export const joinEventSchema = z.object({
  joinCode: eventJoinCodeSchema,
  pseudo: pseudoSchema,
  avatar: avatarSchema,
});

/** Soumettre une réponse : session + question + option (tous UUID). */
export const submitEventAnswerSchema = z.object({
  sessionId: uuid,
  questionId: uuid,
  optionId: uuid,
});

/** Repli polling : l'état public d'une session par son UUID. */
export const eventStateSchema = z.object({
  sessionId: uuid,
});

// ── Télécommande organisateur — machine à états ──

export const eventSessionIdSchema = z.object({
  sessionId: uuid,
});

/**
 * Révélation : en mode prono l'organisateur DÉSIGNE l'option gagnante (UUID) ;
 * en quiz / poll elle est omise ('' → undefined). La RPC exige l'option pour un
 * prono et l'ignore sinon.
 */
export const revealEventQuestionSchema = z.object({
  sessionId: uuid,
  correctOptionId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    uuid.optional(),
  ),
});

export const launchEventQuestionSchema = z.object({
  sessionId: uuid,
  questionId: uuid,
});

// ── CRUD contenu — games / questions / options ──

/** Nom d'un jeu — 1..120 (miroir CHECK SQL). */
const gameNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom du jeu est requis")
  .max(120, "Nom trop long (120 caractères max)");

export const eventQuestionTypeSchema = z.enum(["quiz", "poll", "prono"]);

export const createEventGameSchema = z.object({
  name: gameNameSchema,
});

export const updateEventGameSchema = z.object({
  id: uuid,
  name: gameNameSchema,
});

export const setEventGameStatusSchema = z.object({
  id: uuid,
  status: z.enum(["draft", "active", "archived"]),
});

export const deleteEventGameSchema = z.object({
  id: uuid,
});

/** Fenêtre de réponse en secondes, 5..300 (miroir CHECK SQL). */
const timeLimitSchema = z.coerce
  .number()
  .int("Nombre entier de secondes requis")
  .min(5, "Fenêtre trop courte (5 s minimum)")
  .max(300, "Fenêtre trop longue (300 s maximum)");

/** Points de base d'une question, 0..100000 (miroir CHECK SQL). */
const pointsBaseSchema = z.coerce
  .number()
  .int("Nombre entier requis")
  .min(0, "Valeur négative interdite")
  .max(100_000, "Trop de points (100000 max)");

/** Intitulé d'une question, 1..500 (miroir CHECK SQL). */
const promptSchema = z
  .string()
  .trim()
  .min(1, "L'intitulé de la question est requis")
  .max(500, "Intitulé trop long (500 caractères max)");

/** Libellé d'une option, 1..200 (miroir CHECK SQL). */
const optionLabelSchema = z
  .string()
  .trim()
  .min(1, "Le libellé de l'option est requis")
  .max(200, "Libellé trop long (200 caractères max)");

/**
 * Une option à créer/mettre à jour. `is_correct` n'a de sens qu'en quiz : le
 * refine de la question vérifie qu'un quiz porte EXACTEMENT une option correcte,
 * et qu'un poll / prono n'en porte aucune (miroir des invariants du moteur).
 */
const optionInputSchema = z.object({
  label: optionLabelSchema,
  is_correct: z.coerce.boolean().default(false),
});

/**
 * Corps commun d'une question : >= 2 options ; cohérence type ↔ corrections.
 *  · quiz  ⇒ exactement 1 option correcte ;
 *  · poll  ⇒ aucune (sondage sans score) ;
 *  · prono ⇒ aucune à la création (désignée au reveal).
 */
function refineQuestion(
  d: {
    question_type: "quiz" | "poll" | "prono";
    options: Array<{ is_correct: boolean }>;
  },
  ctx: z.RefinementCtx,
) {
  const correct = d.options.filter((o) => o.is_correct).length;
  if (d.question_type === "quiz" && correct !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "Un quiz doit avoir exactement une bonne réponse.",
    });
  }
  if (d.question_type !== "quiz" && correct > 0) {
    const label = d.question_type === "poll" ? "sondage" : "pronostic";
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: `Un ${label} ne définit aucune bonne réponse à l'avance.`,
    });
  }
}

export const createEventQuestionSchema = z
  .object({
    game_id: uuid,
    question_type: eventQuestionTypeSchema,
    prompt: promptSchema,
    time_limit_seconds: timeLimitSchema,
    points_base: pointsBaseSchema,
    options: z.array(optionInputSchema).min(2, "Ajoutez au moins deux options."),
  })
  .superRefine(refineQuestion);

export const updateEventQuestionSchema = z
  .object({
    id: uuid,
    question_type: eventQuestionTypeSchema,
    prompt: promptSchema,
    time_limit_seconds: timeLimitSchema,
    points_base: pointsBaseSchema,
    options: z.array(optionInputSchema).min(2, "Ajoutez au moins deux options."),
  })
  .superRefine(refineQuestion);

export const deleteEventQuestionSchema = z.object({
  id: uuid,
});

// ── Sessions (un DÉROULÉ live d'un game) ──

/** Étiquette libre de la soirée — facultative, 0..120 (miroir CHECK SQL). */
const sessionLabelSchema = z
  .string()
  .trim()
  .max(120, "Étiquette trop longue (120 caractères max)")
  .default("");

/** Libellé du lot — facultatif, borné 0..120 (miroir CHECK SQL). */
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
 * reward_stock >= 0). '' → 0 (« podium seul, aucun code émis »), état non
 * destructeur. Aucun tirage n'émet plus de codes qu'il n'en reste.
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

export const createEventSessionSchema = z.object({
  game_id: uuid,
  label: sessionLabelSchema,
  reward_label: rewardLabelSchema,
  reward_details: rewardDetailsSchema,
  reward_stock: rewardStockSchema,
});

export const updateEventSessionSchema = z.object({
  id: uuid,
  label: sessionLabelSchema,
  reward_label: rewardLabelSchema,
  reward_details: rewardDetailsSchema,
  reward_stock: rewardStockSchema,
});

export const deleteEventSessionSchema = z.object({
  id: uuid,
});

// ── Caisse (remise en caisse) ──

/**
 * Code de retrait présenté en caisse (EVENT-XXXXXXXX). Casse et espaces autour
 * tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL). Miroir strict de
 * jackpotRedeemCodeSchema.
 */
export const eventRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^EVENT-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");
