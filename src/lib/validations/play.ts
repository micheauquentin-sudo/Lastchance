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
 * Date de naissance plausible : date calendaire réelle (YYYY-MM-DD) et
 * âge entre 13 et 120 ans. Pure et exportée pour les tests.
 */
export function isPlausibleBirthDate(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejette les dates « déroulées » par JS (2020-02-31 → 2 mars).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 86_400_000);
  return ageYears >= 13 && ageYears <= 120;
}

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
