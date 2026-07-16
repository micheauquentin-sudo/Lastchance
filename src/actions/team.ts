"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { sendTeamInviteEmail } from "@/lib/resend";
import { signInviteToken, verifyInviteToken } from "@/lib/team-invite";
import {
  inviteTeamMemberSchema,
  invitationIdSchema,
  memberUserIdSchema,
} from "@/lib/validations/team";
import type { ActionResult } from "@/lib/utils";

async function requireOwner() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") {
    return { organization: null, error: "Réservé au propriétaire du compte." };
  }
  return { organization, error: null };
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invite un collègue (rôle staff) par email. */
export async function inviteTeamMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inviteTeamMemberSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") {
    return { ok: false, error: "Réservé au propriétaire du compte." };
  }

  if (parsed.data.email === user.email?.toLowerCase()) {
    return { ok: false, error: "Vous ne pouvez pas vous inviter vous-même." };
  }

  const supabase = await createClient();
  const { data: invitation, error } = await supabase
    .from("team_invitations")
    .insert({
      organization_id: organization.id,
      email: parsed.data.email,
      role: "staff",
      invited_by: user.id,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !invitation) {
    console.error("[team] invite:", error?.message);
    return { ok: false, error: "Impossible de créer l'invitation." };
  }

  const token = signInviteToken(invitation.id);
  const sent = await sendTeamInviteEmail({
    to: parsed.data.email,
    organizationName: organization.name,
    inviteUrl: `${APP_URL}/invite/${token}`,
  });

  if (!sent) {
    return {
      ok: false,
      error: "Invitation créée mais l'email n'a pas pu être envoyé.",
    };
  }

  revalidatePath("/dashboard/team");
  return { ok: true, data: undefined };
}

/** Annule une invitation en attente. */
export async function revokeInvitation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = invitationIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { organization, error: ownerError } = await requireOwner();
  if (!organization) return { ok: false, error: ownerError! };

  const supabase = await createClient();
  const { error } = await supabase
    .from("team_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[team] revoke:", error.message);
    return { ok: false, error: "Annulation impossible." };
  }

  revalidatePath("/dashboard/team");
  return { ok: true, data: undefined };
}

/** Retire un membre staff de l'équipe (jamais le propriétaire). */
export async function removeTeamMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = memberUserIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { organization, error: ownerError } = await requireOwner();
  if (!organization) return { ok: false, error: ownerError! };

  const supabase = await createClient();
  // La policy RLS ne laisse retirer que des membres role='staff'.
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organization.id)
    .eq("user_id", parsed.data.userId);

  if (error) {
    console.error("[team] remove:", error.message);
    return { ok: false, error: "Suppression impossible." };
  }

  revalidatePath("/dashboard/team");
  return { ok: true, data: undefined };
}

/**
 * Accepte une invitation d'équipe : appelée par l'invité, qui n'est pas
 * encore membre de l'org. Le jeton référence l'id de la ligne
 * `team_invitations`, seule source de vérité sur l'état (la RPC
 * revérifie tout — email, expiration, révocation).
 */
export async function acceptTeamInvitation(
  _prev: ActionResult<{ organizationName: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ organizationName: string }>> {
  const token = String(formData.get("token") ?? "");
  const payload = verifyInviteToken(token);
  if (!payload) {
    return { ok: false, error: "Ce lien d'invitation a expiré ou est invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Connectez-vous pour accepter cette invitation." };
  }

  const { data: organizationId, error } = await supabase.rpc(
    "accept_team_invitation",
    { p_invitation_id: payload.invitationId },
  );

  if (error || !organizationId) {
    console.error("[team] accept:", error?.message);
    return {
      ok: false,
      error:
        "Impossible d'accepter cette invitation (déjà utilisée, annulée, ou destinée à une autre adresse).",
    };
  }

  // Lisible dès maintenant : l'appelant vient de devenir membre de l'org.
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  return {
    ok: true,
    data: { organizationName: org?.name ?? "l'établissement" },
  };
}
