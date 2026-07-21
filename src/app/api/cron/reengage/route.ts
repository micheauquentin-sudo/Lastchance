import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";

/**
 * Relance clients automatique : GET /api/cron/reengage (CRON_SECRET).
 *
 * Le cron ne traite plus rien lui-même : il DÉPOSE un job par
 * organisation ayant activé la relance (file `jobs`, idempotent par
 * jour — un cron rejoué ne double aucun envoi), et le worker fréquent
 * exécute la relance org par org (src/lib/reengagement.ts) avec
 * erreurs isolées et retys. Le cron reste ainsi rapide et prévisible,
 * quel que soit le nombre d'organisations et de contacts.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ORGS = 200;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orgs, error: orgsError } = await admin
    .from("organizations")
    .select("id")
    .eq("auto_reengage", true)
    .order("last_reengage_run_at", { ascending: true, nullsFirst: true })
    .limit(MAX_ORGS);

  if (orgsError) {
    reportError("cron.reengage.orgs", orgsError.message);
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  const day = new Date().toISOString().slice(0, 10);
  let enqueued = 0;
  for (const org of orgs ?? []) {
    const ok = await enqueueJob(admin, {
      type: "reengage.org",
      payload: { organizationId: org.id },
      organizationId: org.id,
      idempotencyKey: `reengage:${org.id}:${day}`,
    });
    if (ok) enqueued += 1;
  }

  return NextResponse.json(
    { ok: true, enqueued },
    { headers: { "cache-control": "no-store" } },
  );
}
