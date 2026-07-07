"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateEngagementSchema } from "@/lib/validations/organization";
import type { ActionResult } from "@/lib/utils";
import type { EngagementConfig } from "@/types/database";

/**
 * Enregistre la configuration des actions proposées au joueur avant
 * de lancer la roue (newsletter, Instagram, TikTok, avis Google).
 */
export async function updateEngagement(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = updateEngagementSchema.safeParse({
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
    .from("organizations")
    .update({ engagement })
    .eq("id", organization.id);

  if (error) {
    console.error("[organization] engagement:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
