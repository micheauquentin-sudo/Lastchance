"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { dataRetentionSchema } from "@/lib/validations/privacy";
import type { ActionResult } from "@/lib/utils";

/**
 * Durée de conservation des données personnelles (participations,
 * abonnés désinscrits). Null = conservation illimitée (comportement
 * historique). Appliquée par le cron /api/cron/purge-data.
 */
export async function updateDataRetention(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = dataRetentionSchema.safeParse({
    months: formData.get("months") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { organization } = await requireOrganizationOwner();

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ data_retention_months: parsed.data.months })
    .eq("id", organization.id);

  if (error) {
    console.error("[privacy] update retention:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
