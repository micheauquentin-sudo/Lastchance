import { z } from "zod";

export const inviteTeamMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
});

export const invitationIdSchema = z.object({
  id: z.string().uuid(),
});

export const memberUserIdSchema = z.object({
  userId: z.string().uuid(),
});
