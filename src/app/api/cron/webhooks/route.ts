import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { deliverWebhookEvent, type WebhookEvent } from "@/lib/webhooks";
import { reportError } from "@/lib/monitoring";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_webhook_deliveries", { p_limit: 50 });
  if (error) return NextResponse.json({ error: "File indisponible" }, { status: 500 });
  const deliveries = (data ?? []) as Array<{
    id: string; organization_id: string; event: WebhookEvent;
    data: Record<string, unknown>; created_at: string; attempts: number;
  }>;
  let delivered = 0;

  for (const item of deliveries) {
    const { data: org } = await admin.from("organizations")
      .select("webhook_url, webhook_secret").eq("id", item.organization_id).maybeSingle();
    if (!org?.webhook_url) {
      await admin.from("webhook_deliveries").update({ delivered_at: new Date().toISOString(), last_error: "webhook disabled", locked_until: null }).eq("id", item.id);
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
      await admin.from("webhook_deliveries").update({ delivered_at: new Date().toISOString(), last_error: null, locked_until: null }).eq("id", item.id);
      delivered += 1;
    } catch (deliveryError) {
      const delayMinutes = Math.min(24 * 60, 2 ** Math.min(item.attempts, 10));
      await admin.from("webhook_deliveries").update({
        last_error: deliveryError instanceof Error ? deliveryError.message.slice(0, 500) : "delivery failed",
        locked_until: null,
        next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      }).eq("id", item.id);
      reportError("cron.webhooks.delivery", deliveryError);
    }
  }

  // Les accusés ne contiennent plus de données utiles après 30 jours.
  await admin.from("webhook_deliveries").delete().not("delivered_at", "is", null)
    .lt("delivered_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return NextResponse.json({ ok: true, claimed: deliveries.length, delivered }, { headers: { "cache-control": "no-store" } });
}
