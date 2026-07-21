import { z } from "zod";
import { isAvatarId } from "@/lib/avatars";
import { COMPETITIONS } from "@/lib/competitions";
import { MAX_SCORE } from "@/lib/pronostics";

const contestNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom du championnat est requis")
  .max(120, "Nom trop long");

const competitionKeySchema = z
  .string()
  .refine((key) => COMPETITIONS.some((c) => c.key === key), {
    message: "Compétition inconnue",
  });

/** Points d'un palier du barème (0 accepté : palier désactivé). */
const scoringPointsSchema = z.coerce
  .number()
  .int("Points entiers uniquement")
  .min(0, "Points négatifs interdits")
  .max(100, "100 points maximum");

const scoreSchema = z.coerce
  .number()
  .int("Score entier uniquement")
  .min(0, "Score négatif interdit")
  .max(MAX_SCORE, `Score limité à ${MAX_SCORE}`);

export const createContestSchema = z.object({
  name: contestNameSchema,
  competition_key: competitionKeySchema,
});

/** Motif d'une correction sur un championnat verrouillé — journalisé
 *  tel quel dans audit_logs (10 caractères minimum, comme la RPC). */
export const contestReasonSchema = z
  .string()
  .trim()
  .max(300, "Motif trop long (300 caractères max)")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

export const updateContestSchema = z.object({
  id: z.string().uuid(),
  name: contestNameSchema.optional(),
  status: z.enum(["draft", "active", "finished"]).optional(),
  reason: contestReasonSchema,
  collect_email: z.boolean().optional(),
  collect_phone: z.boolean().optional(),
});

export const updateContestScoringSchema = z.object({
  id: z.string().uuid(),
  exact: scoringPointsSchema,
  diff: scoringPointsSchema,
  winner: scoringPointsSchema,
  reason: contestReasonSchema,
});

/** Récompenses par rang : bornes cohérentes, libellé requis. */
const rewardSchema = z
  .object({
    from: z.coerce.number().int().min(1, "Rang minimum : 1").max(999),
    to: z.coerce.number().int().min(1).max(999),
    label: z.string().trim().min(1, "Libellé requis").max(120, "Libellé trop long"),
  })
  .refine((r) => r.to >= r.from, {
    message: "Le rang de fin doit être ≥ au rang de début",
  });

const rewardsSchema = z
  .array(rewardSchema)
  .max(20, "20 paliers maximum")
  .superRefine((rewards, ctx) => {
    for (let i = 0; i < rewards.length; i += 1) {
      for (let j = i + 1; j < rewards.length; j += 1) {
        const overlaps =
          rewards[i].from <= rewards[j].to && rewards[j].from <= rewards[i].to;
        if (overlaps) {
          ctx.addIssue({
            code: "custom",
            path: [j, "from"],
            message: "Deux paliers de récompense se chevauchent",
          });
        }
      }
    }
  });

/** Le formulaire sérialise la liste des paliers en JSON (champ caché). */
export const updateContestRewardsSchema = z.object({
  id: z.string().uuid(),
  rewards: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Récompenses illisibles" });
        return z.NEVER;
      }
    })
    .pipe(rewardsSchema),
  reason: contestReasonSchema,
});

/** Réponse numérique à la question subsidiaire ('' = non renseignée). */
const tiebreakerNumberSchema = z.union([
  z.literal(""),
  z.coerce
    .number()
    .int("Nombre entier uniquement")
    .min(0, "Valeur négative interdite")
    .max(1000000, "Valeur trop grande"),
]);

export const updateContestTiebreakerSchema = z.object({
  id: z.string().uuid(),
  question: z.string().trim().max(160, "Question trop longue (160 caractères max)").default(""),
  answer: tiebreakerNumberSchema.default(""),
});

export const finalizeContestSchema = z.object({
  id: z.string().uuid(),
  tiebreaker_answer: tiebreakerNumberSchema.default(""),
});

export const setAwardStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["delivered", "cancelled"]),
  reason: contestReasonSchema,
});

export const deleteContestSchema = z.object({
  id: z.string().uuid(),
});

/** Nom libre d'un participant (compétition « custom » sans catalogue). */
const participantNameSchema = z
  .string()
  .trim()
  .min(1, "Nom du participant requis")
  .max(60, "Nom trop long");

export const addMatchSchema = z.object({
  contest_id: z.string().uuid(),
  /** Clé catalogue — vide pour un participant libre (custom). */
  home_key: z.string().max(40).default(""),
  away_key: z.string().max(40).default(""),
  home_name: participantNameSchema,
  away_name: participantNameSchema,
  kickoff_at: z.coerce.date({ message: "Date de coup d'envoi invalide" }),
});

export const deleteMatchSchema = z.object({
  id: z.string().uuid(),
  reason: contestReasonSchema,
});

export const setMatchResultSchema = z.object({
  id: z.string().uuid(),
  home_score: scoreSchema,
  away_score: scoreSchema,
});

export const syncContestSchema = z.object({
  id: z.string().uuid(),
});

// ── Parcours public (clients du commerçant) ──

/** Pseudo affiché au classement. */
const nicknameSchema = z
  .string()
  .trim()
  .min(1, "Votre pseudo est requis")
  .max(30, "Pseudo trop long (30 caractères max)");

/** Clé d'avatar : validée contre le catalogue applicatif, vide accepté. */
const avatarSchema = z
  .string()
  .trim()
  .max(20)
  .refine((value) => value === "" || isAvatarId(value), {
    message: "Avatar inconnu",
  })
  .default("");

export const registerPlayerSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  first_name: nicknameSchema,
  avatar: avatarSchema,
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email("Email invalide").max(254)])
    .default(""),
  phone: z
    .union([
      z.literal(""),
      z.string().trim().regex(/^\+?[0-9 .-]{6,20}$/, "Numéro de téléphone invalide"),
    ])
    .default(""),
  accepted_terms: z.literal(true, {
    error: "Vous devez accepter le règlement et la politique de confidentialité",
  }),
  /** Réponse à la question subsidiaire (départage) — '' si absente. */
  tiebreaker_guess: tiebreakerNumberSchema.default(""),
});

/** Modification du profil joueur (pseudo + avatar) après inscription. */
export const updatePlayerSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  first_name: nicknameSchema,
  avatar: avatarSchema,
});

/** Demande de lien de récupération d'identité (email obligatoire). */
export const recoveryRequestSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email("Email invalide").max(254),
});

/** Confirmation du lien magique (jeton opaque de l'URL). */
export const recoveryConfirmSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  token: z.string().trim().min(20).max(80),
});

export const submitPredictionSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  match_id: z.string().uuid(),
  home_score: scoreSchema,
  away_score: scoreSchema,
});
