import { z } from "zod";
import { isSecretSkillGameType } from "@/lib/validations/skill";

/** Montant en euros saisi librement (« 12,50 ») → centimes, '' → null. */
const eurosToCents = z
  .union([
    z.literal("").transform(() => null),
    z
      .string()
      .trim()
      .transform((raw, ctx) => {
        const value = Number(raw.replace(/\s/g, "").replace(",", "."));
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
          ctx.addIssue({ code: "custom", message: "Montant invalide" });
          return z.NEVER;
        }
        return Math.round(value * 100);
      }),
  ])
  .nullable()
  .default(null);

export const prizeFieldsSchema = z.object({
  label: z.string().trim().min(1, "Nom du lot requis").max(80, "Nom trop long"),
  description: z.string().trim().max(300, "Description trop longue").default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide")
    .default("#7c3aed"),
  weight: z.coerce
    .number()
    .int("Poids entier requis")
    .min(0, "Poids minimum 0")
    .max(10000, "Poids maximum 10000"),
  is_losing: z.coerce.boolean().default(false),
  stock: z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(0)])
    .nullable()
    .default(null),
  /** Seuil d'alerte stock faible (null : pas d'alerte) — email au
   *  commerçant quand stock <= seuil, réarmé au restock (trigger). */
  low_stock_threshold: z
    .union([
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Seuil entier requis")
        .min(0, "Seuil minimum 0")
        .max(100000, "Seuil trop élevé"),
    ])
    .nullable()
    .default(null),
  /** Coût réel du lot (ROI) et valeur commerciale — facultatifs. */
  cost_cents: eurosToCents,
  value_cents: eurosToCents,
});

export const addPrizeSchema = prizeFieldsSchema.extend({
  wheel_id: z.string().uuid(),
});

export const updatePrizeSchema = prizeFieldsSchema.extend({
  id: z.string().uuid(),
});

export const deletePrizeSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Enum COMPLET des mécaniques (miroir du CHECK SQL wheels_game_type_check et du
 * type GameType). Valide `game_type` AVANT écriture — défense en profondeur : une
 * valeur hors registre est refusée côté action, pas seulement par la contrainte
 * base (INFO revue vague 1). Couvre roue, grattage, jeux de RÉVÉLATION (vague 1)
 * et jeux de DÉFI skill-gated (vague 2).
 */
export const gameTypeSchema = z.enum([
  "wheel",
  "scratch",
  "flip_card",
  "cups",
  "slot",
  "memory",
  "chest",
  "dice",
  "draw_card",
  "rps",
  "reflex",
  "gauge",
  "puzzle",
  "mystery_word",
  "estimate",
]);

export const updateWheelSchema = z
  .object({
    id: z.string().uuid(),
    play_limit: z.enum(["once", "daily", "weekly", "unlimited"]),
    game_type: gameTypeSchema,
    /**
     * Config du défi (jeux skill-gated) sérialisée en JSON par le formulaire.
     * Validée par game_type dans l'action (parseSkillConfig) puis persistée ; les
     * game_type non-skill remettent skill_config à null.
     */
    skill_config: z
      .union([z.literal("").transform(() => null), z.string().max(8192, "Configuration trop longue")])
      .nullable()
      .default(null),
  })
  .superRefine((data, ctx) => {
    // Jeux à SECRET vérifiable serveur (mot mystère / estimation / puzzle) :
    // `play_limit = unlimited` est INTERDIT. Sans limite, la garde
    // `limit_reached` de perform_atomic_spin est inactive et le jeton de défi
    // (réutilisable ~10 min) laisserait rejouer la même tentative en variant la
    // réponse pour extraire le secret par force brute. Une tentative par période
    // ferme cette fuite — et c'est le bon design produit (réponse secrète = une
    // chance). Défense en profondeur : la contrainte est aussi une bonne pratique
    // côté produit, appliquée ici à l'écriture commerçant.
    if (isSecretSkillGameType(data.game_type) && data.play_limit === "unlimited") {
      ctx.addIssue({
        code: "custom",
        path: ["play_limit"],
        message:
          "Ces jeux exigent une limite de participation (une tentative par période) pour rester équitables.",
      });
    }
  });

export const createWheelSchema = z.object({
  campaign_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nom requis").max(80, "Nom trop long"),
});

export const deleteWheelSchema = z.object({
  id: z.string().uuid(),
});

// Heure vide → null (pas de borne) ; sinon entier 0..24.
const scheduleHour = z
  .union([z.literal("").transform(() => null), z.coerce.number().int().min(0).max(24)])
  .nullable()
  .default(null);

export const updateWheelScheduleSchema = z
  .object({
    id: z.string().uuid(),
    schedule_start_hour: scheduleHour,
    schedule_end_hour: scheduleHour,
    // Jours cochés : sous-ensemble de 0=dimanche..6=samedi ; [] = tous.
    schedule_days: z.array(z.coerce.number().int().min(0).max(6)).default([]),
  })
  .refine(
    (d) =>
      (d.schedule_start_hour == null) === (d.schedule_end_hour == null),
    { message: "Renseignez les deux heures ou aucune", path: ["schedule_end_hour"] },
  );
