"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";

const redeemSchema = z.object({ id: z.string().uuid() });

/** Marque un gain comme récupéré (présenté en caisse). */
export async function redeemParticipation(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = redeemSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { organization } = await requireOrg();

  const supabase = await createClient();
  const { error } = await supabase
    .from("participations")
    .update({ redeemed_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .is("redeemed_at", null);

  if (error) {
    console.error("[participations] redeem:", error.message);
    return { ok: false, error: "Validation impossible" };
  }

  revalidatePath("/dashboard/participations");
  return { ok: true, data: undefined };
}
