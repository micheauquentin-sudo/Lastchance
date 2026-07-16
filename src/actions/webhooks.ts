"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { webhookUrlSchema } from "@/lib/validations/webhooks";
import type { ActionResult } from "@/lib/utils";

/** Enregistre (ou retire, si vide) l'URL du webhook sortant de l'org. */
export async function updateWebhookUrl(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = webhookUrlSchema.safeParse({ url: formData.get("url") ?? "" });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ webhook_url: parsed.data.url })
    .eq("id", organization.id);

  if (error) {
    console.error("[webhooks] update url:", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}

/** Régénère le secret de signature — invalide les anciennes signatures. */
export async function regenerateWebhookSecret(): Promise<ActionResult> {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ webhook_secret: randomBytes(24).toString("hex") })
    .eq("id", organization.id);

  if (error) {
    console.error("[webhooks] regenerate secret:", error.message);
    return { ok: false, error: "Régénération impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}
