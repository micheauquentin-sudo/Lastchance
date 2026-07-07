import { z } from "zod";

/** Action d'engagement choisie par le joueur avant le spin. */
export const spinEngagementSchema = z
  .object({
    action: z.enum(["newsletter", "instagram", "tiktok", "google_review"]),
    // Requis uniquement pour la newsletter (vérifié dans l'action serveur).
    email: z.string().trim().toLowerCase().email("Email invalide").optional(),
  })
  .nullable();

export const claimSchema = z.object({
  claimToken: z.string().min(10, "Jeton invalide"),
  firstName: z
    .string()
    .trim()
    .min(1, "Votre prénom est requis")
    .max(80, "Prénom trop long"),
  email: z.string().trim().toLowerCase().email("Email invalide"),
  // RGPD : consentement CGU obligatoire, explicite et non pré-coché
  acceptedTerms: z.literal(true, {
    message: "Vous devez accepter les conditions du jeu",
  }),
  marketingOptIn: z.boolean().default(false),
});
