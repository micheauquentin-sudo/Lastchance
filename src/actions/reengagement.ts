"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils";

/**
 * Active/désactive la relance automatique des clients inactifs pour
 * l'organisation. Le cron /api/cron/reengage ne traite que les orgs
 * ayant auto_reengage = true.
 */
export async function updateAutoReengage(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const enabled = formData.get("auto_reengage") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ auto_reengage: enabled })
    .eq("id", organization.id);

  if (error) {
    console.error("[reengagement] update:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
