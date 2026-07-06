import { z } from "zod";

export const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "Le nom de la campagne est requis")
  .max(120, "Nom trop long");

export const createCampaignSchema = z.object({
  name: campaignNameSchema,
});

export const updateCampaignSchema = z.object({
  id: z.string().uuid(),
  name: campaignNameSchema.optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export const deleteCampaignSchema = z.object({
  id: z.string().uuid(),
});
