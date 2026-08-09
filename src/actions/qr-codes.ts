"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { reportError } from "@/lib/monitoring";
import { createClient } from "@/lib/supabase/server";
import { posterConfigSchema, type PosterConfig } from "@/lib/poster";
import {
  materializePosterImages,
  posterImagePaths,
  removePosterImages,
  PosterImageError,
} from "@/lib/poster-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { qrStyleDuJeu } from "@/lib/qr-style-du-jeu";
import { resolveWheelStyle } from "@/lib/wheel-style";
import { selectActiveWheel } from "@/lib/wheel-schedule";
import { randomCode, type ActionResult } from "@/lib/utils";
import type { Wheel } from "@/types/database";

const createQrSchema = z.object({
  campaign_id: z.string().uuid("Campagne invalide"),
  label: z.string().trim().max(120, "Libellé trop long").default(""),
});

const deleteQrSchema = z.object({ id: z.string().uuid() });

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide");

// Le logo est normalisé côté client en PNG ≤ 256px ; on borne la taille
// de la data URL (~150 Ko binaire) pour éviter de gonfler la table.
// Les champs du studio QR (motif, yeux, dégradé, cadre) sont tous
// optionnels avec défauts — un ancien style { dark, light, logo }
// reste valide tel quel.
const qrStyleSchema = z.object({
  id: z.string().uuid(),
  dark: hexColor.default("#18181b"),
  light: hexColor.default("#ffffff"),
  logo: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Logo invalide")
    .max(200_000, "Logo trop lourd, choisissez une image plus légère")
    .nullable(),
  logoScale: z.number().min(0.12).max(0.32).default(0.22),
  pattern: z
    .enum(["square", "rounded", "dots", "diamond", "fluid", "lines-h", "lines-v", "classy"])
    .default("square"),
  eyeStyle: z.enum(["square", "rounded", "circle", "leaf"]).default("square"),
  eyeColor: hexColor.nullable().default(null),
  gradientType: z.enum(["none", "linear", "radial"]).default("none"),
  darkTo: hexColor.nullable().default(null),
  frame: z.enum(["none", "banner"]).default("none"),
  frameText: z.string().trim().max(32, "Texte du cadre trop long").default("SCANNEZ-MOI"),
  frameColor: hexColor.default("#211d16"),
});

export async function createQrCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = createQrSchema.safeParse({
    campaign_id: formData.get("campaign_id"),
    label: formData.get("label"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // MÊME GARDE QUE `saveQrPoster`. Sans elle, un caissier était arrêté par la
  // seule RLS, dont l'échec revient ici en `error` — donc en « Impossible de
  // créer le QR code » et en `reportError` : un refus d'autorisation déguisé en
  // panne technique, que le commerçant signale comme un bug.
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();

  // La campagne doit appartenir à l'org (la RLS re-vérifie à l'insert).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("id", parsed.data.campaign_id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };

  // Le QR naît habillé comme le jeu qu'il ouvre (voir `lib/qr-style-du-jeu.ts`).
  // Dérivation 100 % SERVEUR : aucun champ de style n'entre par le formulaire,
  // `createQrSchema` ne prend toujours que `campaign_id` et `label`.
  const { data: wheelRows } = await supabase
    .from("wheels")
    .select(
      "id, position, created_at, schedule_start_hour, schedule_end_hour, schedule_days, style",
    )
    .eq("campaign_id", campaign.id)
    .eq("organization_id", organization.id)
    .order("position", { ascending: true });

  type RoueStylable = Pick<
    Wheel,
    | "id"
    | "position"
    | "created_at"
    | "schedule_start_hour"
    | "schedule_end_hour"
    | "schedule_days"
    | "style"
  >;
  const roues = (wheelRows ?? []) as RoueStylable[];
  // Hors créneau, `selectActiveWheel` ne rend rien — c'est juste pour /play, où
  // un horaire ne doit jamais être contourné. Un QR, lui, est imprimé une fois
  // et vaut pour toutes les heures : on retombe sur la première roue (l'ordre
  // du commerçant) plutôt que de le faire naître en noir et blanc parce qu'il a
  // été créé un mardi matin.
  const roue =
    selectActiveWheel(roues, new Date(), organization.timezone || "Europe/Paris") ??
    roues[0] ??
    null;
  const style = roue ? qrStyleDuJeu(resolveWheelStyle(roue.style)) : null;

  const { error } = await supabase.from("qr_codes").insert({
    organization_id: organization.id,
    campaign_id: campaign.id,
    slug: randomCode(8),
    label: parsed.data.label,
    // Absent quand il n'y a rien à dériver : le jsonb garde son défaut `'{}'`,
    // c'est-à-dire exactement le rendu d'avant ce chantier.
    ...(style ? { style } : {}),
  });

  if (error) {
    reportError("qr-codes.create", error.message);
    return { ok: false, error: "Impossible de créer le QR code" };
  }

  revalidatePath("/dashboard/qr-codes");
  // La page du jeu instantané liste désormais ses propres QR et porte le
  // formulaire de création : sans cela, le QR tout juste créé n'y apparaît pas.
  revalidatePath(`/dashboard/campaigns/${campaign.id}`);
  return { ok: true, data: undefined };
}

/**
 * Sauvegarde la configuration d'affiche de l'éditeur (jsonb re-validé
 * intégralement côté serveur).
 */
export async function saveQrPoster(
  _prev: ActionResult<PosterConfig> | null,
  formData: FormData,
): Promise<ActionResult<PosterConfig>> {
  const id = formData.get("id");
  const rawJson = formData.get("poster");
  if (
    typeof id !== "string" ||
    !z.string().uuid().safeParse(id).success ||
    typeof rawJson !== "string"
  ) {
    return { ok: false, error: "Données invalides" };
  }
  // Garde-fou global (images embarquées en data URL) avant tout parse.
  if (rawJson.length > 3_000_000) {
    return { ok: false, error: "Affiche trop lourde : retirez ou réduisez des images." };
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "Affiche illisible" };
  }

  const parsed = posterConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();
  const { data: qr } = await supabase
    .from("qr_codes")
    .select("id, poster")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!qr) return { ok: false, error: "QR code introuvable" };

  const admin = createAdminClient();
  let materialized: Awaited<ReturnType<typeof materializePosterImages>>;
  try {
    materialized = await materializePosterImages(
      parsed.data,
      { organizationId: organization.id, qrId: id },
      admin,
    );
  } catch (error) {
    reportError("qr-codes.poster-images", error);
    return {
      ok: false,
      error: error instanceof PosterImageError ? error.message : "Envoi des images impossible",
    };
  }

  const { data: updated, error } = await supabase
    .from("qr_codes")
    .update({ poster: materialized.config })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    reportError("qr-codes.save-poster", error?.message ?? "raison inconnue");
    await removePosterImages(materialized.uploadedPaths, admin);
    return { ok: false, error: "Enregistrement impossible" };
  }

  const previous = posterConfigSchema.safeParse(qr.poster);
  if (previous.success) {
    const retained = new Set(posterImagePaths(materialized.config));
    await removePosterImages(
      posterImagePaths(previous.data).filter((path) => !retained.has(path)),
      admin,
    );
  }

  revalidatePath(`/poster/${id}`);
  return { ok: true, data: materialized.config };
}

