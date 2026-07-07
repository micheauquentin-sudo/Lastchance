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

const linkUrl = z
  .string()
  .trim()
  .max(300, "Lien trop long")
  .refine((v) => v === "" || v.startsWith("https://"), {
    message: "Le lien doit commencer par https://",
  })
  .default("");

/**
 * Actions proposées au joueur avant de lancer la roue (par campagne).
 * Une action lien activée sans URL est refusée.
 */
export const updateCampaignEngagementSchema = z
  .object({
    id: z.string().uuid(),
    newsletter: z.boolean(),
    instagram: z.boolean(),
    instagram_url: linkUrl,
    tiktok: z.boolean(),
    tiktok_url: linkUrl,
    google_review: z.boolean(),
    google_review_url: linkUrl,
  })
  .superRefine((data, ctx) => {
    const pairs: Array<[boolean, string, string]> = [
      [data.instagram, data.instagram_url, "instagram_url"],
      [data.tiktok, data.tiktok_url, "tiktok_url"],
      [data.google_review, data.google_review_url, "google_review_url"],
    ];
    for (const [enabled, url, path] of pairs) {
      if (enabled && url === "") {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Renseignez le lien pour activer cette action",
        });
      }
    }
  });

/**
 * Réglages du formulaire après gain : quelles données sont demandées
 * avant d'afficher le code, et compte à rebours avant masquage du code.
 */
export const updateCampaignClaimSchema = z.object({
  id: z.string().uuid(),
  collect_email: z.boolean(),
  collect_phone: z.boolean(),
  code_ttl_seconds: z
    .union([
      z.literal("").transform(() => null),
      z.coerce
        .number()
        .int("Nombre entier de secondes requis")
        .min(10, "Minimum 10 secondes")
        .max(600, "Maximum 600 secondes (10 min)"),
    ])
    .nullable()
    .default(null),
});
