import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveMembership,
  type OrganizationMembership,
  type OrganizationSummary,
} from "@/lib/active-organization";
import { chargerOctroisVivants } from "@/lib/module-grants-loader";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "@/types/database";

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
    .select("organization_id, role, created_at, organizations(id, name, slug, stripe_customer_id, subscription_status, plan, trial_ends_at, past_due_since, logo_url, auto_reengage, notify_on_win, data_retention_months, webhook_url, timezone, addon_pronostics, addon_hunts, addon_loyalty, addon_jackpot, addon_events, addon_calendar, addon_referral, addon_quiz, addon_vitrine, comp_access, comp_access_until, created_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const memberships: OrganizationMembership[] = (rows ?? []).flatMap((row) => {
    const organization = row.organizations as unknown as OrganizationSummary | null;
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

  // OCTROIS DATÉS de la seule organisation active. Une requête indexée, après
  // que l'appartenance a été prouvée par RLS ci-dessus — l'identifiant passé
  // au client service_role ne vient donc jamais de l'appelant, mais d'une
  // ligne que la RLS a bien voulu rendre.
  //
  // Sans cette lecture, tout le dashboard REFUSE ce que la base ACCORDE : la
  // garde SQL `org_has_module_access` ouvre un module dès qu'un octroi est
  // vivant, pendant que `droitEffectifModule` ne voit qu'un champ absent. Le
  // commerçant lit « module non disponible » sur ce qu'il vient de payer.
  const organization = active?.organization ?? null;
  const live_module_grants = organization
    ? await chargerOctroisVivants(organization.id)
    : [];

  return {
    user,
    organization: organization ? { ...organization, live_module_grants } : null,
    role: active?.role ?? null,
    memberships,
  };
});
