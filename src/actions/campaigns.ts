"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasActiveAccess } from "@/lib/subscription";
import {
  createCampaignSchema,
  deleteCampaignSchema,
  updateCampaignClaimSchema,
  updateCampaignEngagementSchema,
  updateCampaignSchema,
} from "@/lib/validations/campaigns";
import { firstIssue, type ActionResult } from "@/lib/action-result";
import type { EngagementConfig } from "@/types/database";

export async function createCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createCampaignSchema.safeParse({
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { organization } = await requireOrg();

  const supabase = await createClient();

  // Campagne + roue 1:1 + lots par défaut en une transaction SQL —
  // jouable immédiatement, jamais de campagne sans roue (migration 00005).
  const { data: campaignId, error } = await supabase.rpc(
    "create_campaign_with_defaults",
    { org_id: organization.id, campaign_name: parsed.data.name },
  );

  if (error || !campaignId) {
    console.error("[campaigns] create:", error?.message);
    return { ok: false, error: "Impossible de créer la campagne" };
  }

  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${campaignId}`);
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

  const { organization } = await requireOrg();

  const { id, ...fields } = parsed.data;
  if (Object.keys(fields).length === 0) return { ok: true, data: undefined };

  // Essai expiré / abonnement inactif : les QR codes restent créables,
  // mais aucune campagne ne peut être (ré)activée.
  if (fields.status === "active" && !hasActiveAccess(organization)) {
    return {
      ok: false,
      error:
        "Votre essai gratuit est terminé. Abonnez-vous pour activer vos campagnes — vous pouvez toujours préparer vos QR codes en attendant.",
    };
  }

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

/**
 * Actions proposées au joueur avant de lancer la roue (par campagne) :
 * newsletter, Instagram, TikTok, avis Google.
 */
export async function updateCampaignEngagement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignEngagementSchema.safeParse({
    id: formData.get("id"),
    newsletter: formData.get("newsletter") === "on",
    instagram: formData.get("instagram") === "on",
    instagram_url: formData.get("instagram_url") ?? "",
    tiktok: formData.get("tiktok") === "on",
    tiktok_url: formData.get("tiktok_url") ?? "",
    google_review: formData.get("google_review") === "on",
    google_review_url: formData.get("google_review_url") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { organization } = await requireOrg();

  const d = parsed.data;
  const engagement: EngagementConfig = {
    newsletter: { enabled: d.newsletter },
    instagram: { enabled: d.instagram, url: d.instagram_url },
    tiktok: { enabled: d.tiktok, url: d.tiktok_url },
    google_review: { enabled: d.google_review, url: d.google_review_url },
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update({ engagement })
    .eq("id", d.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[campaigns] engagement:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${d.id}`);
  return { ok: true, data: undefined };
}

/**
 * Réglages du formulaire après gain : email/téléphone demandés ou non
 * avant d'afficher le code, compte à rebours avant masquage du code.
 */
export async function updateCampaignClaim(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateCampaignClaimSchema.safeParse({
    id: formData.get("id"),
    collect_email: formData.get("collect_email") === "on",
    collect_phone: formData.get("collect_phone") === "on",
    code_ttl_seconds: formData.get("code_ttl_seconds") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const { organization } = await requireOrg();

  const { id, ...fields } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(fields)
    .eq("id", id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[campaigns] claim settings:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

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

  const { organization } = await requireOrg();

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
