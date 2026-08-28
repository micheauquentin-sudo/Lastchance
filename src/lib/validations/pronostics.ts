import { z } from "zod";
import { fondKeySchema } from "@/lib/validations/calendar";
import { isValidLocalDateTime } from "@/lib/date-time";
import { isAvatarId } from "@/lib/avatars";
import { COMPETITIONS } from "@/lib/competitions";
import {
  absentSiNonRendu,
  entierRequis,
  nombreRequis,
  texteOptionnel,
  videSiNonRendu,
} from "@/lib/validations/champ-formulaire";
import {
  DEFAULT_EVENT_KIND,
  EVENT_KIND_PATTERN,
  MAX_SCORE,
  NUMBER_ANSWER_MAX,
  OPTION_ID_PATTERN,
  OPTION_LABEL_MAX,
  OPTIONS_MAX,
  OPTIONS_MIN,
  QUESTION_PROMPT_MAX,
  type ContestQuestionOption,
  type ContestQuestionType,
} from "@/lib/pronostics";
import { SEASONAL_THEMES } from "@/lib/seasonal-theme";

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

/**
 * Points d'un palier du barème (0 accepté : palier désactivé).
 *
 * Le `0` saisi est une VALEUR MÉTIER — « ce palier ne rapporte rien » — et
 * c'est précisément ce qui rendait le mode silencieux indétectable ici : un
 * fieldset de barème non rendu arrivait en `null`, devenait 0 sur les TROIS
 * paliers, et le classement s'aplatissait sans qu'aucune erreur ne le dise.
 * Le refus explicite rétablit la distinction entre « il a mis zéro » et « on ne
 * lui a rien demandé ».
 */
const scoringPointsSchema = entierRequis({
  absent: "Barème incomplet : indiquez les points de chaque palier.",
  nombre: "Points invalides",
  entier: "Points entiers uniquement",
  min: [0, "Points négatifs interdits"],
  max: [100, "100 points maximum"],
});

const scoreSchema = entierRequis({
  absent: "Indiquez le score.",
  nombre: "Score invalide",
  entier: "Score entier uniquement",
  min: [0, "Score négatif interdit"],
  max: [MAX_SCORE, `Score limité à ${MAX_SCORE}`],
});

/**
 * Modèle d'événement — miroir du CHECK SQL (voir EVENT_KIND_PATTERN).
 * '' = non renseigné : la création retombe sur le football (rétrocompat
 * du parcours d'origine), les réglages le lisent comme « ne change pas »
 * (la RPC ignore un `p_event_kind` vide ou nul).
 */
const optionalEventKindSchema = texteOptionnel(
  z
    .string()
    .trim()
    .refine((value) => value === "" || EVENT_KIND_PATTERN.test(value), {
      message: "Modèle d'événement invalide",
    }),
);

/** Verrouillage par défaut de l'événement ('' = aucun / effacé). */
const optionalLocksAtSchema = videSiNonRendu(
  z.union([
    z.literal(""),
    z.string().trim().refine(isValidLocalDateTime, "Date de verrouillage invalide"),
  ]),
);

/** Clé du catalogue réservée à la saisie libre : un événement générique
 *  (cérémonie, élection…) n'a pas de compétition sportive. */
const GENERIC_COMPETITION_KEY = "custom";

/**
 * Création d'un championnat/événement.
 *
 * `event_kind` est le pivot : le FOOTBALL (défaut) garde sa compétition
 * du catalogue — donc l'import automatique du calendrier —, un événement
 * générique n'en a pas : sa clé retombe sur `custom` et aucune synchro
 * fournisseur ne le concerne.
 */
