"use server";

import { revalidatePath } from "next/cache";
import { requireOrganizationOwner } from "@/lib/authorization";
import { reportError } from "@/lib/monitoring";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";
import sharp from "sharp";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 Mo (aligné sur le bucket)
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_INPUT_PIXELS = 16_000_000;

async function requireOrg() {
  const { organization } = await requireOrganizationOwner();
  return organization;
}

/** Supprime l'ancien fichier du bucket (best-effort, jamais bloquant). */
async function removeStoredLogo(logoUrl: string | null) {
  if (!logoUrl) return;
  const marker = "/logos/";
  const idx = logoUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(logoUrl.slice(idx + marker.length));
  const admin = createAdminClient();
  const { error } = await admin.storage.from("logos").remove([path]);
  if (error) console.warn("[branding] purge ancien logo:", error.message);
}

/**
 * Upload du logo de l'établissement (affiché sur la page /play et
 * l'affiche). L'upload et l'update passent par le service role, uniquement
 * après la garde owner de la Server Action.
 */
export async function uploadLogo(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez une image" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, error: "Format accepté : PNG, JPEG ou WebP" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Image trop lourde (2 Mo maximum)" };
  }

  const organization = await requireOrg();
  const admin = createAdminClient();

  let normalized: Buffer;
  try {
    // Décode réellement l'image : le type déclaré par le navigateur ne
    // suffit pas. La ré-encodage retire EXIF, profils et contenu annexe.
    normalized = await sharp(Buffer.from(await file.arrayBuffer()), {
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      // 256 px et non 1600 : AUCUNE surface du produit n'affiche le logo
      // au-delà de 64 px (en-tête du dashboard, pastille de la page joueur,
      // affiche QR). On servait donc, à chaque chargement de page publique, une
      // image six fois trop large pour son plus grand usage — plusieurs
      // centaines de kilo-octets sur un réseau mobile, pour des pixels que
      // personne ne voit. 256 laisse la marge d'un écran 4× (64 × 4).
      //
      // Les logos DÉJÀ envoyés restent lourds : cette action ne retraite que ce
      // qui passe par elle. Ils se réduiront au prochain envoi, et pas avant —
      // un retraitement rétroactif du bucket n'a pas été fait, faute de gain
      // proportionné au risque de casser une URL publique en circulation.
      .resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
  } catch (error) {
    console.warn("[branding] image rejetée:", error);
    return { ok: false, error: "Fichier image invalide ou dimensions excessives" };
  }
  if (normalized.length > MAX_LOGO_BYTES) {
    return { ok: false, error: "Image trop complexe après traitement" };
  }

  const path = `${organization.id}/logo-${Date.now()}.webp`;
  const { error: uploadError } = await admin.storage
    .from("logos")
    .upload(path, normalized, { contentType: "image/webp", upsert: false });

  if (uploadError) {
    reportError("branding.upload", uploadError.message);
    return { ok: false, error: "Envoi impossible, réessayez" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("logos").getPublicUrl(path);

  const supabase = await createClient();
  const { error } = await admin
    .from("organizations")
    .update({ logo_url: publicUrl })
    .eq("id", organization.id);

  if (error) {
    reportError("branding.update-logo-url", error.message);
    await admin.storage.from("logos").remove([path]);
    return { ok: false, error: "Enregistrement impossible" };
  }

  await removeStoredLogo(organization.logo_url);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard", "layout");
  // Le logo apparaît sur toutes les pages /play de l'établissement.
  await revalidatePlaySlugs(supabase, { organizationId: organization.id });
  return { ok: true, data: undefined };
}

/** Retire le logo (la page /play retombe sur le nom seul). */
export async function removeLogo(): Promise<ActionResult> {
  const organization = await requireOrg();

  const supabase = await createClient();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ logo_url: null })
    .eq("id", organization.id);

  if (error) {
    reportError("branding.remove-logo", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  await removeStoredLogo(organization.logo_url);

  revalidatePath("/dashboard/settings");
  await revalidatePlaySlugs(supabase, { organizationId: organization.id });
  return { ok: true, data: undefined };
}
