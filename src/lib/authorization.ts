import "server-only";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";

export async function requireOrganizationMember() {
  const context = await getUserAndOrg();
  if (!context.user || !context.organization) redirect("/login");
  return { user: context.user, organization: context.organization, role: context.role };
}

export async function requireOrganizationOwner() {
  const context = await requireOrganizationMember();
  if (context.role !== "owner") redirect("/dashboard");
  return { user: context.user, organization: context.organization };
}
