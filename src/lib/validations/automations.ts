import { z } from "zod";
import type { AutomationScenario } from "@/types/database";

/**
 * Réglages des scénarios d'emails automatiques (automation_settings.config).
 *
 * Chaque scénario a son schéma STRICT (bornes saines, messages français) :
 * c'est lui qui valide l'écriture depuis le dashboard. Le worker, lui,
 * relit la config en mode tolérant via parseScenarioConfig
 * (src/lib/automations.ts) : une config invalide retombe sur les défauts
 * plutôt que de bloquer tout le scénario.
 */

export const automationScenarioSchema = z.enum([
  "won_not_redeemed",
  "inactive",
  "post_redemption",
  "birthday",
]);

/** Rappel « gagné mais pas retiré » : âge minimal du gain avant rappel. */
export const wonNotRedeemedConfigSchema = z.object({
  minAgeHours: z.coerce
    .number()
    .int("Nombre entier d'heures requis")
    .min(1, "Minimum 1 heure")
    .max(720, "Maximum 720 heures (30 jours)")
    .default(48),
});

/** Relance des inactifs : paliers en jours — le scénario tourne une fois par palier. */
export const inactiveConfigSchema = z.object({
  tiers: z
    .array(
      z.coerce
        .number()
        .int("Nombre entier de jours requis")
        .min(7, "Minimum 7 jours")
        .max(365, "Maximum 365 jours"),
    )
    .min(1, "Au moins un palier requis")
    .max(4, "Maximum 4 paliers")
    // Paliers dédoublonnés et triés : l'orchestrateur traite du plus
    // profond au plus récent (un contact ne reçoit qu'un email par jour).
    .transform((tiers) => [...new Set(tiers)].sort((a, b) => a - b))
    .default([30, 60]),
});

/** Suite de retrait (merci / revenez) : délai après le passage en caisse. */
export const postRedemptionConfigSchema = z.object({
  delayHours: z.coerce
    .number()
    .int("Nombre entier d'heures requis")
    .min(1, "Minimum 1 heure")
    .max(720, "Maximum 720 heures (30 jours)")
    .default(24),
});

/** Anniversaire : aucun réglage — l'activation suffit. */
export const birthdayConfigSchema = z.object({});

export const automationConfigSchemas = {
  won_not_redeemed: wonNotRedeemedConfigSchema,
  inactive: inactiveConfigSchema,
  post_redemption: postRedemptionConfigSchema,
  birthday: birthdayConfigSchema,
} as const satisfies Record<AutomationScenario, z.ZodType>;

export type WonNotRedeemedConfig = z.infer<typeof wonNotRedeemedConfigSchema>;
export type InactiveConfig = z.infer<typeof inactiveConfigSchema>;
export type PostRedemptionConfig = z.infer<typeof postRedemptionConfigSchema>;
export type BirthdayConfig = z.infer<typeof birthdayConfigSchema>;

/** Config typée par scénario (défauts appliqués). */
export interface AutomationConfigByScenario {
  won_not_redeemed: WonNotRedeemedConfig;
  inactive: InactiveConfig;
  post_redemption: PostRedemptionConfig;
  birthday: BirthdayConfig;
}
