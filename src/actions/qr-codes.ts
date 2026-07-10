"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { posterConfigSchema } from "@/lib/poster";
import { randomCode, type ActionResult } from "@/lib/utils";

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
const qrStyleSchema = z.object({
  id: z.string().uuid(),
  dark: hexColor.default("#18181b"),
  light: hexColor.default("#ffffff"),
  logo: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Logo invalide")
    .max(200_000, "Logo trop lourd, choisissez une image plus légère")
    .nullable(),
});

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

/**
 * Sauvegarde la configuration d'affiche de l'éditeur (jsonb re-validé
 * intégralement côté serveur).
 */
export async function saveQrPoster(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get("id");
  const rawJson = formData.get("poster");
  if (typeof id !== "string" || typeof rawJson !== "string") {
    return { ok: false, error: "Données invalides" };
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

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("qr_codes")
    .update({ poster: parsed.data })
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    console.error("[qr] save poster:", error?.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath(`/poster/${id}`);
  return { ok: true, data: undefined };
}

export async function updateQrStyle(input: {
  id: string;
  dark: string;
  light: string;
  logo: string | null;
}): Promise<ActionResult> {
  const parsed = qrStyleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("qr_codes")
    .update({
      style: {
        dark: parsed.data.dark,
        light: parsed.data.light,
        logo: parsed.data.logo,
      },
    })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("[qr] update style:", error.message);
    return { ok: false, error: "Impossible d'enregistrer la personnalisation" };
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
