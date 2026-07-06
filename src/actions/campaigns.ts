"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCampaignSchema,
  deleteCampaignSchema,
  updateCampaignSchema,
} from "@/lib/validations/campaigns";
import type { ActionResult } from "@/lib/utils";

/** Lots par défaut d'une nouvelle roue : jouable immédiatement. */
const DEFAULT_PRIZES = [
  { label: "Café offert", description: "Un café offert au comptoir.", color: "#f59e0b", weight: 40, is_losing: false, position: 0 },
  { label: "Dessert offert", description: "Un dessert au choix.", color: "#ec4899", weight: 20, is_losing: false, position: 1 },
  { label: "Surprise", description: "Une surprise de la maison.", color: "#8b5cf6", weight: 10, is_losing: false, position: 2 },
  { label: "Pas de chance", description: "Retentez votre chance bientôt !", color: "#64748b", weight: 30, is_losing: true, position: 3 },
];

export async function createCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({ organization_id: organization.id, name: parsed.data.name })
    .select("id")
    .single();

  if (error || !campaign) {
    console.error("[campaigns] create:", error?.message);
    return { ok: false, error: "Impossible de créer la campagne" };
  }

  // Roue 1:1 + lots par défaut — la campagne est jouable immédiatement.
  const { data: wheel, error: wheelError } = await supabase
    .from("wheels")
    .insert({
      organization_id: organization.id,
      campaign_id: campaign.id,
      name: parsed.data.name,
    })
    .select("id")
    .single();

  if (wheelError || !wheel) {
    console.error("[campaigns] create wheel:", wheelError?.message);
    return { ok: false, error: "Campagne créée mais roue manquante" };
  }

  const { error: prizesError } = await supabase.from("prizes").insert(
    DEFAULT_PRIZES.map((p) => ({
      ...p,
      organization_id: organization.id,
      wheel_id: wheel.id,
    })),
  );
  if (prizesError) {
    console.error("[campaigns] default prizes:", prizesError.message);
  }

  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${campaign.id}`);
}

export async function updateCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name") ?? undefined,
    status: formData.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const { id, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return { ok: true, data: undefined };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[campaigns] update:", error.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/${id}`);
  return { ok: true, data: undefined };
}

export async function deleteCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteCampaignSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[campaigns] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath("/dashboard/campaigns");
  redirect("/dashboard/campaigns");
}
