"use server";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { setActiveOrganizationCookie } from "@/lib/active-organization-cookie";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Change le tenant courant après vérification de l'appartenance RLS. */
export async function switchActiveOrganization(formData: FormData): Promise<void> {
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!UUID_RE.test(organizationId)) redirect("/dashboard");

  const { user, memberships } = await getUserAndOrg();
  if (!user) redirect("/login");

  const allowed = memberships.some(
    (membership) => membership.organizationId === organizationId,
  );
  if (!allowed) redirect("/dashboard");

  await setActiveOrganizationCookie(organizationId);
  redirect("/dashboard");
}
