"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { setActiveOrganizationCookie } from "@/lib/active-organization-cookie";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { sendTeamInviteEmail } from "@/lib/resend";
import { signInviteToken, verifyInviteToken } from "@/lib/team-invite";
import {
  inviteTeamMemberSchema,
  invitationIdSchema,
  memberUserIdSchema,
  updateMemberRoleSchema,
  TEAM_ROLE_LABELS,
} from "@/lib/validations/team";
import type { ActionResult } from "@/lib/utils";
import type { TeamMemberRow } from "@/types/database";

async function requireOwner() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") {
    return { organization: null, error: "Réservé au propriétaire du compte." };
  }
  return { organization, error: null };
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Invite un collègue comme éditeur ou caissier. */
export async function inviteTeamMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = inviteTeamMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
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

  // ── Ré-inviter un membre EXISTANT ne changeait rien, et le disait réussi ──
  //
  // `accept_team_invitation` insère `on conflict (organization_id, user_id) do
  // nothing` (00015:91-93) : le membre déjà présent garde son rôle. Le
  // propriétaire voyait « invitation envoyée » puis l'invitation passer en
  // « acceptée », le collègue lisait « Bienvenue dans l'équipe », et rien
  // n'avait bougé — dans les deux sens, promotion comme rétrogradation. La
  // rétrogradation ratée est la plus grave : on croit avoir retiré les droits
  // campagnes à quelqu'un qui les garde.
  //
  // On refuse ici, plutôt que de faire promouvoir l'invitation : ça laisserait
  // deux chemins d'élévation de privilège, dont un asynchrone (l'effet dépend
  // du moment où l'invité clique) et incapable de rétrograder de toute façon.
  // Le changement de rôle a maintenant sa propre action, synchrone et bornée.
  const { data: membres } = await supabase.rpc("org_team_members", {
    p_organization_id: organization.id,
  });
  const dejaMembre = ((membres ?? []) as TeamMemberRow[]).find(
    (m) => (m.email ?? "").toLowerCase() === parsed.data.email,
  );
  if (dejaMembre) {
    return {
      ok: false,
      error:
        `${parsed.data.email} fait déjà partie de l'équipe ` +
        `(${TEAM_ROLE_LABELS[dejaMembre.role] ?? dejaMembre.role}). Une ` +
        "nouvelle invitation ne changerait pas son accès : modifiez son rôle " +
        "dans la liste des membres.",
    };
  }

  const { data: invitation, error } = await supabase
    .from("team_invitations")
    .insert({
      organization_id: organization.id,
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: user.id,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !invitation) {
    reportError("team.invite", error?.message ?? "raison inconnue");
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
    reportError("team.revoke", error.message);
    return { ok: false, error: "Annulation impossible." };
  }

  revalidatePath("/dashboard/team");
  return { ok: true, data: undefined };
}

/**
 * Change le rôle d'un collaborateur (« Caisse uniquement » ↔ « Campagnes et
 * caisse »).
 *
 * Il n'existait AUCUN chemin pour cela : pas de bouton, pas d'action, et pas
 * même de policy — `organization_members` n'accorde à `authenticated` que
 * `select` et `delete`. Le seul contournement connu, ré-inviter le collègue
 * avec le nouveau rôle, ne fait rien du tout (voir `inviteTeamMember`). Le
 * propriétaire qui voulait retirer les droits campagnes à un collaborateur
 * partant croyait l'avoir fait ; le collaborateur les gardait.
 *
 * La borne « jamais le dernier propriétaire » vit dans la RPC et non ici :
 * elle doit tenir même si un autre appelant apparaît un jour. Une organisation
 * sans propriétaire n'a plus ni facturation, ni réglages, ni invitations, et
 * rien dans le produit ne permet d'en refaire un.
 */
export async function updateTeamMemberRole(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { organization, error: ownerError } = await requireOwner();
  if (!organization) return { ok: false, error: ownerError! };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_team_member_role", {
    p_organization_id: organization.id,
    p_user_id: parsed.data.userId,
    p_role: parsed.data.role,
  });

  if (error) {
    if (error.message.includes("last owner")) {
      return {
        ok: false,
        error:
          "Vous êtes le seul propriétaire : changer votre rôle laisserait ce " +
          "compte sans administrateur.",
      };
    }
    if (error.message.includes("member not found")) {
      return { ok: false, error: "Ce membre ne fait plus partie de l'équipe." };
    }
    reportError("team.role", error.message);
    return { ok: false, error: "Changement de rôle impossible." };
  }

  revalidatePath("/dashboard/team");
  return { ok: true, data: undefined };
}

/** Retire un collaborateur de l'équipe (jamais le propriétaire). */
export async function removeTeamMember(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = memberUserIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { organization, error: ownerError } = await requireOwner();
  if (!organization) return { ok: false, error: ownerError! };

  const supabase = await createClient();
  // La policy RLS ne laisse retirer que les éditeurs/caissiers.
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("organization_id", organization.id)
    .eq("user_id", parsed.data.userId);

  if (error) {
    reportError("team.remove", error.message);
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
    reportError("team.accept", error?.message ?? "raison inconnue");
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

  // L'organisation rejointe devient immédiatement le tenant courant.
  await setActiveOrganizationCookie(organizationId);

  return {
    ok: true,
    data: { organizationName: org?.name ?? "l'établissement" },
  };
}
