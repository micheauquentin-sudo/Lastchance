"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { revalidatePlaySlugs } from "@/lib/revalidate-play";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/utils";

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 Mo (aligné sur le bucket)
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function requireOrg() {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
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
 * l'affiche). L'upload passe par le service role — la RLS de
 * `organizations` re-vérifie l'appartenance lors de l'update du champ.
 */
export async function uploadLogo(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choisissez une image" };
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return { ok: false, error: "Format accepté : PNG, JPEG ou WebP" };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Image trop lourde (2 Mo maximum)" };
  }

  const organization = await requireOrg();
  const admin = createAdminClient();

  const path = `${organization.id}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("logos")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[branding] upload:", uploadError.message);
    return { ok: false, error: "Envoi impossible, réessayez" };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("logos").getPublicUrl(path);

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ logo_url: publicUrl })
    .eq("id", organization.id);

  if (error) {
    console.error("[branding] update logo_url:", error.message);
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
  const { error } = await supabase
    .from("organizations")
    .update({ logo_url: null })
    .eq("id", organization.id);

  if (error) {
    console.error("[branding] remove logo:", error.message);
    return { ok: false, error: "Suppression impossible" };
  }

  await removeStoredLogo(organization.logo_url);

  revalidatePath("/dashboard/settings");
  await revalidatePlaySlugs(supabase, { organizationId: organization.id });
  return { ok: true, data: undefined };
}
