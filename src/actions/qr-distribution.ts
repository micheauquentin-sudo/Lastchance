"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import { posterConfigSchema, type PosterConfig } from "@/lib/poster";
import {
  materializePosterImages,
  posterImagePaths,
  removePosterImages,
  PosterImageError,
} from "@/lib/poster-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/utils";
import type { QrStyle } from "@/types/database";
import { qrDistributionKinds, type QrDistributionKind } from "@/lib/qr-distribution";


const assetSchema = z.object({
  resourceKind: z.enum(qrDistributionKinds),
  resourceId: z.string().uuid(),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");
const styleSchema = assetSchema.extend({
  id: z.string().uuid(),
  dark: hexColor.default("#18181b"),
  light: hexColor.default("#ffffff"),
  logo: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Logo invalide").max(200_000, "Logo trop lourd").nullable(),
  logoScale: z.number().min(0.12).max(0.32).default(0.22),
  pattern: z.enum(["square", "rounded", "dots", "diamond", "fluid", "lines-h", "lines-v", "classy"]).default("square"),
  eyeStyle: z.enum(["square", "rounded", "circle", "leaf"]).default("square"),
  eyeColor: hexColor.nullable().default(null),
  gradientType: z.enum(["none", "linear", "radial"]).default("none"),
  darkTo: hexColor.nullable().default(null),
  frame: z.enum(["none", "banner"]).default("none"),
  frameText: z.string().trim().max(32, "Texte du cadre trop long").default("SCANNEZ-MOI"),
  frameColor: hexColor.default("#211d16"),
});

type Asset = { id: string; style: QrStyle; poster: Record<string, unknown> };

async function editorContext() {
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") return null;
  return organization;
}

/**
 * Le navigateur ne fournit jamais une URL : il désigne une ressource et cette
 * fonction prouve qu'elle appartient au tenant actif avant toute écriture.
 */
async function ownsPublicResource(
  resourceKind: QrDistributionKind,
  resourceId: string,
  organizationId: string,
): Promise<boolean> {
  // Duo Miroir et Portrait sont des salons uniques par établissement : leur
  // QR désigne directement l'organisation, pas une sous-table de ressource.
  if (resourceKind === "duo" || resourceKind === "portrait") {
    return resourceId === organizationId;
  }
  const supabase = await createClient();
  // Branches explicites : une map de tables effacerait l'inférence Supabase.
  if (resourceKind === "quiz") {
    const { data } = await supabase.from("quizzes").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active";
  }
  if (resourceKind === "calendar") {
    const { data } = await supabase.from("calendars").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active";
  }
  if (resourceKind === "pronostics") {
    const { data } = await supabase.from("contests").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return Boolean(data && data.status !== "draft");
  }
  if (resourceKind === "jackpot") {
    const { data } = await supabase.from("jackpot_campaigns").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active";
  }
  if (resourceKind === "loyalty") {
    const { data } = await supabase.from("loyalty_programs").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return data?.status === "active";
  }
  if (resourceKind === "event") {
    const { data } = await supabase.from("event_sessions").select("status").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return Boolean(data && data.status !== "archived");
  }
  if (resourceKind === "reservation") {
    const { data } = await supabase.from("reservation_activities").select("id").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return Boolean(data);
  }
  if (resourceKind === "hunt_step") {
    const { data } = await supabase.from("hunt_steps").select("id").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
    return Boolean(data);
  }
  const { data } = await supabase.from("vitrine_settings").select("id").eq("id", resourceId).eq("organization_id", organizationId).maybeSingle();
  return Boolean(data);
}

export async function getQrDistributionAsset(input: {
  resourceKind: QrDistributionKind;
  resourceId: string;
}): Promise<ActionResult<Asset | null>> {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "QR invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  if (!await ownsPublicResource(parsed.data.resourceKind, parsed.data.resourceId, organization.id)) {
    return { ok: false, error: "Animation introuvable" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_distribution_assets")
    .select("id, style, poster")
    .eq("organization_id", organization.id)
    .eq("resource_kind", parsed.data.resourceKind)
    .eq("resource_id", parsed.data.resourceId)
    .maybeSingle();
  if (error) {
    reportError("qr-distribution.load", error.message);
    return { ok: false, error: "Lecture du QR impossible" };
  }
  return { ok: true, data: data ? { id: data.id, style: data.style as QrStyle, poster: data.poster as Record<string, unknown> } : null };
}

export async function ensureQrDistributionAsset(input: {
  resourceKind: QrDistributionKind;
  resourceId: string;
}): Promise<ActionResult<Asset>> {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "QR invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  if (!await ownsPublicResource(parsed.data.resourceKind, parsed.data.resourceId, organization.id)) {
    return { ok: false, error: "Animation introuvable" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_distribution_assets")
    .upsert({ organization_id: organization.id, resource_kind: parsed.data.resourceKind, resource_id: parsed.data.resourceId }, { onConflict: "organization_id,resource_kind,resource_id" })
    .select("id, style, poster")
    .maybeSingle();
  if (error || !data) {
    reportError("qr-distribution.ensure", error?.message ?? "missing asset");
    return { ok: false, error: "Création du QR impossible" };
  }
  return { ok: true, data: { id: data.id, style: data.style as QrStyle, poster: data.poster as Record<string, unknown> } };
}

export async function getQrDistributionRewardCount(input: {
  resourceKind: QrDistributionKind;
  resourceId: string;
}): Promise<ActionResult<number | null>> {
  const parsed = assetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "QR invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  if (!await ownsPublicResource(parsed.data.resourceKind, parsed.data.resourceId, organization.id)) {
    return { ok: false, error: "Animation introuvable" };
  }
  const experienceKind = {
    quiz: "quiz", calendar: "calendar", pronostics: "contest", jackpot: "jackpot",
    loyalty: "loyalty", event: "event", reservation: null, duo: null, portrait: null,
    hunt_step: null, vitrine: null,
  }[parsed.data.resourceKind];
  if (!experienceKind) return { ok: true, data: null };
  // `experience_events` est un journal brut sans droit SELECT pour la session
  // commerçant. L'appartenance de la ressource vient d'être vérifiée avec RLS ;
  // le client d'administration ne lit donc qu'un agrégat borné à ce tenant.
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("experience_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("experience_kind", experienceKind)
    .eq("experience_id", parsed.data.resourceId)
    .eq("event_name", "reward_issued");
  if (error) {
    reportError("qr-distribution.reward-count", error.message);
    return { ok: false, error: "Lecture des gains impossible" };
  }
  return { ok: true, data: count ?? 0 };
}

/** Même indicateur, au grain d'une affiche de campagne (qr_codes). */
export async function getCampaignQrRewardCount(id: string): Promise<ActionResult<number>> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "QR invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  const supabase = await createClient();
  const { data: qr } = await supabase.from("qr_codes").select("id").eq("id", id).eq("organization_id", organization.id).maybeSingle();
  if (!qr) return { ok: false, error: "QR code introuvable" };
  const admin = createAdminClient();
  const { count, error } = await admin.from("experience_events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("qr_code_id", id).eq("event_name", "reward_issued");
  if (error) return { ok: false, error: "Lecture des gains impossible" };
  return { ok: true, data: count ?? 0 };
}

export async function updateQrDistributionStyle(
  input: { id: string; resourceKind: QrDistributionKind; resourceId: string } & Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Style invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  const { id, resourceKind, resourceId, ...style } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("qr_distribution_assets")
    .update({ style })
    .eq("id", id).eq("organization_id", organization.id)
    .eq("resource_kind", resourceKind).eq("resource_id", resourceId)
    .select("id").maybeSingle();
  if (error || !data) {
    reportError("qr-distribution.style", error?.message ?? "missing asset");
    return { ok: false, error: "Enregistrement impossible" };
  }
  revalidatePath("/dashboard/qr-codes");
  return { ok: true, data: undefined };
}

export async function saveQrDistributionPoster(
  _prev: ActionResult<PosterConfig> | null,
  formData: FormData,
): Promise<ActionResult<PosterConfig>> {
  const id = formData.get("id");
  const raw = formData.get("poster");
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success || typeof raw !== "string") {
    return { ok: false, error: "Données invalides" };
  }
  if (raw.length > 3_000_000) return { ok: false, error: "Affiche trop lourde : retirez ou réduisez des images." };
  let candidate: unknown;
  try { candidate = JSON.parse(raw); } catch { return { ok: false, error: "Affiche illisible" }; }
  const parsed = posterConfigSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Affiche invalide" };
  const organization = await editorContext();
  if (!organization) return { ok: false, error: "Action non autorisée" };
  const supabase = await createClient();
  const { data: asset } = await supabase
    .from("qr_distribution_assets")
    .select("id, poster")
    .eq("id", id).eq("organization_id", organization.id).maybeSingle();
  if (!asset) return { ok: false, error: "QR code introuvable" };
  const admin = createAdminClient();
  let materialized: Awaited<ReturnType<typeof materializePosterImages>>;
  try {
    materialized = await materializePosterImages(parsed.data, { organizationId: organization.id, qrId: id }, admin);
  } catch (error) {
    reportError("qr-distribution.poster-images", error);
    return { ok: false, error: error instanceof PosterImageError ? error.message : "Envoi des images impossible" };
  }
  const { data: updated, error } = await supabase
    .from("qr_distribution_assets")
    .update({ poster: materialized.config })
    .eq("id", id).eq("organization_id", organization.id)
    .select("id").maybeSingle();
  if (error || !updated) {
    reportError("qr-distribution.poster", error?.message ?? "missing asset");
    await removePosterImages(materialized.uploadedPaths, admin);
    return { ok: false, error: "Enregistrement impossible" };
  }
  const previous = posterConfigSchema.safeParse(asset.poster);
  if (previous.success) {
    const retained = new Set(posterImagePaths(materialized.config));
    await removePosterImages(posterImagePaths(previous.data).filter((path) => !retained.has(path)), admin);
  }
  revalidatePath(`/poster/distribution/${id}`);
  revalidatePath("/dashboard/qr-codes");
  return { ok: true, data: materialized.config };
}
