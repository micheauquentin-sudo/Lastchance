import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email du propriétaire d'une organisation (premier membre `owner`),
 * pour les notifications serveur (gain en temps réel, etc.). Passe par
 * le client admin : l'email n'est pas dupliqué sur `organizations`,
 * il vit dans `auth.users`.
 */
export async function getOrgOwnerEmail(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<string | null> {
  const { data: member } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!member) return null;

  const { data, error } = await admin.auth.admin.getUserById(member.user_id);
  if (error || !data.user?.email) return null;
  return data.user.email;
}
