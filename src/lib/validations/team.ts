import { z } from "zod";

export const inviteTeamMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  role: z.enum(["editor", "cashier"]),
});

export const invitationIdSchema = z.object({
  id: z.string().uuid(),
});

export const memberUserIdSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * Changement de rôle d'un membre existant. Même jeu de rôles que
 * l'invitation : `owner` ne se donne pas par ce chemin (voir la migration
 * 20260815120000, qui porte la même borne côté SQL).
 */
export const updateMemberRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["editor", "cashier"]),
});

/** Libellés des rôles, communs à l'invitation, à la liste et aux messages. */
export const TEAM_ROLE_LABELS: Record<string, string> = {
  owner: "Propriétaire",
  editor: "Campagnes et caisse",
  cashier: "Caisse uniquement",
};