export async function updateQrStyle(
  input: { id: string } & Record<string, unknown>,
): Promise<ActionResult> {
  const parsed = qrStyleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Même garde de rôle que `saveQrPoster` : la RLS reste le mur, mais un refus
  // d'autorisation doit se dire comme tel, pas comme un échec d'enregistrement.
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const { id, ...style } = parsed.data;
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("qr_codes")
    .update({ style })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id, campaign_id")
    .maybeSingle();

  if (error || !updated) {
    reportError("qr-codes.update-style", error?.message ?? "raison inconnue");
    return { ok: false, error: "Impossible d'enregistrer la personnalisation" };
  }

  revalidatePath("/dashboard/qr-codes");
  // La vignette stylée est aussi rendue sur la page du jeu ; l'`update`
  // ramenait déjà une ligne, y lire `campaign_id` ne coûte rien.
  if (updated.campaign_id) {
    revalidatePath(`/dashboard/campaigns/${updated.campaign_id}`);
  }
  return { ok: true, data: undefined };
}

export async function deleteQrCode(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deleteQrSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { ok: false, error: "Données invalides" };

  // Même garde de rôle que `saveQrPoster` : la suppression est le geste le plus
  // lourd des trois — un QR imprimé et collé en vitrine cesse de fonctionner.
  const { user, organization, role } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  if (role !== "owner" && role !== "editor") {
    return { ok: false, error: "Action non autorisée" };
  }

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("qr_codes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .select("slug, poster, campaign_id")
    .maybeSingle();

  if (error) {
    reportError("qr-codes.delete", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  if (!deleted) return { ok: false, error: "QR code introuvable" };

  const poster = posterConfigSchema.safeParse(deleted.poster);
  if (poster.success) await removePosterImages(posterImagePaths(poster.data));

  revalidatePath("/dashboard/qr-codes");
  // La liste de QR vit aussi sur la page du jeu — `campaign_id` est ramené par
  // le `select` du delete, il ne coûte pas une requête de plus.
  if (deleted.campaign_id) {
    revalidatePath(`/dashboard/campaigns/${deleted.campaign_id}`);
  }
  // Purge la page publique du slug supprimé du cache ISR.
  if (deleted?.slug) revalidatePath(`/play/${deleted.slug}`);
  return { ok: true, data: undefined };
}
