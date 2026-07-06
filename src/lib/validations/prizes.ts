import { z } from "zod";

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
});
