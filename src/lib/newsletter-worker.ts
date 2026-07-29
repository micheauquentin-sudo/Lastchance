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
  //
  // `sending` n'est PAS dans cette liste, et c'est délibéré : c'est l'état que
  // laisse un worker mort en plein envoi, et `requeue_stale_jobs()` relance ce
  // job — le rejeu est un chemin nominal, pas un accident. S'arrêter ici
  // abandonnerait une newsletter à moitié partie. On la reprend donc, mais
  // seulement grâce au journal par destinataire ci-dessous : sans lui, cette
  // reprise renvoyait l'intégralité du segment aux abonnés déjà servis.
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

  const segmentRecipients = (
    (segmentRows ?? []) as { subscriber_id: string; email: string }[]
  ).slice(0, MAX_RECIPIENTS);

  // ── Journal par destinataire : ce qui rend le job reprenable ──────
  // `org_segment_emails` renvoie TOUT le segment à chaque passage. Sans
  // mémoire de ce qui est déjà parti, un job repris après la coupure de la
  // fonction (maxDuration = 60 s, 900 abonnés = 9 lots) réexpédiait la
  // newsletter aux abonnés déjà servis. On réutilise `email_log` et sa
  // contrainte d'unicité sur `dedup_key`, déjà employés par les
  // automatisations — pas de nouvelle table pour un besoin déjà résolu.
  const dedupKeyFor = (subscriberId: string) =>
    `newsletter:${campaignId}:${subscriberId}`;

  const { data: alreadySent, error: logReadError } = await admin
    .from("email_log")
    .select("dedup_key")
    .eq("organization_id", campaign.organization_id)
    .in(
      "dedup_key",
      segmentRecipients.map((r) => dedupKeyFor(r.subscriber_id)),
    );
  if (logReadError) {
    // Journal illisible : on ne peut pas savoir qui a déjà reçu. Renvoyer à
    // l'aveugle serait le défaut qu'on corrige ici — on réessaie plus tard.
    reportError("jobs.newsletter.journal-lecture", logReadError.message);
    await admin
      .from("newsletter_campaigns")
      .update({ status: "queued" })
      .eq("id", campaignId);
    return { status: "retry", error: "journal des envois illisible" };
  }

  const dejaServis = new Set(
    ((alreadySent ?? []) as { dedup_key: string }[]).map((r) => r.dedup_key),
  );
  const recipients = segmentRecipients.filter(
    (r) => !dejaServis.has(dedupKeyFor(r.subscriber_id)),
  );

  if (recipients.length === 0) {
    // Deux causes très différentes, qu'il ne faut pas confondre :
    //  - le segment est vide (désinscriptions entre le dépôt et l'envoi) →
    //    l'envoi a échoué, rien n'est parti ;
    //  - tout le segment a DÉJÀ été servi par un passage précédent → l'envoi
    //    est terminé. Le déclarer « failed » afficherait un échec au
    //    commerçant alors que ses abonnés ont bien reçu l'email.
    const toutDejaServi = segmentRecipients.length > 0;
    await admin
      .from("newsletter_campaigns")
      .update({
        status: toutDejaServi ? "completed" : "failed",
        sent_count: toutDejaServi ? dejaServis.size : 0,
        recipient_count: segmentRecipients.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaignId);
    return { status: "completed" };
  }

  const { sent, delivered } = await sendNewsletterEmails({
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

  // Journalisation des destinataires servis, AVANT de conclure : si le
  // processus meurt entre l'envoi et l'écriture, le pire est de renvoyer à ce
  // seul lot — pas au segment entier. `ignoreDuplicates` rend l'écriture
  // rejouable sans conflit.
  const abonneParEmail = new Map(
    recipients.map((r) => [r.email, r.subscriber_id]),
  );
  const journal = delivered.flatMap((email) => {
    const subscriberId = abonneParEmail.get(email);
    return subscriberId
      ? [
          {
            organization_id: campaign.organization_id,
            scenario: "newsletter",
            recipient: email,
            participation_id: null,
            dedup_key: dedupKeyFor(subscriberId),
          },
        ]
      : [];
  });
  if (journal.length > 0) {
    const { error: journalError } = await admin
      .from("email_log")
      .upsert(journal, { onConflict: "dedup_key", ignoreDuplicates: true });
    // Best-effort, comme les automatisations : si le journal ne s'écrit pas,
    // une reprise éventuelle renverra à ces abonnés — l'envoi du jour, lui,
    // est déjà parti et ne doit pas être compté en échec.
    if (journalError) {
      reportError("jobs.newsletter.journal-ecriture", journalError.message);
    }
  }

  const finalStatus = sent >= recipients.length ? "completed" : "partial";
  const { error: updateError } = await admin
    .from("newsletter_campaigns")
    .update({
      status: finalStatus,
      // Le compte affiché au commerçant couvre TOUTE la campagne, pas
      // seulement ce passage : sur une reprise, n'afficher que le reliquat
      // laisserait croire que la newsletter n'est partie qu'à une poignée.
      sent_count: sent + dejaServis.size,
      recipient_count: segmentRecipients.length,
      completed_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
  if (updateError) reportError("jobs.newsletter.journal", updateError.message);

  return { status: finalStatus };
}
