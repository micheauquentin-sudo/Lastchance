import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveMembership,
  type OrganizationMembership,
} from "@/lib/active-organization";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Organization } from "@/types/database";

/**
 * Utilisateur connecté + organisation active explicitement sélectionnée.
 * Le cookie n'est qu'une préférence : l'appartenance est revérifiée par la
 * requête RLS à chaque requête. `cache()` déduplique l'appel dans un rendu.
 */
export const getUserAndOrg = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      user: null,
      organization: null,
      role: null,
      memberships: [] as OrganizationMembership[],
    };
  }

  const { data: rows } = await supabase
    .from("organization_members")
    .select("organization_id, role, created_at, organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const memberships: OrganizationMembership[] = (rows ?? []).flatMap((row) => {
    const organization = row.organizations as unknown as Organization | null;
    if (!organization) return [];
    return [{
      organizationId: row.organization_id,
      role: row.role as MemberRole,
      joinedAt: row.created_at,
      organization,
    }];
  });

  const cookieStore = await cookies();
  const active = selectActiveMembership(
    memberships,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );

  return {
    user,
    organization: active?.organization ?? null,
    role: active?.role ?? null,
    memberships,
  };
});
