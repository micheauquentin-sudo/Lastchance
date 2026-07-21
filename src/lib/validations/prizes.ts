import { z } from "zod";

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

export const updateWheelSchema = z.object({
  id: z.string().uuid(),
  play_limit: z.enum(["once", "daily", "weekly", "unlimited"]),
  game_type: z.enum(["wheel", "scratch"]),
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
