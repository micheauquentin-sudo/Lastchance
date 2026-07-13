"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { createClient } from "@/lib/supabase/server";
import {
  addPrizeSchema,
  createWheelSchema,
  deletePrizeSchema,
  deleteWheelSchema,
  updatePrizeSchema,
  updateWheelSchema,
  updateWheelScheduleSchema,
} from "@/lib/validations/prizes";
import { wheelStyleSchema } from "@/lib/wheel-style";
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
  await revalidatePlaySlugs(supabase, { campaignId: wheel.campaign_id });
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
  if (campaignId) {
    revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
    await revalidatePlaySlugs(supabase, { campaignId });
  }
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
  if (campaignId) {
    revalidatePath(`/dashboard/campaigns/${campaignId}/wheel`);
    await revalidatePlaySlugs(supabase, { campaignId });
  }
  return { ok: true, data: undefined };
}

export async function updateWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateWheelSchema.safeParse({
    id: formData.get("id"),
    play_limit: formData.get("play_limit"),
    game_type: formData.get("game_type"),
  });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ play_limit: parsed.data.play_limit, game_type: parsed.data.game_type })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[prizes] updateWheel:", error?.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  // Le type de jeu change le rendu de /play : purge immédiate du cache ISR.
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  return { ok: true, data: undefined };
}

/** Enregistre le créneau horaire d'une roue (multi-roues planifiées). */
export async function updateWheelSchedule(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateWheelScheduleSchema.safeParse({
    id: formData.get("id"),
    schedule_start_hour: formData.get("schedule_start_hour") ?? "",
    schedule_end_hour: formData.get("schedule_end_hour") ?? "",
    schedule_days: formData.getAll("schedule_days"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { id, schedule_days, ...hours } = parsed.data;
  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ ...hours, schedule_days: schedule_days.length ? schedule_days : null })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[prizes] updateWheelSchedule:", error?.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}`);
  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  return { ok: true, data: undefined };
}

/**
 * Crée une roue supplémentaire dans une campagne (multi-roues). La
 * nouvelle roue est planifiable pour ne s'activer que sur un créneau ;
 * elle démarre avec les lots par défaut pour être jouable de suite.
 */
export async function createWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createWheelSchema.safeParse({
    campaign_id: formData.get("campaign_id"),
    name: formData.get("name"),
  });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  // La campagne doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  // Limite raisonnable + calcul de la position suivante.
  const { count } = await supabase
    .from("wheels")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id);
  if ((count ?? 0) >= 8) {
    return { ok: false, error: "Maximum 8 roues par campagne" };
  }

  const { data: wheel, error } = await supabase
    .from("wheels")
    .insert({
      organization_id: organization.id,
      campaign_id: campaign.id,
      name: parsed.data.name,
      position: count ?? 0,
    })
    .select("id")
    .single();

  if (error || !wheel) {
    console.error("[prizes] createWheel:", error?.message);
    return { ok: false, error: "Impossible de créer la roue" };
  }

  const { error: prizesError } = await supabase.from("prizes").insert(
    DEFAULT_WHEEL_PRIZES.map((p) => ({
      ...p,
      organization_id: organization.id,
      wheel_id: wheel.id,
    })),
  );
  if (prizesError) console.error("[prizes] createWheel prizes:", prizesError.message);

  revalidatePath(`/dashboard/campaigns/${campaign.id}`);
  await revalidatePlaySlugs(supabase, { campaignId: campaign.id });
  return { ok: true, data: undefined };
}

/**
 * Supprime une roue. Refuse la dernière roue d'une campagne : /play a
 * toujours besoin d'au moins une roue à servir.
 */
export async function deleteWheel(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteWheelSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: wheel } = await supabase
    .from("wheels")
    .select("id, campaign_id")
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!wheel) return { ok: false, error: "Roue introuvable" };

  const { count } = await supabase
    .from("wheels")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", wheel.campaign_id);
  if ((count ?? 0) <= 1) {
    return { ok: false, error: "Impossible de supprimer la dernière roue" };
  }

  const { error } = await supabase
    .from("wheels")
    .delete()
    .eq("id", wheel.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[prizes] deleteWheel:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${wheel.campaign_id}`);
  await revalidatePlaySlugs(supabase, { campaignId: wheel.campaign_id });
  return { ok: true, data: undefined };
}

/** Lots par défaut d'une nouvelle roue : jouable immédiatement. */
const DEFAULT_WHEEL_PRIZES = [
  { label: "Café offert", description: "Un café offert au comptoir.", color: "#f59e0b", weight: 40, is_losing: false, position: 0 },
  { label: "Dessert offert", description: "Un dessert au choix.", color: "#ec4899", weight: 20, is_losing: false, position: 1 },
  { label: "Surprise", description: "Une surprise de la maison.", color: "#8b5cf6", weight: 10, is_losing: false, position: 2 },
  { label: "Pas de chance", description: "Retentez votre chance bientôt !", color: "#64748b", weight: 30, is_losing: true, position: 3 },
];

/**
 * Sauvegarde la personnalisation visuelle de la roue (style jsonb).
 * L'éditeur envoie l'objet complet en JSON ; tout est re-validé ici.
 */
export async function updateWheelStyle(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("id");
  const rawJson = formData.get("style");
  if (typeof id !== "string" || typeof rawJson !== "string") {
    return { ok: false, error: "Données invalides" };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "Style illisible" };
  }

  const parsed = wheelStyleSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error.issues) };

  const organization = await requireOrg();
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("wheels")
    .update({ style: parsed.data })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("campaign_id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[prizes] updateWheelStyle:", error?.message);
    return { ok: false, error: "Mise à jour impossible" };
  }

  revalidatePath(`/dashboard/campaigns/${updated.campaign_id}/wheel`);
  // « Vos clients le voient dès maintenant » : purge le cache ISR /play.
  await revalidatePlaySlugs(supabase, { campaignId: updated.campaign_id });
  return { ok: true, data: undefined };
}
