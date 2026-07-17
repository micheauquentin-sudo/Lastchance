"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";

/**
 * Active/désactive la notification email au propriétaire à chaque
 * gain réclamé (temps réel).
 */
export async function updateNotifyOnWin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const enabled = formData.get("notify_on_win") === "on";

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ notify_on_win: enabled })
    .eq("id", organization.id);

  if (error) {
    console.error("[notifications] update:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