export const createContestSchema = z
  .object({
    name: contestNameSchema,
    competition_key: texteOptionnel(z.string().trim().max(40)),
    event_kind: optionalEventKindSchema,
    default_locks_at: optionalLocksAtSchema,
  })
  .superRefine((input, ctx) => {
    // La compétition n'est exigée (et validée contre le catalogue) que
    // pour le football : elle pilote le fournisseur de calendriers.
    const kind = input.event_kind || DEFAULT_EVENT_KIND;
    if (kind !== DEFAULT_EVENT_KIND) return;
    if (!competitionKeySchema.safeParse(input.competition_key).success) {
      ctx.addIssue({
        code: "custom",
        path: ["competition_key"],
        message: "Compétition inconnue",
      });
    }
  })
  .transform((input) => {
    const event_kind = input.event_kind || DEFAULT_EVENT_KIND;
    return {
      name: input.name,
      event_kind,
      competition_key:
        event_kind === DEFAULT_EVENT_KIND
          ? input.competition_key
          : GENERIC_COMPETITION_KEY,
      default_locks_at:
        input.default_locks_at === "" ? null : input.default_locks_at,
    };
  });

/** Motif d'une correction sur un championnat verrouillé — journalisé
 *  tel quel dans audit_logs (10 caractères minimum, comme la RPC). */
export const contestReasonSchema = z
  .string()
  .trim()
  .max(300, "Motif trop long (300 caractères max)")
  // `.nullable()` : le motif n'est rendu QUE sur un championnat verrouillé, donc
  // le champ est absent du formulaire la plupart du temps. Sans lui, chaque
  // appelant devait écrire `?? undefined` — et il en manquait.
  .nullable()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

/**
 * Durée de validité du code de retrait PRONO-…, en secondes — miroir
 * applicatif du CHECK SQL (1 h à 90 j). '' = pas d'expiration (null).
 *
 * Bornes VOLONTAIREMENT plus larges que `updateCampaignClaimSchema`
 * (10 s à 600 s) : le décompte de la roue part du joueur DEVANT la caisse,
 * celui d'un championnat part de sa clôture — le gagnant doit encore être
 * prévenu puis se déplacer.
 */
const codeTtlSecondsSchema = z
  .union([
    z.literal("").transform(() => null),
    z.coerce
      .number()
      .int("Nombre entier de secondes requis")
      .min(3600, "Minimum 3600 secondes (1 h)")
      .max(7776000, "Maximum 7776000 secondes (90 jours)"),
  ])
  .nullable();

/**
 * Mise à jour PARTIELLE d'un championnat : chaque champ absent laisse sa colonne
 * tranquille — quatre formulaires distincts appellent cette action et aucun ne
 * porte tous les champs.
 *
 * `code_ttl_seconds` est le SEUL à garder `.optional()` nu, et c'est délibéré :
 * pour lui, `null` (le champ n'est pas à l'écran) et `''` (le champ est à
 * l'écran, vidé = « sans limite ») disent deux choses DIFFÉRENTES. C'est le seul
 * champ du schéma dont l'absence ne peut pas se déduire de la valeur ; l'action
 * le lit donc par `formData.has(...)`, et cette dissymétrie est inscrite dans le
 * test de couverture plutôt que laissée à la mémoire.
 */
export const updateContestSchema = z.object({
  id: z.string().uuid(),
  name: absentSiNonRendu(contestNameSchema),
  status: absentSiNonRendu(z.enum(["draft", "active", "finished"])),
  reason: contestReasonSchema,
  collect_email: absentSiNonRendu(z.boolean()),
  collect_phone: absentSiNonRendu(z.boolean()),
  /**
   * Thème saisonnier — champ d'AFFICHAGE pur (aucune garde de publication,
   * aucune règle métier). Rendu par le seul panneau « Réglages » ; les autres
   * formulaires qui postent cette action ne le portent pas, donc `null`, donc
   * absent, donc la colonne n'est PAS touchée. C'est exactement le défaut que
   * `default_locks_at` a payé en V1.47, écrit ici dans le schéma plutôt que
   * réparé par un champ caché dans chacun des formulaires.
   *
   * Une valeur HORS palette reste refusée : la tolérance porte sur l'absence,
   * jamais sur la saisie (le repli sur « neutre » est réservé à la LECTURE,
   * voir `asSeasonalTheme`).
   */
  theme: absentSiNonRendu(z.enum(SEASONAL_THEMES)),
  /**
   * Fond d'écran — TROIS états, et `absentSiNonRendu` ne convient pas.
   *
   * Pour `theme`, « champ non rendu » et « absent » disent la même chose.
   * Ici non : `''` est une valeur LÉGITIME (« suivre le thème »), et c'est
   * même le défaut du formulaire. La confondre avec l'absence rendrait ce
   * choix inexprimable — exactement la dissymétrie de `code_ttl_seconds`
   * juste en dessous, et l'action la lit donc par `formData.has(...)`.
   */
  fond_key: fondKeySchema.optional(),
  code_ttl_seconds: codeTtlSecondsSchema.optional(),
});

