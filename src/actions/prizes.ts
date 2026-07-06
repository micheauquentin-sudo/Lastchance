"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  addPrizeSchema,
  deletePrizeSchema,
  updatePrizeSchema,
  updateWheelSchema,
} from "@/lib/validations/prizes";
import type { ActionResult } from "@/lib/utils";

function firstError(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Données invalides";
}

async function requireOrg() {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  return organization;
}

export async function addPrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = addPrizeSchema.safeParse({
    wheel_id: formData.get("wheel_id"),
    label: formData.get("label"),
    description: formData.get("description") ?? "",
    color: formData.get("color") ?? "#7c3aed",
    weight: formData.get("weight"),
    is_losing: formData.get("is_losing") === "on",
    stock: formData.get("stock") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  // La roue doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: wheel } = await supabase
    .from("wheels")
    .select("id, campaign_id")
    .eq("id", parsed.data.wheel_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!wheel) return { ok: false, error: "Roue introuvable" };

  const { count } = await supabase
    .from("prizes")
    .select("id", { count: "exact", head: true })
    .eq("wheel_id", wheel.id);
  if ((count ?? 0) >= 12) {
    return { ok: false, error: "Maximum 12 lots par roue" };
  }

  const { wheel_id, ...fields } = parsed.data;
  const { error } = await supabase.from("prizes").insert({
    ...fields,
    wheel_id,
    organization_id: organization.id,
    position: count ?? 0,
  });

  if (error) {
    console.error("[prizes] add:", error.message);
    return { ok: false, error: "Impossible d'ajouter le lot" };
  }

  revalidatePath(`/dashboard/campaigns/${wheel.campaign_id}/wheel`);
  return { ok: true, data: undefined };
}

export async function updatePrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updatePrizeSchema.safeParse({
    id: formData.get("id"),
    label: formData.get("label"),
    description: formData.get("description") ?? "",
    color: formData.get("color") ?? "#7c3aed",
    weight: formData.get("weight"),
    is_losing: formData.get("is_losing") === "on",
    stock: formData.get("stock") ?? "",
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { id, ...fields } = parsed.data;
  const { data: updated, error } = await supabase
    .from("prizes")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("wheel_id, wheels(campaign_id)")
    .maybeSingle();

  if (error || !updated) {
    console.error("[prizes] update:", error?.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  const campaignId = (updated.wheels as unknown as { campaign_id: string })
    ?.campaign_id;
  if (campaignId) revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
  return { ok: true, data: undefined };
}

export async function deletePrize(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deletePrizeSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: deleted, error } = await supabase
    .from("prizes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("wheel_id, wheels(campaign_id)")
    .maybeSingle();

  if (error) {
    console.error("[prizes] delete:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  const campaignId = (deleted?.wheels as unknown as { campaign_id: string })
    ?.campaign_id;
  if (campaignId) revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
  return { ok: true, data: undefined };
}

export async function updateWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateWheelSchema.safeParse({
    id: formData.get("id"),
    play_limit: formData.get("play_limit"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ play_limit: parsed.data.play_limit })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[prizes] updateWheel:", error?.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  return { ok: true, data: undefined };
}
