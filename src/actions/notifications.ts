"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils";

/**
 * Active/désactive la notification email au propriétaire à chaque
 * gain réclamé (temps réel).
 */
export async function updateNotifyOnWin(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const enabled = formData.get("notify_on_win") === "on";

  const supabase = await createClient();
  const { error } = await supabase
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
