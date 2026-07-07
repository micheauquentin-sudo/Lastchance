import { z } from "zod";

/** Action d'engagement choisie par le joueur avant le spin. */
export const spinEngagementSchema = z
  .object({
    action: z.enum(["newsletter", "instagram", "tiktok", "google_review"]),
    // Requis uniquement pour la newsletter (vérifié dans l'action serveur).
    email: z.string().trim().toLowerCase().email("Email invalide").optional(),
  })
  .nullable();

/**
 * Réclamation du gain. email / phone / firstName sont exigés ou non
 * selon la configuration de la campagne — revérifié dans l'action
 * serveur (claimPrize), jamais côté client seul.
 */
export const claimSchema = z.object({
  claimToken: z.string().min(10, "Jeton invalide"),
  firstName: z.string().trim().max(80, "Prénom trop long").default(""),
  email: z
    .union([
      z.literal("").transform(() => null),
      z.string().trim().toLowerCase().email("Email invalide"),
    ])
    .nullable()
    .default(null),
  phone: z
    .union([
      z.literal("").transform(() => null),
      z
        .string()
        .trim()
        .regex(/^\+?[0-9 .()-]{6,20}$/, "Numéro de téléphone invalide"),
    ])
    .nullable()
    .default(null),
  // RGPD : consentement CGU explicite dès qu'une donnée est collectée
  // (exigence revérifiée côté serveur selon la campagne).
  acceptedTerms: z.boolean().default(false),
  marketingOptIn: z.boolean().default(false),
});
