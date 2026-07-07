import { z } from "zod";

const linkUrl = z
  .string()
  .trim()
  .max(300, "Lien trop long")
  .refine((v) => v === "" || v.startsWith("https://"), {
    message: "Le lien doit commencer par https://",
  })
  .default("");

/**
 * Configuration des actions proposées avant de jouer.
 * Une action lien activée sans URL est refusée.
 */
export const updateEngagementSchema = z
  .object({
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
