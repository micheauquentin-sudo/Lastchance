import { z } from "zod";
import { isAvatarId } from "@/lib/avatars";
import {
  formatPlayerAlias,
  isAllowedPlayerAlias,
} from "@/lib/player-alias";
import { entierRequis } from "@/lib/validations/champ-formulaire";
import { codeTtlDaysSchema } from "@/lib/validations/reward-expiry";

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

/**
 * Pseudo saisi au join, affiché au classement et sur l'écran public — 1..24
 * (miroir CHECK SQL). Les caractères de CONTRÔLE et de FORMATAGE Unicode
 * (Cc/Cf : bidi override U+202E, zéro-largeur, etc.) sont refusés : pas de
 * risque XSS (React échappe), mais ils brouilleraient l'affichage TV ou
 * permettraient d'usurper visuellement le pseudo d'un autre joueur.
 */
const pseudoSchema = z
  .string()
  .transform(formatPlayerAlias)
  .pipe(
    z
      .string()
      .min(1, "Votre pseudo est requis")
      .max(24, "Pseudo trop long (24 caractères max)")
      .refine(isAllowedPlayerAlias, {
        message: "Choisissez un autre pseudo",
      }),
  );

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

export const moderateEventPlayerSchema = z.object({
  sessionId: uuid,
  playerId: uuid,
  moderationState: z.enum(["active", "hidden", "banned"]),
  reason: z.string().trim().max(300, "Motif trop long").optional(),
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

/**
 * Points de base d'une question, 0..100000 (miroir CHECK SQL).
 *
 * `null` REFUSÉ plutôt que lu 0 : 0 point est un réglage valide (question hors
 * score), donc rien ne distinguait une question volontairement neutre d'une
 * valeur perdue en route.
 */
const pointsBaseSchema = entierRequis({
  absent: "Indiquez les points de cette question (0 pour une question sans score).",
  nombre: "Points invalides",
  entier: "Nombre entier requis",
  min: [0, "Valeur négative interdite"],
  max: [100_000, "Trop de points (100000 max)"],
});

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
  // Échéance du code EVENT- (null = sans limite). La parente est la SESSION,
  // pas le jeu au-dessus : deux soirées du même jeu peuvent régler des
  // échéances différentes. `.optional()` : le champ n'est écrit que si
  // l'appelant le porte — voir la garde côté action.
  code_ttl_days: codeTtlDaysSchema.optional(),
});

export const deleteEventSessionSchema = z.object({
  id: uuid,
});

/**
 * Marqueur du refus « des lots EVENT- de cette soirée n'ont pas été retirés ».
 *
 * `deleteEventSession` le place dans son message et l'écran s'en sert pour ne
 * montrer la case de confirmation qu'APRÈS ce refus précis. Sans lui, la case
 * « Je comprends que les codes non retirés deviendront introuvables »
 * apparaissait sur N'IMPORTE quel échec — « Suppression impossible », erreur
 * réseau, données invalides —, où elle ne veut rien dire. L'effet est
 * pédagogique et il compte : on entraînait le commerçant à cocher une
 * confirmation destructive dans des situations vides, puis à la cocher par
 * réflexe le jour où elle protège de vrais codes. Même forme que
 * `HUNT_STEP_LOSS_HINT` et `CALENDAR_DAY_LOSS_HINT` : partagé plutôt que
 * recopié, les deux côtés doivent bouger ensemble, et un test le vérifie.
 */
export const EVENT_SESSION_LOSS_HINT = "Cochez la case de confirmation";

/**
 * Marqueur du refus « supprimer cette manche efface les réponses déjà
 * données ».
 *
 * MÊME VALEUR que `EVENT_SESSION_LOSS_HINT`, et pourtant une constante
 * DISTINCTE : le registre `destructive-confirm-coverage.test.ts` exige que les
 * onze marqueurs disent exactement la même chose au commerçant (une seule
 * instruction à relire, quel que soit le module), et exige en même temps que
 * chaque garde importe LE marqueur de SON refus. Les deux cases vivent dans le
 * même écran (`event-editor.tsx`) : partager la constante ferait apparaître la
 * case qui parle de codes EVENT- sous un refus qui parle de réponses, et le
 * jour où l'une des deux phrases change, l'autre bougerait sans que rien ne
 * rougisse.
 *
 * Le champ de formulaire est `confirm_answers_loss`, distinct de
 * `confirm_outstanding` déjà porté par la suppression de session dans ce même
 * fichier d'écran : `conditionAutour` ne sait remonter que jusqu'à la PREMIÈRE
 * occurrence d'un nom de champ.
 */
export const EVENT_QUESTION_LOSS_HINT = "Cochez la case de confirmation";

/**
 * Marqueur du refus « intervertir deux libellés réécrit le sens des réponses
 * déjà données ». Même doctrine que ci-dessus, et un marqueur DISTINCT de
 * `EVENT_SESSION_LOSS_HINT` : les deux refus vivent dans le même écran, et
 * un marqueur partagé ferait apparaître la mauvaise case sous le mauvais
 * message — celle qui parle de codes de retrait sous un refus qui parle de
 * réponses.
 *
 * La distinction entre une coquille corrigée (gratuite) et une permutation
 * (confirmée) est MESURÉE côté serveur — l'ensemble des libellés est-il
 * identique ? — et jamais devinée côté écran.
 */
export const EVENT_ANSWER_MEANING_HINT =
  "réponses déjà données seront rattachées";

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

// ────────────────────────────────────────────────────────────
// Générateur de questions (banque thématique partagée avec le quiz)
// ────────────────────────────────────────────────────────────

/**
 * GÉNÉRATION EN LOT depuis la banque thématique, côté Mode événement live.
 *
 * Jumeau de `genererQuestionsQuizSchema` : il ne valide QUE la commande. Les
 * questions produites repassent une à une par `createEventQuestionSchema` côté
 * action — y compris son `superRefine`, qui exige exactement une bonne réponse
 * pour un `quiz` et aucune pour un `poll` / `prono`.
 *
 * `graine` voyage depuis l'écran : c'est ce qui fait que la liste ÉCRITE est
 * celle qui a été prévisualisée. Aucune portée de sécurité.
 */
export const genererQuestionsEvenementSchema = z.object({
  game_id: uuid,
  themes: z
    .array(z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, "Thème invalide"))
    .max(40, "Trop de thèmes")
    .default([]),
  genres: z
    .array(z.enum(["question", "sondage", "pronostic"]))
    .min(1, "Choisissez au moins une nature de question")
    .max(3)
    .default(["question"]),
  mode: z.enum(["nombre", "duree"]).default("nombre"),
  nombre: z.coerce
    .number()
    .int("Nombre entier requis")
    .min(1, "Au moins une question")
    .max(60, "60 questions maximum en une fois")
    .default(10),
  minutes: z.coerce
    .number()
    .int("Nombre entier de minutes requis")
    .min(1, "Au moins une minute")
    .max(240, "4 heures maximum")
    .default(30),
  graine: z.coerce.number().int().min(0).max(2_147_483_647).default(1),
  difficulte_max: z.coerce
    .number()
    .int()
    .min(1, "Difficulté invalide")
    .max(3, "Difficulté invalide")
    .default(3),
});
