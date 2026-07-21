"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOrganizationOwner } from "@/lib/authorization";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendNewsletterSchema } from "@/lib/validations/newsletter";
import type { ActionResult } from "@/lib/utils";
import { clientIpFromHeaders } from "@/lib/request-ip";

async function requireOrg() {
  const { organization } = await requireOrganizationOwner();
  return organization;
}

/** Borne d'un envoi (le worker tronque au même seuil). */
const MAX_RECIPIENTS = 1000;

/**
 * Met une campagne EN FILE : l'action ne fait plus que valider, cibler
 * (compte du segment), journaliser la campagne (statut queued) et
 * déposer un job — l'envoi des lots vit dans le worker
 * (src/lib/newsletter-worker.ts, /api/cron/jobs toutes les 5 min).
 * La requête HTTP reste instantanée, quel que soit le nombre d'abonnés.
 */
export async function sendNewsletterCampaign(
  _prev: ActionResult<{ recipientCount: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ recipientCount: number }>> {
  const organization = await requireOrg();

  const parsed = sendNewsletterSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
    segment: formData.get("segment") ?? "all",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const h = await headers();
  const ip = clientIpFromHeaders(h);
  if (
    !(await rateLimit(
      rateLimitBucket("newsletter:send", organization.id, ip),
      RATE_LIMITS.newsletterSend,
      { failClosed: true },
    ))
  ) {
    return {
      ok: false,
      error: "Trop d'envois aujourd'hui. Réessayez demain.",
    };
  }

  const supabase = await createClient();
  // Ciblage par segment via RPC (loyal/new/inactive/all) — l'appartenance
  // à l'org est re-vérifiée dans la fonction (SECURITY DEFINER).
  const { data: segmentRows, error: fetchError } = await supabase.rpc(
    "org_segment_emails",
    { p_organization_id: organization.id, p_segment: parsed.data.segment },
  );

  if (fetchError) {
    reportError("newsletter.fetch-subscribers", fetchError.message);
    return { ok: false, error: "Impossible de charger les abonnés." };
  }
  const targetCount = Math.min(
    ((segmentRows ?? []) as unknown[]).length,
    MAX_RECIPIENTS,
  );
  if (targetCount === 0) {
    return { ok: false, error: "Aucun abonné dans ce segment pour le moment." };
  }

  const { data: campaign, error: insertError } = await supabase
    .from("newsletter_campaigns")
    .insert({
      organization_id: organization.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      recipient_count: targetCount,
      segment: parsed.data.segment,
      status: "queued",
    })
    .select("id")
    .single();
  if (insertError || !campaign) {
    reportError("newsletter.insert-campaign", insertError?.message);
    return { ok: false, error: "Impossible d'enregistrer la campagne." };
  }

  const enqueued = await enqueueJob(createAdminClient(), {
    type: "newsletter.send",
    payload: { campaignId: campaign.id, segment: parsed.data.segment },
    organizationId: organization.id,
    idempotencyKey: `newsletter:${campaign.id}`,
  });
  if (!enqueued) {
    return { ok: false, error: "File d'envoi indisponible, réessayez." };
  }

  await writeAuditLog({
    organizationId: organization.id,
    actor: "merchant",
    action: "newsletter.campaign.send",
    metadata: {
      campaignId: campaign.id,
      recipientCount: targetCount,
      subject: parsed.data.subject,
      segment: parsed.data.segment,
    },
  });

  revalidatePath("/dashboard/newsletter");
  return { ok: true, data: { recipientCount: targetCount } };
}

/**
 * Relance une campagne en échec (total ou partiel) : la campagne
 * repasse en file et le worker renverra au segment — les campagnes
 * déjà complètes sont refusées (jamais de double envoi).
 */
export async function retryNewsletterCampaign(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const organization = await requireOrg();
  const campaignId = String(formData.get("id") ?? "");
  if (!campaignId) return { ok: false, error: "Campagne inconnue" };

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("newsletter_campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .eq("organization_id", organization.id)
    .maybeSingle();
  if (!campaign) return { ok: false, error: "Campagne introuvable" };
  if (campaign.status !== "failed" && campaign.status !== "partial") {
    return { ok: false, error: "Seule une campagne en échec se relance." };
  }

  const admin = createAdminClient();
  const { error: statusError } = await admin
    .from("newsletter_campaigns")
    .update({ status: "queued", completed_at: null })
    .eq("id", campaignId);
  if (statusError) {
    reportError("newsletter.retry", statusError.message);
    return { ok: false, error: "Relance impossible" };
  }

  // Le segment vit sur la campagne : la relance recible le même public.
  const enqueued = await enqueueJob(admin, {
    type: "newsletter.send",
    payload: { campaignId },
    organizationId: organization.id,
    idempotencyKey: `newsletter:${campaignId}:retry:${Date.now()}`,
  });
  if (!enqueued) return { ok: false, error: "File d'envoi indisponible" };

  await writeAuditLog({
    organizationId: organization.id,
    actor: "merchant",
    action: "newsletter.campaign.retry",
    metadata: { campaignId },
  });

  revalidatePath("/dashboard/newsletter");
  return { ok: true, data: undefined };
}
