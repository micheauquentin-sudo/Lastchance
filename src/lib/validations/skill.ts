import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Jeux rapides · VAGUE 2 — schémas des DÉFIS *skill-gated*
//
// 6 mécaniques où la RÉUSSITE au défi conditionne le tirage (migration
// 20260731120000_quick_games_skill) : rps, reflex, gauge, puzzle,
// mystery_word, estimate. Ce module est NEUTRE (aucun import server-only) :
// il ne fait que décrire la FORME des données. Le moteur d'évaluation, la vue
// publique et le jeton signé vivent dans src/lib/skill.ts.
//
// Deux familles de schémas :
//   • CONFIG (skill_config d'une roue) — validée à l'enregistrement commerçant
//     ET relue côté serveur avant chaque défi. Peut contenir des SECRETS
//     (mystery_word.word, estimate.target/tolerance, puzzle.order) qui ne
//     sortent JAMAIS au client (cf. toPublicChallenge dans skill.ts).
//   • ATTEMPT (tentative du joueur) — validée à la soumission, par game_type.
//
// Bornes miroir du CHECK SQL wheels_skill_config_size_check (<= 8192 octets).
// ────────────────────────────────────────────────────────────

/** Les 6 game_type de DÉFI (sous-ensemble strict de GameType). */
export const SKILL_GAME_TYPES = [
  "rps",
  "reflex",
  "gauge",
  "puzzle",
  "mystery_word",
  "estimate",
] as const;

export type SkillGameType = (typeof SKILL_GAME_TYPES)[number];

export const skillGameTypeSchema = z.enum(SKILL_GAME_TYPES);

/** Garde de type : `game_type` appartient-il aux jeux de DÉFI ? */
export function isSkillGameType(value: unknown): value is SkillGameType {
  return (
    typeof value === "string" &&
    (SKILL_GAME_TYPES as readonly string[]).includes(value)
  );
}

/** Coup de pierre-feuille-ciseaux. */
export const RPS_MOVES = ["rock", "paper", "scissors"] as const;
export type RpsMove = (typeof RPS_MOVES)[number];

// Chaîne facultative → null ('' compris) : un indice/légende absent vaut null.
const optionalText = (max: number) =>
  z
    .union([z.literal("").transform(() => null), z.string().trim().max(max)])
    .nullable()
    .default(null);

// ────────────────────────────────────────────────────────────
// CONFIG par game_type (skill_config). Sortie = objet de STOCKAGE (non taggé) :
// le game_type reste porté par la colonne wheels.game_type, jamais dupliqué ici.
// ────────────────────────────────────────────────────────────

/** rps : aucun secret configurable — le coup serveur dérive du serverSeed. */
const rpsConfigSchema = z.object({}).strip();

/** reflex : fenêtre de réaction (PUBLIQUE — non vérifiable serveur). */
const reflexConfigSchema = z.object({
  durationMs: z.coerce
    .number()
    .int("Durée entière requise")
    .min(200, "Durée minimale 200 ms")
    .max(10_000, "Durée maximale 10 000 ms"),
});

/** gauge : tolérance de la zone cible en % (PUBLIQUE — non vérifiable serveur). */
const gaugeConfigSchema = z.object({
  tolerancePct: z.coerce
    .number()
    .int("Tolérance entière requise")
    .min(1, "Tolérance minimale 1 %")
    .max(50, "Tolérance maximale 50 %"),
});

/**
 * puzzle : fragments affichés (PUBLICS) + ordre attendu (SECRET). `order` est
 * une permutation des indices [0..n-1] — la solution que le serveur vérifie sans
 * jamais l'exposer.
 */
const puzzleConfigSchema = z
  .object({
    fragments: z
      .array(z.string().trim().min(1, "Fragment vide").max(40, "Fragment trop long"))
      .min(2, "Au moins 2 fragments")
      .max(8, "8 fragments maximum"),
    order: z
      .array(z.coerce.number().int().min(0).max(7))
      .min(2, "Ordre invalide")
      .max(8, "Ordre invalide"),
  })
  .superRefine((c, ctx) => {
    if (c.order.length !== c.fragments.length) {
      ctx.addIssue({
        code: "custom",
        path: ["order"],
        message: "L'ordre doit couvrir tous les fragments",
      });
      return;
    }
    const sorted = [...c.order].sort((a, b) => a - b);
    if (!sorted.every((v, i) => v === i)) {
      ctx.addIssue({
        code: "custom",
        path: ["order"],
        message: "L'ordre doit être une permutation des fragments",
      });
    }
  });

/** mystery_word : mot SECRET + indice public facultatif. */
const mysteryWordConfigSchema = z.object({
  word: z
    .string()
    .trim()
    .min(1, "Le mot à deviner est requis")
    .max(40, "Mot trop long (40 caractères max)"),
  hint: optionalText(120),
});

