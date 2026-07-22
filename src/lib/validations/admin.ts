import { z } from "zod";
import { ADMIN_ROLES } from "@/types/admin";
import { isValidDateOnly } from "@/lib/date-time";

const uuid = z.string().uuid("Identifiant invalide.");

/**
 * Statuts d'abonnement pilotables manuellement depuis le back-office.
 * On exclut « trialing » : un essai se définit par sa date de fin
 * (trial_ends_at), qu'un simple changement de statut ne poserait pas —
 * l'org paraîtrait en essai tout en étant lue comme essai expiré.
 */
export const merchantStatusSchema = z.object({
  organizationId: uuid,
  status: z.enum(["active", "past_due", "canceled", "inactive"]),
});

export const merchantPlanSchema = z.object({
  organizationId: uuid,
  plan: z.string().trim().min(1).max(40),
});

export const merchantAddonSchema = z.object({
  organizationId: uuid,
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Accès offert (premium sans paiement). `until` vide = illimité ; sinon
 * une date (input `type=date`). `includePronostics` / `includeHunts`
 * activent aussi les addons correspondants.
 */
export const merchantCompAccessSchema = z.object({
  organizationId: uuid,
  enabled: z.enum(["true", "false"]).transform((value) => value === "true"),
  until: z
    .string()
    .default("")
    .refine(
      (value) => value === "" || isValidDateOnly(value),
      { message: "Date de fin invalide." },
    ),
  note: z.string().trim().max(200, "Motif trop long.").default(""),
  includePronostics: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  includeHunts: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

/**
 * Suppression définitive d'un commerçant. La confirmation exige de
 * ressaisir le slug exact de l'organisation (garde-fou anti-erreur).
 */
export const deleteMerchantSchema = z.object({
  organizationId: uuid,
  confirmSlug: z.string().trim().min(1, "Confirmation requise."),
});

export const addNoteSchema = z.object({
  organizationId: uuid,
  body: z.string().trim().min(1, "Note vide.").max(2000),
});

export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide."),
  name: z.string().trim().max(120).default(""),
  role: z.enum(ADMIN_ROLES),
});

export const updateAdminRoleSchema = z.object({
  adminId: uuid,
  role: z.enum(ADMIN_ROLES),
});

export const toggleAdminSchema = z.object({
  adminId: uuid,
  isActive: z.boolean(),
});