// ── Caisse (remise en caisse) ──

/**
 * Code de retrait présenté en caisse (PRONO-XXXXXXXX). Casse et espaces
 * autour tolérés ; l'alphabet exclut I/O/0/1 (miroir du CHECK SQL). Miroir
 * strict de quizRedeemCodeSchema / referralRedeemCodeSchema.
 */
export const contestRedeemCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^PRONO-[A-HJ-NP-Z2-9]{8}$/, "Code de retrait invalide");

export const updateContestScoringSchema = z.object({
  id: z.string().uuid(),
  exact: scoringPointsSchema,
  diff: scoringPointsSchema,
  winner: scoringPointsSchema,
  reason: contestReasonSchema,
});

/**
 * Palier générique — miroir de `contest_scoring_points` côté SQL :
 * entier, 0 à 1 000 000 (0 = palier désactivé, `number_tolerance` = 0
 * désactivant le palier « proche »).
 */
const genericScoringPointsSchema = entierRequis({
  // Ce barème-ci arrive en JSON (champ caché), pas en `FormData` : un `null` y
  // est une CORRUPTION, pas un champ non rendu. Le refus vaut donc aussi — et
  // pour une raison plus forte : personne n'a jamais voulu ce zéro.
  absent: "Barème illisible : un palier vaut null.",
  nombre: "Valeur invalide",
  entier: "Points entiers uniquement",
  min: [0, "Valeur négative interdite"],
  max: [1000000, "Valeur trop grande"],
});

/**
 * Paliers génériques du barème (choice / ranking_* / number_*), envoyés
 * en JSON par le formulaire. Seules les clés PRÉSENTES sont écrites : la
 * RPC fusionne, `exact`/`diff`/`winner` restent du ressort de
 * `updateContestScoring` (chemin football inchangé).
 */
export const updateContestGenericScoringSchema = z.object({
  id: z.string().uuid(),
  values: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Barème illisible" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .object({
          choice: genericScoringPointsSchema.optional(),
          ranking_exact: genericScoringPointsSchema.optional(),
          ranking_partial: genericScoringPointsSchema.optional(),
          number_exact: genericScoringPointsSchema.optional(),
          number_close: genericScoringPointsSchema.optional(),
          number_tolerance: genericScoringPointsSchema.optional(),
        })
        .strict()
        .refine((values) => Object.keys(values).length > 0, {
          message: "Aucun palier à enregistrer",
        }),
    ),
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

/**
 * Réponse numérique à la question subsidiaire ('' = non renseignée).
 *
 * ⚠️ Ce schéma a longtemps été cité — dans `validations/admin.ts` — comme
 * PORTANT DÉJÀ la tolérance au champ non rendu. Il ne la portait pas : sans
 * `.nullable()`, un `null` traversait `z.coerce.number()` et devenait **0**,
 * qui est une réponse parfaitement valide à une question subsidiaire. Le
 * départage des ex æquo se faisait donc sur un zéro que personne n'avait saisi.
 * `videSiNonRendu` le ramène à `''` — « non renseignée » —, la seule lecture
 * honnête d'un champ absent.
 */
const tiebreakerNumberSchema = videSiNonRendu(
  z.union([
    z.literal(""),
    z.coerce
      .number()
      .int("Nombre entier uniquement")
      .min(0, "Valeur négative interdite")
      .max(1000000, "Valeur trop grande"),
  ]),
);

export const updateContestTiebreakerSchema = z.object({
  id: z.string().uuid(),
  question: texteOptionnel(
    z.string().trim().max(160, "Question trop longue (160 caractères max)"),
  ),
  answer: tiebreakerNumberSchema,
});

