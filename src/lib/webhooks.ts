import "server-only";

import { createHmac } from "node:crypto";
import { reportError, reportSecurityEvent } from "@/lib/monitoring";
import { postSafeWebhook } from "@/lib/webhook-url";

export type WebhookEvent =
  | "participation.claimed"
  | "newsletter.subscriber.created";

const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Livre un événement au webhook sortant du commerçant (best-effort,
 * jamais bloquant pour le parcours joueur). Signature HMAC-SHA256 du
 * corps JSON dans le header X-Lastchance-Signature, à vérifier côté
 * récepteur avec le secret affiché dans Réglages.
 */
export async function sendWebhookEvent(params: {
  webhookUrl: string | null;
  webhookSecret: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
}): Promise<void> {
  if (!params.webhookUrl) return;

  const body = JSON.stringify({
    event: params.event,
    data: params.data,
    timestamp: new Date().toISOString(),
  });
  const signature = createHmac("sha256", params.webhookSecret)
    .update(body)
    .digest("hex");

  try {
    const status = await postSafeWebhook({
      url: params.webhookUrl,
      body,
      headers: {
        "content-type": "application/json",
        "x-lastchance-signature": signature,
        "x-lastchance-event": params.event,
      },
      timeoutMs: DELIVERY_TIMEOUT_MS,
    });
    if (status < 200 || status >= 300) {
      console.warn(`[webhooks] ${params.event} → HTTP ${status}`);
    }
  } catch (err) {
    // Best-effort : un webhook du commerçant en panne ne doit jamais
    // remonter d'erreur au joueur.
    if (err instanceof Error && err.message.includes("interdite")) {
      reportSecurityEvent("webhook_ssrf_blocked");
    }
    reportError("webhooks.deliver", err);
  }
}
