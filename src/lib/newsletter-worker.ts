import "server-only";

import type { JobOutcome, JobRow } from "@/lib/jobs";
import { reportError } from "@/lib/monitoring";
import { sendNewsletterEmails } from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import { signUnsubscribeToken } from "@/lib/unsubscribe";

/**
 * Traitement d'un job `newsletter.send` : l'action du dashboard n'a
 * fait que journaliser la campagne (statut queued) et déposer le job —
 * l'envoi par lots vit ici, hors requête HTTP. Le journal expose le
 * cycle : queued → sending → completed / partial / failed.
 */

/** Borne le temps d'un job (10 lots de 100 au maximum). */
const MAX_RECIPIENTS = 1000;

export async function processNewsletterJob(
  admin: ReturnType<typeof createAdminClient>,
  job: JobRow,
): Promise<JobOutcome> {
  const campaignId = String(job.payload.campaignId ?? "");
  if (!campaignId) return { status: "failed", error: "payload sans campaignId" };

  const { data: campaign, error: campaignError } = await admin
    .from("newsletter_campaigns")
    .select("id, organization_id, subject, body, status, segment, recipient_count")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError) return { status: "retry", error: campaignError.message };
  if (!campaign) return { status: "failed", error: "campagne introuvable" };
  // Déjà traitée (rejeu de job, double dépôt) : ne JAMAIS renvoyer.
  if (campaign.status === "completed" || campaign.status === "partial") {
    return { status: "completed" };
  }

  // Source de vérité : le segment journalisé sur la campagne (une
  // relance recible exactement le même public).
  const segment = campaign.segment ?? String(job.payload.segment ?? "all");

  await admin
    .from("newsletter_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  const [{ data: org }, { data: segmentRows, error: segmentError }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("name")
        .eq("id", campaign.organization_id)
        .maybeSingle(),
      admin.rpc("org_segment_emails", {
        p_organization_id: campaign.organization_id,
        p_segment: segment,
      }),
    ]);
  if (segmentError) {
    await admin
      .from("newsletter_campaigns")
      .update({ status: "queued" })
      .eq("id", campaignId);
    return { status: "retry", error: segmentError.message };
  }

  const recipients = (
    (segmentRows ?? []) as { subscriber_id: string; email: string }[]
  ).slice(0, MAX_RECIPIENTS);

  if (recipients.length === 0) {
    // Segment vidé entre le dépôt et l'envoi (désinscriptions…).
    await admin
      .from("newsletter_campaigns")
      .update({
        status: "failed",
        sent_count: 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return { status: "completed" };
  }

  const { sent } = await sendNewsletterEmails({
    subject: campaign.subject,
    bodyText: campaign.body,
    organizationName: org?.name ?? "Votre commerçant",
    recipients: recipients.map((r) => ({
      email: r.email,
      unsubscribeToken: signUnsubscribeToken(r.subscriber_id),
    })),
  });

  if (sent === 0) {
    // Panne d'envoi complète : retry avec backoff tant que possible.
    if (job.attempts < job.max_attempts) {
      await admin
        .from("newsletter_campaigns")
        .update({ status: "queued" })
        .eq("id", campaignId);
      return { status: "retry", error: "aucun email accepté par le fournisseur" };
    }
    await admin
      .from("newsletter_campaigns")
      .update({
        status: "failed",
        sent_count: 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return { status: "failed", error: "aucun email accepté par le fournisseur" };
  }

  const finalStatus = sent >= recipients.length ? "completed" : "partial";
  const { error: updateError } = await admin
    .from("newsletter_campaigns")
    .update({
      status: finalStatus,
      sent_count: sent,
      recipient_count: recipients.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (updateError) reportError("jobs.newsletter.journal", updateError.message);

  return { status: finalStatus };
}