/**
 * Réglages de l'événement après création : modèle (figé dès le premier
 * pronostic/coup d'envoi, comme la question subsidiaire) et verrouillage
 * par défaut (toujours ajustable — événement reporté —, motif journalisé
 * une fois le championnat verrouillé).
 */
export const updateContestEventSettingsSchema = z.object({
  id: z.string().uuid(),
  event_kind: optionalEventKindSchema,
  default_locks_at: optionalLocksAtSchema,
  reason: contestReasonSchema,
});

export const finalizeContestSchema = z.object({
  id: z.string().uuid(),
  tiebreaker_answer: tiebreakerNumberSchema,
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
  home_key: texteOptionnel(z.string().max(40)),
  away_key: texteOptionnel(z.string().max(40)),
  home_name: participantNameSchema,
  away_name: participantNameSchema,
  kickoff_at: z
    .string()
    .trim()
    .refine(isValidLocalDateTime, "Date de coup d'envoi invalide"),
});

/**
 * Une ligne de la saisie rapide : mêmes règles qu'un match unitaire
 * (participant du catalogue via sa clé, ou saisie libre), avec le
 * contrôle « deux participants différents » porté par la ligne — l'UI
 * retrouve la ligne fautive via le chemin de l'issue (matchRowErrors).
 */
const matchRowSchema = z
  .object({
    home_key: z.string().max(40).default(""),
    away_key: z.string().max(40).default(""),
    home_name: participantNameSchema,
    away_name: participantNameSchema,
    kickoff_at: z
      .string()
      .trim()
      .refine(isValidLocalDateTime, "Date de coup d'envoi invalide"),
  })
  .superRefine((row, ctx) => {
    const sameKey = row.home_key !== "" && row.home_key === row.away_key;
    const sameName =
      row.home_name.localeCompare(row.away_name, "fr", {
        sensitivity: "base",
      }) === 0;
    if (sameKey || sameName) {
      ctx.addIssue({
        code: "custom",
        path: ["away_name"],
        message: "Choisissez deux participants différents",
      });
    }
  });

/** Saisie rapide : le formulaire sérialise les lignes en JSON (champ
 *  caché), comme les paliers de récompenses. */
export const addMatchesSchema = z.object({
  contest_id: z.string().uuid(),
  matches: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Lignes de matchs illisibles" });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(matchRowSchema)
        .min(1, "Ajoutez au moins un match")
        .max(30, "30 matchs maximum par saisie"),
    ),
});

/** Erreur attachée à une ligne précise de la saisie rapide. */
export interface MatchRowError {
  /** Index (0-based) de la ligne fautive dans le tableau soumis. */
  index: number;
  message: string;
}

/**
 * Redistribue les erreurs Zod de la saisie en lot : celles portées par
 * une ligne (chemin matches[i].champ) deviennent des MatchRowError que
 * l'UI surligne, le reste alimente le message global.
 */
export function matchRowErrors(error: z.ZodError): {
  error: string;
  rowErrors: MatchRowError[];
} {
  const rowErrors: MatchRowError[] = [];
  let global: string | null = null;
  for (const issue of error.issues) {
    if (issue.path[0] === "matches" && typeof issue.path[1] === "number") {
      rowErrors.push({ index: issue.path[1], message: issue.message });
    } else if (!global) {
      global = issue.message;
    }
  }
  return {
    error:
      global ??
      (rowErrors.length > 0
        ? `Ligne ${rowErrors[0].index + 1} : ${rowErrors[0].message}`
        : "Données invalides"),
    rowErrors,
  };
}

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

/**
 * Une JOURNÉE du calendrier complet, telle que le commerçant la demande.
 *
 * Borne haute à 99 : aucune compétition du catalogue n'en compte autant
 * (34 en Ligue 1, 5 au Tournoi), et elle borne surtout ce qu'un appelant
 * forgé peut faire demander au fournisseur — un numéro de journée voyage
 * dans l'URL d'un appel sortant.
 */
export const contestRoundSchema = z.object({
  id: z.string().uuid(),
  round: z.coerce
    .number()
    .int("Journée invalide")
    .min(1, "Journée invalide")
    .max(99, "Journée invalide"),
});

