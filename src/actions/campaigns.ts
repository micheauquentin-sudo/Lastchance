"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { createClient } from "@/lib/supabase/server";
import { hasActiveAccess } from "@/lib/subscription";
import {
  createCampaignSchema,
  deleteCampaignSchema,
  duplicateCampaignSchema,
  updateCampaignClaimSchema,
  updateCampaignEngagementSchema,
  updateCampaignSchema,
} from "@/lib/validations/campaigns";
import type { ActionResult } from "@/lib/utils";
import type { EngagementConfig, Prize, Wheel } from "@/types/database";

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
  // Le statut (active/paused) gate la page publique : purge ISR /play.
  await revalidatePlaySlugs(supabase, { campaignId: id });
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
  // Fonction conservée uniquement pour invalider proprement d'anciens
  // formulaires encore ouverts pendant un déploiement. Le jeu n'est plus
  // conditionnable à une action ni à la fourniture d'une coordonnée.
  const engagementGatesEnabled = false as boolean;
  if (!engagementGatesEnabled) {
    return { ok: false, error: "Les actions obligatoires avant le jeu ont été supprimées." };
  }
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
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

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
  await revalidatePlaySlugs(supabase, { campaignId: d.id });
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
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

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
  await revalidatePlaySlugs(supabase, { campaignId: id });
  return { ok: true, data: undefined };
}

/**
 * Duplique une campagne (réglages, roues, lots) comme point de départ
 * d'une nouvelle campagne — utile pour relancer un jeu saisonnier sans
 * tout recréer à la main. La copie démarre toujours en brouillon, sans
 * QR codes ni période de dates (à reconfigurer), et sans historique
 * (spins/participations restent attachés à la campagne d'origine).
 */
export async function duplicateCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = duplicateCampaignSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, error: "Données invalides" };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();

  const { data: source } = await supabase
    .from("campaigns")
    .select("*, wheels(*, prizes(*))")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!source) return { ok: false, error: "Campagne introuvable" };

  const { wheels, ...sourceCampaign } = source as unknown as {
    name: string;
    engagement: EngagementConfig;
    collect_email: boolean;
    collect_phone: boolean;
    code_ttl_seconds: number | null;
    wheels: (Wheel & { prizes: Prize[] })[];
  };

  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organization.id,
      name: `${sourceCampaign.name} (copie)`,
      engagement: sourceCampaign.engagement,
      collect_email: sourceCampaign.collect_email,
      collect_phone: sourceCampaign.collect_phone,
      code_ttl_seconds: sourceCampaign.code_ttl_seconds,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !newCampaign) {
    console.error("[campaigns] duplicate:", error?.message);
    return { ok: false, error: "Impossible de dupliquer la campagne" };
  }

  for (const w of wheels ?? []) {
    const { data: newWheel, error: wheelError } = await supabase
      .from("wheels")
      .insert({
        organization_id: organization.id,
        campaign_id: newCampaign.id,
        name: w.name,
        theme: w.theme,
        play_limit: w.play_limit,
        style: w.style,
        position: w.position,
        schedule_start_hour: w.schedule_start_hour,
        schedule_end_hour: w.schedule_end_hour,
        schedule_days: w.schedule_days,
        game_type: w.game_type,
      })
      .select("id")
      .single();

    if (wheelError || !newWheel) {
      console.error("[campaigns] duplicate wheel:", wheelError?.message);
      continue;
    }

    const prizesPayload = (w.prizes ?? []).map((p) => ({
      organization_id: organization.id,
      wheel_id: newWheel.id,
      label: p.label,
      description: p.description,
      color: p.color,
      weight: p.weight,
      is_losing: p.is_losing,
      stock: p.stock,
      position: p.position,
      is_active: p.is_active,
    }));
    if (prizesPayload.length > 0) {
      const { error: prizesError } = await supabase
        .from("prizes")
        .insert(prizesPayload);
      if (prizesError) {
        console.error("[campaigns] duplicate prizes:", prizesError.message);
      }
    }
  }

  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/campaigns/${newCampaign.id}`);
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

  // Purge ISR avant la suppression : les qr_codes partent en cascade
  // avec la campagne, leurs slugs seraient introuvables après coup.
  await revalidatePlaySlugs(supabase, { campaignId: parsed.data.id });

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
