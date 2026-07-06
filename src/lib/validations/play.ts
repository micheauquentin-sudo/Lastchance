import { z } from "zod";

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