// ── Questions génériques (choice / ranking / number) ──
//
// Toutes les bornes ci-dessous sont le miroir applicatif des fonctions
// SQL is_valid_contest_options / is_valid_contest_question /
// is_valid_contest_answer : le serveur revalide de toute façon en base,
// ces schémas servent à rendre un message lisible au commerçant et au
// joueur, jamais de barrière unique.

const questionPromptSchema = z
  .string()
  .trim()
  .min(1, "L'intitulé de la question est requis")
  .max(QUESTION_PROMPT_MAX, `Intitulé trop long (${QUESTION_PROMPT_MAX} caractères max)`);

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

/** Liste d'options : 0 entrée acceptée ici (le type `number` n'en a pas),
 *  le minimum de 2 est exigé par type dans le superRefine de la question. */
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

/** Taille du top N ('' = non renseignée, hors ranking). */
const rankingSizeSchema = z.union([
  z.literal(""),
  z.coerce
    .number()
    .int("Nombre entier uniquement")
    .min(OPTIONS_MIN, `Classez au moins ${OPTIONS_MIN} éléments`)
    .max(OPTIONS_MAX, `${OPTIONS_MAX} éléments maximum`),
]);

/**
 * Création d'une question générique. Le football garde `addMatchSchema` :
 * son chemin de création n'est pas touché.
 *
 * Une seule date est demandée (`locks_at`) : elle sert d'échéance de
 * l'événement et de verrouillage, comme le coup d'envoi pour un match.
 */
export const addContestQuestionSchema = z
  .object({
    contest_id: z.string().uuid(),
    question_type: z.enum(["choice", "ranking", "number"]),
    prompt: questionPromptSchema,
    // Le formulaire sérialise les options en JSON (champ caché), comme
    // les paliers de récompenses et la saisie rapide de matchs.
    options: texteOptionnel(z.string(), "[]")
      .transform((raw, ctx) => {
        try {
          return JSON.parse(raw || "[]") as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Options illisibles" });
          return z.NEVER;
        }
      })
      .pipe(questionOptionsSchema),
    ranking_size: rankingSizeSchema,
    locks_at: z
      .string()
      .trim()
      .refine(isValidLocalDateTime, "Date de verrouillage invalide"),
  })
  .superRefine((question, ctx) => {
    const { question_type: type, options, ranking_size: size } = question;

    if (type === "number") {
      if (options.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Une estimation chiffrée ne prend pas d'options",
        });
      }
      if (size !== "") {
        ctx.addIssue({
          code: "custom",
          path: ["ranking_size"],
          message: "Une estimation chiffrée n'a pas de top N",
        });
      }
      return;
    }

    if (options.length < OPTIONS_MIN) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `Proposez au moins ${OPTIONS_MIN} options`,
      });
    }

    if (type === "choice" && size !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["ranking_size"],
        message: "Un choix unique n'a pas de top N",
      });
    }

    if (type === "ranking") {
      if (size === "") {
        ctx.addIssue({
          code: "custom",
          path: ["ranking_size"],
          message: "Indiquez le nombre d'éléments à classer",
        });
      } else if (size > options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["ranking_size"],
          message: "Le top N ne peut pas dépasser le nombre d'options",
        });
      }
    }
  });

/**
 * Réponse générique, avant confrontation à la question visée. `score`
 * reste porté par home_score/away_score (chemin football inchangé).
 */
export const contestAnswerInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("score"),
    home: scoreSchema,
    away: scoreSchema,
  }),
  z.object({
    type: z.literal("choice"),
    optionId: optionIdSchema,
  }),
  z.object({
    type: z.literal("ranking"),
    order: z
      .array(optionIdSchema)
      .min(OPTIONS_MIN, `Classez au moins ${OPTIONS_MIN} éléments`)
      .max(OPTIONS_MAX, `${OPTIONS_MAX} éléments maximum`),
  }),
  z.object({
    type: z.literal("number"),
    // `null` REFUSÉ et non lu comme 0 : une estimation chiffrée à zéro est une
    // réponse valide, et rien ne la distinguait d'une réponse manquante.
    value: nombreRequis({
      absent: "Indiquez votre estimation.",
      nombre: "Valeur invalide",
      min: [-NUMBER_ANSWER_MAX, "Valeur trop petite"],
      max: [NUMBER_ANSWER_MAX, "Valeur trop grande"],
    }),
  }),
]);

