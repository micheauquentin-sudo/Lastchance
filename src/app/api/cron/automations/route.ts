import { NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Scénarios d'emails automatiques : GET /api/cron/automations
 * (CRON_SECRET, quotidien).
 *
 * Le cron ne traite rien lui-même : il DÉPOSE un job
 * `automation.run-scenarios` par organisation ayant au moins un scénario
 * activé (automation_settings.enabled), idempotent par jour — un cron
 * rejoué ne double aucun envoi. Le worker /api/cron/jobs exécute ensuite
 * chaque organisation avec erreurs isolées et retys
 * (src/lib/automations.ts) ; l'anti-doublon final vit dans email_log.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// automation_settings ≤ 4 lignes par org : 2000 lignes ≈ 500 orgs et plus.
const MAX_SETTINGS_ROWS = 2000;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return monitored("cron.automations", enqueueAutomationJobs);
}

async function enqueueAutomationJobs(): Promise<NextResponse> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("automation_settings")
    .select("organization_id")
    .eq("enabled", true)
    .limit(MAX_SETTINGS_ROWS);
  if (error) {
    reportError("cron.automations.settings", error.message);
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  const organizationIds = [
    ...new Set((data ?? []).map((row) => row.organization_id as string)),
  ];
  const day = new Date().toISOString().slice(0, 10);

  let enqueued = 0;
  for (const organizationId of organizationIds) {
    const ok = await enqueueJob(admin, {
      type: "automation.run-scenarios",
      payload: { organizationId, date: day },
      organizationId,
      idempotencyKey: `automations:${organizationId}:${day}`,
    });
    if (ok) enqueued += 1;
  }

  return NextResponse.json(
    { ok: true, organizations: organizationIds.length, enqueued },
    { headers: { "cache-control": "no-store" } },
  );
}
