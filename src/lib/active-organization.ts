import type { MemberRole, Organization } from "@/types/database";

export const ACTIVE_ORGANIZATION_COOKIE = "lc-active-organization";

export type OrganizationSummary = Omit<Organization, "webhook_secret">;

export interface OrganizationMembership {
  organizationId: string;
  role: MemberRole;
  joinedAt: string;
  organization: OrganizationSummary;
}

/**
 * Sélectionne l'organisation demandée uniquement si l'utilisateur en est
 * réellement membre. Le repli est déterministe afin qu'une absence de cookie
 * ne dépende jamais de l'ordre implicite renvoyé par PostgreSQL.
 */
export function selectActiveMembership(
  memberships: OrganizationMembership[],
  requestedOrganizationId: string | undefined,
): OrganizationMembership | null {
  if (memberships.length === 0) return null;

  const requested = requestedOrganizationId
    ? memberships.find((item) => item.organizationId === requestedOrganizationId)
    : undefined;
  if (requested) return requested;

  return [...memberships].sort(
    (a, b) =>
      a.joinedAt.localeCompare(b.joinedAt) ||
      a.organizationId.localeCompare(b.organizationId),
  )[0];
}