/** Question contre laquelle une réponse est validée. */
export interface AnsweredQuestionShape {
  question_type: ContestQuestionType;
  options: ContestQuestionOption[];
  ranking_size: number | null;
}

/**
 * Réponse validée CONTRE la question visée — miroir applicatif de
 * `is_valid_contest_answer` : type cohérent, option connue, top N de la
 * bonne taille et sans doublon. La forme reste revalidée en SQL.
 */
export function contestAnswerSchema(question: AnsweredQuestionShape) {
  const optionIds = new Set(question.options.map((option) => option.id));
  return contestAnswerInputSchema.superRefine((answer, ctx) => {
    if (answer.type !== question.question_type) {
      ctx.addIssue({
        code: "custom",
        message: "Réponse incompatible avec cette question",
      });
      return;
    }

    if (answer.type === "choice" && !optionIds.has(answer.optionId)) {
      ctx.addIssue({
        code: "custom",
        path: ["optionId"],
        message: "Option inconnue",
      });
    }

    if (answer.type === "ranking") {
      const size = question.ranking_size ?? 0;
      if (size < OPTIONS_MIN || answer.order.length !== size) {
        ctx.addIssue({
          code: "custom",
          path: ["order"],
          message: `Classez exactement ${size} éléments`,
        });
      }
      if (new Set(answer.order).size !== answer.order.length) {
        ctx.addIssue({
          code: "custom",
          path: ["order"],
          message: "Un même élément ne peut pas être classé deux fois",
        });
      }
      if (answer.order.some((id) => !optionIds.has(id))) {
        ctx.addIssue({
          code: "custom",
          path: ["order"],
          message: "Option inconnue",
        });
      }
    }
  });
}

/** Enveloppe d'une réponse joueur : la réponse elle-même est validée
 *  ensuite contre la question chargée en base (contestAnswerSchema). */
export const submitAnswerSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  match_id: z.string().uuid(),
});

/** Enveloppe de la saisie du résultat d'une question générique. */
export const setQuestionResultSchema = z.object({
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
  tiebreaker_guess: tiebreakerNumberSchema,
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

/**
 * UN LOT de pronostics — la grille remplie d'un coup.
 *
 * Le joueur pose ses scores sur toute une journée puis valide UNE fois ;
 * il n'a aucune raison d'appuyer neuf fois sur neuf boutons.
 *
 * ── LA BORNE À 60, ET POURQUOI ELLE N'EST PAS « LE NOMBRE DE MATCHS » ──
 *
 * Une journée de championnat en compte 9, une grille entière rarement plus
 * de 20. 60 laisse la marge d'un commerçant qui aurait importé plusieurs
 * journées, tout en bornant ce qu'un appelant forgé peut faire exécuter de
 * RPC en une requête — le lot est traité match par match côté serveur.
 *
 * `min(1)` : un lot vide n'est pas une erreur du joueur, c'est un appel qui
 * n'a rien à faire là.
 */
export const submitPredictionsSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  predictions: z
    .array(
      z.object({
        match_id: z.string().uuid(),
        home_score: scoreSchema,
        away_score: scoreSchema,
      }),
    )
    .min(1, "Aucun pronostic à enregistrer")
    .max(60, "Trop de pronostics en une seule fois"),
});

// ── Ligues privées (parcours joueur) ──

/** Nom d'une ligue privée — mêmes bornes que le CHECK SQL (1..40). */
const leagueNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la ligue est requis")
  .max(40, "Nom trop long (40 caractères max)");

export const createLeagueSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  name: leagueNameSchema,
});

/** Code d'invitation saisi par le joueur : 6 à 8 alphanumériques, casse
 *  et espaces autour tolérés (la RPC compare en majuscules). */
export const joinLeagueSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,8}$/, "Code d'invitation invalide"),
});

export const leaveLeagueSchema = z.object({
  slug: z.string().trim().min(1).max(60),
  league_id: z.string().uuid(),
});
