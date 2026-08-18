"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { requireOrganizationOwner } from "@/lib/authorization";
import { reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { webhookUrlSchema } from "@/lib/validations/webhooks";
import { assertSafeWebhookUrl } from "@/lib/webhook-url";
import type { ActionResult } from "@/lib/utils";

/** Enregistre (ou retire, si vide) l'URL du webhook sortant de l'org. */
export async function updateWebhookUrl(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = webhookUrlSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { organization } = await requireOrganizationOwner();

  if (parsed.data.url) {
    try {
      await assertSafeWebhookUrl(parsed.data.url);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Destination webhook interdite.",
      };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ webhook_url: parsed.data.url })
    .eq("id", organization.id);

  if (error) {
    reportError("webhooks.update-url", error.message);
    return { ok: false, error: "Enregistrement impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}

/** Régénère le secret de signature — invalide les anciennes signatures. */
export async function regenerateWebhookSecret(): Promise<ActionResult> {
  const { organization } = await requireOrganizationOwner();

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ webhook_secret: randomBytes(24).toString("hex") })
    .eq("id", organization.id);

  if (error) {
    reportError("webhooks.regenerate-secret", error.message);
    return { ok: false, error: "Régénération impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: undefined };
}

/**
 * Rejoue les livraisons en dead-letter (tentatives épuisées) de l'org :
 * compteur remis à zéro, re-livraison au prochain passage du worker.
 * Le récepteur du commerçant a généralement été réparé entre-temps — sinon la
 * livraison retombera en dead-letter.
 *
 * Cadence : « 5 minutes au plus » est REDEVENU vrai. Ce commentaire a annoncé
 * des crons « QUOTIDIENS » (`20 4 * * *` pour /api/cron/jobs, `5 9 * * *` pour
 * /api/cron/webhooks) au motif que les secrets Vault `jobs_worker_url` et
 * `sync_contests_secret` manquaient à pg_cron. Ils sont posés depuis le
 * chantier « cadence-file » (2026-08-01, ADR-062) : `lastchance-jobs-worker`
 * appelle /api/cron/jobs toutes les 5 MINUTES en production, et les crons
 * Vercel ne sont plus qu'un filet. Le rejeu repart donc au prochain quart
 * d'heure, pas le lendemain matin — ce que promet déjà l'écran commerçant
 * (`src/components/dashboard/webhook-form.tsx`).
 */
export async function retryFailedWebhookDeliveries(): Promise<
  ActionResult<{ retried: number }>
> {
  const { organization } = await requireOrganizationOwner();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("webhook_deliveries")
    .update({
      attempts: 0,
      failed_at: null,
      locked_until: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id)
    .not("failed_at", "is", null)
    .is("delivered_at", null)
    .select("id");

  if (error) {
    reportError("webhooks.retry-dead-letter", error.message);
    return { ok: false, error: "Rejeu impossible" };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, data: { retried: (data ?? []).length } };
}
