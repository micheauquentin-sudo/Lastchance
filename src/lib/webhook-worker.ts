import "server-only";

import { deliverWebhookEvent, type WebhookEvent } from "@/lib/webhooks";
import { reportError } from "@/lib/monitoring";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Drain de la file webhook_deliveries — partagé entre /api/cron/jobs et
 * /api/cron/webhooks. À l'épuisement des tentatives la livraison passe en
 * dead-letter (failed_at) — rejouable depuis les Réglages.
 *
 * ── LA CADENCE EST DE 5 MINUTES, ET LE COMMENTAIRE PRÉCÉDENT DISAIT L'INVERSE
 *
 * Il affirmait que la planification pg_cron `lastchance-jobs-worker` « reste
 * inactive tant que les secrets Vault ne sont pas posés », et en tirait qu'un
 * retry planifié à +2 min attendait en réalité des heures. Les secrets sont
 * posés depuis le chantier « cadence-file » (2026-08-01, ADR-062 : une action
 * serveur les dépose au Vault, plus aucune recopie humaine de `CRON_SECRET`) :
 * pg_cron appelle /api/cron/jobs TOUTES LES 5 MINUTES en production. Le backoff
 * en minutes a donc exactement le sens qu'il annonce, et les deux crons Vercel
 * quotidiens (`20 4 * * *`, `5 9 * * *`) ne sont plus que des filets.
 *
 * ── CE QUE LE BUDGET TEMPS CHANGE ───────────────────────────────
 *
 * Chaque livraison est un appel SORTANT vers un endpoint tiers : sa durée
 * n'appartient pas à ce code. Un lot de 50 endpoints lents épuisait la fonction
 * (maxDuration = 60 s) au milieu d'une livraison — sans réponse, sans clôture,
 * et sans que rien ne le dise. Le lot descend donc à 8 et la boucle teste
 * l'horloge AVANT chaque livraison : le reliquat est RELÂCHÉ (`locked_until`
 * remis à `null`, `delivered_at` toujours nul) et repart au passage suivant,
 * cinq minutes plus tard, en tête de file.
 *
 * RÉSERVE ASSUMÉE : `claim_webhook_deliveries` incrémente `attempts` À LA
 * RÉCLAMATION. Une livraison différée par le budget a donc consommé une
 * tentative sans rien tenter — rendre ce compteur exigerait un `attempts - 1`
 * côté base, qu'un UPDATE PostgREST ne sait pas exprimer (il faudrait une RPC,
 * donc une migration). Le coût est borné : au plus 7 tentatives par passage
 * coupé, sur un plafond de 12.
 */

/** Tentatives maximum (aligné sur le filtre de claim_webhook_deliveries). */
export const WEBHOOK_MAX_ATTEMPTS = 12;

/**
 * Lot par passage. 8 et non 50 : le facteur limitant n'est pas la base mais le
 * temps de réponse des endpoints tiers, qui ne nous appartient pas.
 */
const DEFAULT_LIMIT = 8;

export interface WebhookDrainSummary {
  claimed: number;
  delivered: number;
  deadLettered: number;
  /**
   * Livraisons réclamées que le budget temps a fait relâcher sans les tenter.
   * Un plafond atteint doit être un signal, jamais une disparition.
   */
  deferred: number;
  /**
   * Écritures de clôture (ou de purge) refusées par la base. Comptées et
   * remontées, JAMAIS levées : une exception ici tuerait le drain et
   * abandonnerait les livraisons restantes du lot — adaptation du modèle
   * `settleJob` (src/lib/jobs.ts), qui lève parce que son appelant, lui, sait
   * isoler un job.
   */
  settleFailed: number;
}

export interface WebhookDrainOptions {
  /** Taille du lot réclamé (défaut 8). */
  limit?: number;
  /** Budget temps du passage ; au-delà, le reliquat est relâché. */
  budgetMs?: number;
  /** Origine de l'horloge — l'appelant PARTAGE la sienne (cf. /api/cron/jobs). */
  startedAt?: number;
}

export async function drainWebhookDeliveries(
  admin: ReturnType<typeof createAdminClient>,
  options: WebhookDrainOptions = {},
): Promise<WebhookDrainSummary> {
  const {
    limit = DEFAULT_LIMIT,
    budgetMs = Number.POSITIVE_INFINITY,
    startedAt = Date.now(),
  } = options;

  const summary: WebhookDrainSummary = {
    claimed: 0,
    delivered: 0,
    deadLettered: 0,
    deferred: 0,
    settleFailed: 0,
  };

  /** Une écriture de clôture muette est un état perdu : compter et remonter. */
  const settle = (error: { message: string } | null, scope: string): void => {
    if (!error) return;
    summary.settleFailed += 1;
    reportError("webhooks.settle", `${scope}: ${error.message}`);
  };

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

  for (const [index, item] of deliveries.entries()) {
    // Test d'horloge AVANT la livraison, jamais après : une livraison entamée
    // sans budget est une livraison sans clôture.
    if (Date.now() - startedAt >= budgetMs) {
      const reste = deliveries.slice(index).map((d) => d.id);
      const { error: releaseError } = await admin
        .from("webhook_deliveries")
        .update({ locked_until: null })
        .in("id", reste);
      settle(releaseError, "release");
      summary.deferred = reste.length;
      break;
    }

    const { data: org } = await admin
      .from("organizations")
      .select("webhook_url, webhook_secret")
      .eq("id", item.organization_id)
      .maybeSingle();
    if (!org?.webhook_url) {
      const { error: disabledError } = await admin
        .from("webhook_deliveries")
        .update({
          delivered_at: new Date().toISOString(),
          last_error: "webhook disabled",
          locked_until: null,
        })
        .eq("id", item.id);
      settle(disabledError, "disabled");
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
      const { error: deliveredError } = await admin
        .from("webhook_deliveries")
        .update({
          delivered_at: new Date().toISOString(),
          last_error: null,
          locked_until: null,
          failed_at: null,
        })
        .eq("id", item.id);
      settle(deliveredError, "delivered");
      summary.delivered += 1;
    } catch (deliveryError) {
      const exhausted = item.attempts >= WEBHOOK_MAX_ATTEMPTS;
      const delayMinutes = Math.min(24 * 60, 2 ** Math.min(item.attempts, 10));
      const { error: retryError } = await admin
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
      settle(retryError, "retry");
      if (exhausted) summary.deadLettered += 1;
      reportError("cron.webhooks.delivery", deliveryError);
    }
  }

  // Les accusés ne contiennent plus de données utiles après 30 jours. Comptée
  // avec les clôtures : une purge muette qui échoue laisse la file grossir sans
  // que personne ne l'apprenne.
  const { error: purgeError } = await admin
    .from("webhook_deliveries")
    .delete()
    .not("delivered_at", "is", null)
    .lt("delivered_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  settle(purgeError, "purge");

  return summary;
}
