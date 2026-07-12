import { z } from "zod";
import { ADMIN_ROLES } from "@/types/admin";

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
