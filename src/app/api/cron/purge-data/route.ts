import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { writeAuditLog } from "@/lib/audit";

/**
 * Purge RGPD automatique : GET /api/cron/purge-data
 *
 * Déclenché par un cron (Vercel Cron). Protégé par CRON_SECRET (header
 * Authorization: Bearer …). Pour chaque organisation ayant choisi une
 * durée de conservation (data_retention_months), supprime :
 *  - les participations (données personnelles : prénom/email/téléphone)
 *    plus anciennes que la durée choisie ;
 *  - les abonnés newsletter désinscrits depuis plus longtemps que cette
 *    durée (minimisation — aucune base légale à les garder après leur
 *    désinscription + la période de conservation).
 * Comportement par défaut inchangé : data_retention_months = null →
 * aucune purge (opt-in explicite du commerçant).
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
    .select("id, data_retention_months")
    .not("data_retention_months", "is", null)
    .limit(MAX_ORGS);

  if (orgsError) {
    reportError("cron.purge-data.orgs", orgsError.message);
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  let orgsProcessed = 0;
  let participationsDeleted = 0;
  let subscribersDeleted = 0;

  for (const org of orgs ?? []) {
    const months = org.data_retention_months as number | null;
    if (!months) continue;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffIso = cutoff.toISOString();

    const { count: pCount, error: pError } = await admin
      .from("participations")
      .delete({ count: "exact" })
      .eq("organization_id", org.id)
      .lt("created_at", cutoffIso);
    if (pError) {
      reportError("cron.purge-data.participations", pError.message);
    } else {
      participationsDeleted += pCount ?? 0;
    }

    const { count: sCount, error: sError } = await admin
      .from("newsletter_subscribers")
      .delete({ count: "exact" })
      .eq("organization_id", org.id)
      .not("unsubscribed_at", "is", null)
      .lt("unsubscribed_at", cutoffIso);
    if (sError) {
      reportError("cron.purge-data.subscribers", sError.message);
    } else {
      subscribersDeleted += sCount ?? 0;
    }

    if ((pCount ?? 0) > 0 || (sCount ?? 0) > 0) {
      await writeAuditLog({
        organizationId: org.id,
        actor: "system",
        action: "gdpr.data_purged",
        metadata: {
          retention_months: months,
          participations_deleted: pCount ?? 0,
          subscribers_deleted: sCount ?? 0,
        },
      });
    }

    orgsProcessed += 1;
  }

  return NextResponse.json(
    { ok: true, orgsProcessed, participationsDeleted, subscribersDeleted },
    { headers: { "cache-control": "no-store" } },
  );
}
