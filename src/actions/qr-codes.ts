"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { randomCode, type ActionResult } from "@/lib/utils";

const createQrSchema = z.object({
  campaign_id: z.string().uuid("Campagne invalide"),
  label: z.string().trim().max(120, "Libellé trop long").default(""),
});

const deleteQrSchema = z.object({ id: z.string().uuid() });

export async function createQrCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createQrSchema.safeParse({
    campaign_id: formData.get("campaign_id"),
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  // La campagne doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  const { error } = await supabase.from("qr_codes").insert({
    organization_id: organization.id,
    campaign_id: campaign.id,
    slug: randomCode(8),
    label: parsed.data.label,
  });

  if (error) {
    console.error("[qr] create:", error.message);
    return { ok: false, error: "Impossible de créer le QR code" };
  }

  revalidatePath("/dashboard/qr-codes");
  return { ok: true, data: undefined };
}

export async function deleteQrCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteQrSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("qr_codes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[qr] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/qr-codes");
  return { ok: true, data: undefined };
}