/** estimate : cible + tolérance SECRÈTES, habillage public facultatif. */
const estimateConfigSchema = z.object({
  target: z.coerce
    .number()
    .int("Valeur cible entière requise")
    .min(-1_000_000_000, "Valeur cible hors bornes")
    .max(1_000_000_000, "Valeur cible hors bornes"),
  tolerance: z.coerce
    .number()
    .int("Tolérance entière requise")
    .min(0, "Tolérance négative interdite")
    .max(1_000_000_000, "Tolérance hors bornes"),
  question: optionalText(200),
  unit: optionalText(20),
  imageUrl: z
    .union([
      z.literal("").transform(() => null),
      z
        .string()
        .trim()
        .max(2048, "URL trop longue")
        .refine((v) => /^https?:\/\//.test(v), "URL invalide"),
    ])
    .nullable()
    .default(null),
});

/** Table des schémas de CONFIG par game_type. */
const SKILL_CONFIG_SCHEMAS = {
  rps: rpsConfigSchema,
  reflex: reflexConfigSchema,
  gauge: gaugeConfigSchema,
  puzzle: puzzleConfigSchema,
  mystery_word: mysteryWordConfigSchema,
  estimate: estimateConfigSchema,
} as const;

export type RpsConfig = z.infer<typeof rpsConfigSchema>;
export type ReflexConfig = z.infer<typeof reflexConfigSchema>;
export type GaugeConfig = z.infer<typeof gaugeConfigSchema>;
export type PuzzleConfig = z.infer<typeof puzzleConfigSchema>;
export type MysteryWordConfig = z.infer<typeof mysteryWordConfigSchema>;
export type EstimateConfig = z.infer<typeof estimateConfigSchema>;

/** Union (non taggée) de toutes les configs — le game_type porte le tag. */
export type SkillConfig =
  | RpsConfig
  | ReflexConfig
  | GaugeConfig
  | PuzzleConfig
  | MysteryWordConfig
  | EstimateConfig;

export type ParseSkillConfigResult =
  | { ok: true; config: SkillConfig }
  | { ok: false; error: string };

/**
 * Valide `raw` (jsonb libre) contre le schéma du game_type. `raw` absent est
 * toléré pour rps (aucune config) ; les autres jeux exigent leur objet. Utilisé
 * à l'enregistrement commerçant ET à la relecture serveur avant chaque défi.
 */
export function parseSkillConfig(
  gameType: SkillGameType,
  raw: unknown,
): ParseSkillConfigResult {
  const schema = SKILL_CONFIG_SCHEMAS[gameType];
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Défi mal configuré" };
  }
  return { ok: true, config: result.data as SkillConfig };
}

// ────────────────────────────────────────────────────────────
// ATTEMPT par game_type (tentative du joueur). Sortie TAGGÉE par gameType.
// ────────────────────────────────────────────────────────────

/** Tentative du joueur, discriminée par gameType (produite après le token). */
export type SkillAttempt =
  | { gameType: "rps"; move: RpsMove }
  | { gameType: "reflex"; succeeded: boolean }
  | { gameType: "gauge"; succeeded: boolean }
  | { gameType: "puzzle"; order: number[] }
  | { gameType: "mystery_word"; guess: string }
  | { gameType: "estimate"; value: number };

const rpsAttemptSchema = z
  .object({ move: z.enum(RPS_MOVES) })
  .transform((a) => ({ gameType: "rps" as const, move: a.move }));

// reflex / gauge : succès NON vérifiable serveur → RAPPORTÉ par le client
// (booléen). Ce n'est PAS une faille : le tirage sur succès reste plafonné par
// les poids/stocks configurés (perform_atomic_spin, ADR-031) — un client qui
// « réussit » toujours ne dépasse jamais les probabilités de la roue.
const reflexAttemptSchema = z
  .object({ succeeded: z.coerce.boolean() })
  .transform((a) => ({ gameType: "reflex" as const, succeeded: a.succeeded }));

const gaugeAttemptSchema = z
  .object({ succeeded: z.coerce.boolean() })
  .transform((a) => ({ gameType: "gauge" as const, succeeded: a.succeeded }));

const puzzleAttemptSchema = z
  .object({
    order: z
      .array(z.coerce.number().int().min(0).max(7))
      .min(2, "Ordre invalide")
      .max(8, "Ordre invalide"),
  })
  .transform((a) => ({ gameType: "puzzle" as const, order: a.order }));

const mysteryWordAttemptSchema = z
  .object({
    guess: z.string().trim().min(1, "Réponse requise").max(80, "Réponse trop longue"),
  })
  .transform((a) => ({ gameType: "mystery_word" as const, guess: a.guess }));

const estimateAttemptSchema = z
  .object({
    value: z.coerce
      .number()
      .finite("Valeur invalide")
      .min(-1_000_000_000_000, "Valeur hors bornes")
      .max(1_000_000_000_000, "Valeur hors bornes"),
  })
  .transform((a) => ({ gameType: "estimate" as const, value: a.value }));

const SKILL_ATTEMPT_SCHEMAS = {
  rps: rpsAttemptSchema,
  reflex: reflexAttemptSchema,
  gauge: gaugeAttemptSchema,
  puzzle: puzzleAttemptSchema,
  mystery_word: mysteryWordAttemptSchema,
  estimate: estimateAttemptSchema,
} as const;

export type ParseSkillAttemptResult =
  | { ok: true; attempt: SkillAttempt }
  | { ok: false; error: string };

/** Valide la tentative brute du client contre le schéma du game_type (taggé). */
export function parseSkillAttempt(
  gameType: SkillGameType,
  raw: unknown,
): ParseSkillAttemptResult {
  const schema = SKILL_ATTEMPT_SCHEMAS[gameType];
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Tentative invalide" };
  }
  return { ok: true, attempt: result.data as SkillAttempt };
}

// ────────────────────────────────────────────────────────────
// Entrées des server actions (parcours public)
// ────────────────────────────────────────────────────────────

/** Slug public de la campagne (segment /play/[slug]) — permissif mais borné. */
export const skillSlugSchema = z
  .string()
  .trim()
  .min(1, "Lien invalide")
  .max(120, "Lien invalide");

export const startSkillChallengeSchema = z.object({
  slug: skillSlugSchema,
});

export const submitSkillChallengeSchema = z.object({
  slug: skillSlugSchema,
  challengeToken: z.string().min(10, "Défi expiré").max(4096, "Défi invalide"),
  // La forme de la tentative dépend du game_type porté par le jeton : validée
  // par parseSkillAttempt une fois le jeton vérifié.
  attempt: z.unknown(),
});
