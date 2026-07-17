"use server";

import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { setActiveOrganizationCookie } from "@/lib/active-organization-cookie";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/utils";

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

export async function updateOrganizationTimezone(
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const timezone = String(formData.get("timezone") ?? "");
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone }).format();
  } catch {
    return { ok: false, error: "Fuseau horaire invalide." };
  }
  const { organization } = await requireOrganizationOwner();
  const admin = createAdminClient();
  const { data: valid } = await admin.rpc("is_valid_timezone", {
    p_timezone: timezone,
  });
  if (!valid) return { ok: false, error: "Fuseau horaire inconnu." };
  const { error } = await admin
    .from("organizations")
    .update({ timezone })
    .eq("id", organization.id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}
