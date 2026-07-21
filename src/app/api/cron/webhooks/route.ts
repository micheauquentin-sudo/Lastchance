import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { drainWebhookDeliveries } from "@/lib/webhook-worker";

/**
 * Filet de sécurité quotidien de la file des webhooks sortants — le
 * drain régulier vit dans le worker fréquent (/api/cron/jobs, toutes
 * les 5 minutes via pg_cron). Même logique partagée
 * (src/lib/webhook-worker.ts) : retys en minutes, dead-letter après
 * épuisement, purge des accusés > 30 jours.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const summary = await drainWebhookDeliveries(createAdminClient());
  return NextResponse.json(
    { ok: true, ...summary },
    { headers: { "cache-control": "no-store" } },
  );
}
