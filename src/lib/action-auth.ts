import "server-only";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import type { OrganizationSummary } from "@/lib/active-organization";
import type { MemberRole } from "@/types/database";

export type AuthorizedOrgContext = {
  userId: string;
  organization: OrganizationSummary;
  role: MemberRole;
};

/**
 * Vérifie que l'appelant est connecté, rattaché à une organisation active
 * et détient un rôle `owner` ou `editor`. Redirige vers `/login` si non
 * authentifié ; retourne `null` si le rôle est insuffisant (ex. `staff`).
 */
export async function requireOrgEditor(): Promise<AuthorizedOrgContext | null> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return null;
  return { userId: user.id, organization, role };
}

/**
 * Même garde strictement réservée au rôle `owner` (facturation, suppression,
 * gestion d'équipe sensible).
 */
export async function requireOrgOwner(): Promise<AuthorizedOrgContext | null> {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner") return null;
  return { userId: user.id, organization, role };
}
