"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import type { ActionResult } from "@/lib/utils";

const redeemSchema = z.object({ id: z.string().uuid() });

/** Marque un gain comme récupéré (présenté en caisse). */
export async function redeemParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = redeemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: redeemedId, error } = await supabase.rpc(
    "redeem_participation",
    { p_organization_id: organization.id, p_participation_id: parsed.data.id },
  );

  if (error) {
    console.error("[participations] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  if (redeemedId) {
    await writeAuditLog({
      organizationId: organization.id,
      actor: user.id,
      action: "participation.redeem",
      metadata: { participation_id: redeemedId },
    });
  }

  revalidatePath("/dashboard/participations");
  revalidatePath("/dashboard/redeem");
  return { ok: true, data: undefined };
}
