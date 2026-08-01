import "server-only";

import { deliverWebhookEvent, type WebhookEvent } from "@/lib/webhooks";
import { reportError } from "@/lib/monitoring";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Drain de la file webhook_deliveries — partagé entre /api/cron/jobs et
 * /api/cron/webhooks. À l'épuisement des tentatives la livraison passe en
 * dead-letter (failed_at) — rejouable depuis les Réglages.
 *
 * ⚠️ « LE WORKER FRÉQUENT, TOUTES LES 5 MIN » ÉTAIT FAUX, et cette phrase
 * portait tout le reste du commentaire : les délais de retry sont exprimés en
 * MINUTES, ce qui n'a de sens que si quelqu'un repasse à cette échelle.
 * Mesuré : les deux appelants sont des crons Vercel QUOTIDIENS (`20 4 * * *`
 * et `5 9 * * *`). Un retry planifié à +2 min attend donc le passage suivant,
 * c'est-à-dire des heures. La planification pg_cron à 5 minutes
 * (`lastchance-jobs-worker`, migration 20260722100000) existe mais reste
 * inactive tant que les secrets Vault `jobs_worker_url` et
 * `sync_contests_secret` ne sont pas posés — les poser rend au backoff en
 * minutes le sens qu'il n'a pas aujourd'hui.
 */

/** Tentatives maximum (aligné sur le filtre de claim_webhook_deliveries). */
export const WEBHOOK_MAX_ATTEMPTS = 12;

export interface WebhookDrainSummary {
  claimed: number;
  delivered: number;
  deadLettered: number;
}

export async function drainWebhookDeliveries(
  admin: ReturnType<typeof createAdminClient>,
  limit = 50,
): Promise<WebhookDrainSummary> {
  const summary: WebhookDrainSummary = { claimed: 0, delivered: 0, deadLettered: 0 };

  const { data, error } = await admin.rpc("claim_webhook_deliveries", {
    p_limit: limit,
  });
  if (error) {
    reportError("webhooks.claim", error.message);
    return summary;
  }
  const deliveries = (data ?? []) as Array<{
    id: string;
    organization_id: string;
    event: WebhookEvent;
    data: Record<string, unknown>;
    created_at: string;
    attempts: number;
  }>;
  summary.claimed = deliveries.length;

  for (const item of deliveries) {
    const { data: org } = await admin
      .from("organizations")
      .select("webhook_url, webhook_secret")
      .eq("id", item.organization_id)
      .maybeSingle();
    if (!org?.webhook_url) {
      await admin
        .from("webhook_deliveries")
        .update({
          delivered_at: new Date().toISOString(),
          last_error: "webhook disabled",
          locked_until: null,
        })
        .eq("id", item.id);
      continue;
    }
    try {
      await deliverWebhookEvent({
        deliveryId: item.id,
        createdAt: item.created_at,
        webhookUrl: org.webhook_url,
        webhookSecret: org.webhook_secret,
        event: item.event,
        data: item.data,
      });
      await admin
        .from("webhook_deliveries")
        .update({
          delivered_at: new Date().toISOString(),
          last_error: null,
          locked_until: null,
          failed_at: null,
        })
        .eq("id", item.id);
      summary.delivered += 1;
    } catch (deliveryError) {
      const exhausted = item.attempts >= WEBHOOK_MAX_ATTEMPTS;
      const delayMinutes = Math.min(24 * 60, 2 ** Math.min(item.attempts, 10));
      await admin
        .from("webhook_deliveries")
        .update({
          last_error:
            deliveryError instanceof Error
              ? deliveryError.message.slice(0, 500)
              : "delivery failed",
          locked_until: null,
          next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
          // Dead-letter : tentatives épuisées — visible et rejouable.
          ...(exhausted ? { failed_at: new Date().toISOString() } : {}),
        })
        .eq("id", item.id);
      if (exhausted) summary.deadLettered += 1;
      reportError("cron.webhooks.delivery", deliveryError);
    }
  }

  // Les accusés ne contiennent plus de données utiles après 30 jours.
  await admin
    .from("webhook_deliveries")
    .delete()
    .not("delivered_at", "is", null)
    .lt("delivered_at", new Date(Date.now() - 30 * 86_400_000).toISOString());

  return summary;
}
