"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendNewsletterEmails } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import { RATE_LIMITS, rateLimit, rateLimitBucket } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendNewsletterSchema } from "@/lib/validations/newsletter";
import type { ActionResult } from "@/lib/utils";

async function requireOrg() {
  const { user, organization } = await getUserAndOrg();
  if (!user || !organization) redirect("/login");
  return organization;
}

/** Nombre maximum de destinataires pour un seul envoi (borne le temps
 *  d'exécution de la server action côté serveur). */
const MAX_RECIPIENTS = 1000;

/**
 * Envoie une campagne aux abonnés actifs (non désinscrits) de
 * l'organisation. Les emails partent par lots (voir lib/resend.ts) ;
 * la campagne est journalisée avec le nombre de destinataires réels,
 * même en cas d'échec partiel d'envoi.
 */
export async function sendNewsletterCampaign(
  _prev: ActionResult<{ recipientCount: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ recipientCount: number }>> {
  const organization = await requireOrg();

  const parsed = sendNewsletterSchema.safeParse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  if (
    !(await rateLimit(
      rateLimitBucket("newsletter:send", organization.id, ip),
      RATE_LIMITS.newsletterSend,
    ))
  ) {
    return {
      ok: false,
      error: "Trop d'envois aujourd'hui. Réessayez demain.",
    };
  }

  const supabase = await createClient();
  const { data: subscribers, error: fetchError } = await supabase
    .from("newsletter_subscribers")
    .select("id, email")
    .eq("organization_id", organization.id)
    .is("unsubscribed_at", null)
    .limit(MAX_RECIPIENTS);

  if (fetchError) {
    reportError("newsletter.fetch-subscribers", fetchError.message);
    return { ok: false, error: "Impossible de charger les abonnés." };
  }
  if (!subscribers || subscribers.length === 0) {
    return { ok: false, error: "Aucun abonné actif pour le moment." };
  }

  const { sent } = await sendNewsletterEmails({
    subject: parsed.data.subject,
    bodyText: parsed.data.body,
    organizationName: organization.name,
    recipients: subscribers.map((s) => ({
      email: s.email,
      unsubscribeToken: signUnsubscribeToken(s.id),
    })),
  });

  const { error: insertError } = await supabase
    .from("newsletter_campaigns")
    .insert({
      organization_id: organization.id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      recipient_count: sent,
    });
  if (insertError) {
    reportError("newsletter.insert-campaign", insertError.message);
  }

  await writeAuditLog({
    organizationId: organization.id,
    actor: "merchant",
    action: "newsletter.campaign.send",
    metadata: { recipientCount: sent, subject: parsed.data.subject },
  });

  revalidatePath("/dashboard/newsletter");

  if (sent === 0) {
    return { ok: false, error: "L'envoi a échoué. Vérifiez la configuration email." };
  }
  return { ok: true, data: { recipientCount: sent } };
}
