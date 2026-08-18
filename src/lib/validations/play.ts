import { z } from "zod";
// Le contrôle de date de naissance est aussi appelé par `claim-form.tsx`
// (client) : il vit dans un module SANS import, pour que le chercher n'y tire
// pas Zod. Le sens de la dépendance est inversé exprès — un schéma peut
// connaître un libellé, l'inverse coûte 121 Ko à l'écran du joueur.
import { isPlausibleBirthDate } from "@/lib/claim-libelles";

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
  /**
   * Consentement SMS — porté par LA MÊME requête que le claim, et c'est tout
   * l'objet du champ.
   *
   * Il voyageait auparavant dans un second appel (`submitSmsConsent`), envoyé
   * par le client APRÈS la réponse du claim. Or `claimPrize` dépose le code de
   * retrait par SMS À L'INTÉRIEUR du claim, et ce dépôt commence par lire
   * `sms_consents` : au PREMIER gain d'un couple (organisation, numéro) la
   * ligne de consentement n'existait pas encore, aucun job n'était déposé, et
   * rien ne rattrapait ensuite. Le canal SMS ne partait donc jamais pour un
   * primo-gagnant — exactement le scénario qui justifie son existence.
   *
   * Ce n'est PAS « un drapeau parmi d'autres » : le serveur en fait un
   * consentement daté et VERSIONNÉ (`record_sms_consent`), sur une
   * organisation qu'il résout lui-même depuis le spin — jamais depuis le
   * client.
   */
  smsOptIn: z.boolean().default(false),
  // Anniversaire (facultatif) : la date n'est PERSISTÉE que si
  // marketingOptIn ET birthdayOptIn sont vrais et l'email présent —
  // règle appliquée côté serveur (claimPrize).
  birthdayOptIn: z.boolean().default(false),
  birthDate: z
    .union([
      z.literal("").transform(() => null),
      z
        .string()
        .trim()
        .refine((v) => isPlausibleBirthDate(v), "Date de naissance invalide"),
    ])
    .nullable()
    .default(null),
});
