import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReengagementEmails } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import { optionalEnv, APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";

/**
 * Relance clients automatique : GET /api/cron/reengage
 *
 * Déclenché par un cron (Vercel Cron / planificateur externe). Protégé
 * par CRON_SECRET (header Authorization: Bearer …). Pour chaque
 * organisation ayant activé la relance (auto_reengage), envoie un email
 * aux abonnés inactifs (dernier gain > 60 j) non relancés récemment
 * (cooldown 30 j, voir RPC org_reengagement_targets), avec un lien vers
 * une campagne active. Les abonnés relancés voient last_reengaged_at
 * mis à jour pour respecter le cooldown au prochain passage.
 *
 * Base ciblée = newsletter_subscribers (consentement marketing) : la
 * relance hérite du même opt-in et du même lien de désinscription.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bornes de sûreté : le cron doit rester rapide et prévisible.
const MAX_ORGS = 200;
const MAX_TARGETS_PER_ORG = 500;

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
    .select("id, name")
    .eq("auto_reengage", true)
    .limit(MAX_ORGS);

  if (orgsError) {
    reportError("cron.reengage.orgs", orgsError.message);
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  let orgsProcessed = 0;
  let totalSent = 0;

  for (const org of orgs ?? []) {
    // Lien de jeu : un QR code d'une campagne active de l'org. Sans
    // campagne active, la relance n'a pas de destination — on saute.
    const { data: activeCampaign } = await admin
      .from("campaigns")
      .select("id")
      .eq("organization_id", org.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!activeCampaign) continue;

    const { data: qr } = await admin
      .from("qr_codes")
      .select("slug")
      .eq("campaign_id", activeCampaign.id)
      .limit(1)
      .maybeSingle();
    if (!qr) continue;

    const { data: targets, error: targetsError } = await admin.rpc(
      "org_reengagement_targets",
      { p_organization_id: org.id },
    );
    if (targetsError) {
      reportError("cron.reengage.targets", targetsError.message);
      continue;
    }

    const recipients = (
      (targets ?? []) as { subscriber_id: string; email: string }[]
    ).slice(0, MAX_TARGETS_PER_ORG);
    if (recipients.length === 0) continue;

    const { sent } = await sendReengagementEmails({
      organizationName: org.name,
      playUrl: `${APP_URL}/play/${qr.slug}`,
      recipients: recipients.map((r) => ({
        email: r.email,
        unsubscribeToken: signUnsubscribeToken(r.subscriber_id),
      })),
    });

    if (sent > 0) {
      const { error: stampError } = await admin
        .from("newsletter_subscribers")
        .update({ last_reengaged_at: new Date().toISOString() })
        .in(
          "id",
          recipients.map((r) => r.subscriber_id),
        );
      if (stampError) reportError("cron.reengage.stamp", stampError.message);
    }

    orgsProcessed += 1;
    totalSent += sent;
  }

  return NextResponse.json(
    { ok: true, orgsProcessed, totalSent },
    { headers: { "cache-control": "no-store" } },
  );
}
