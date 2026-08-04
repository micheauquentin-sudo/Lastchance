import type { GrantableModule } from "@/lib/subscription";
import type { MemberRole, Organization } from "@/types/database";

export const ACTIVE_ORGANIZATION_COOKIE = "lc-active-organization";

export type OrganizationSummary = Omit<Organization, "webhook_secret"> & {
  /**
   * Modules ouverts par un octroi daté VIVANT. Renseigné par `getUserAndOrg`
   * pour la SEULE organisation active, via `chargerOctroisVivants`.
   *
   * Absent sur les organisations de la liste de bascule, et c'est voulu : ce
   * champ ne sert qu'à décider d'un droit, or on ne décide d'un droit que dans
   * l'organisation où l'on se trouve. Le renseigner partout coûterait une
   * requête par organisation à chaque rendu pour une valeur que personne ne
   * lit.
   */
  live_module_grants?: readonly GrantableModule[] | null;
};

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
