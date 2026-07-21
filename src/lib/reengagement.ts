import "server-only";

import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { sendReengagementEmails } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Relance des clients inactifs d'UNE organisation — le cœur métier
 * sorti du cron : le cron quotidien dépose un job par organisation
 * (file `jobs`), le worker exécute ceci. Cibles = abonnés newsletter
 * inactifs (opt-in marketing, cooldown 30 j via la RPC).
 */

const MAX_TARGETS_PER_ORG = 500;

export interface ReengageOrgResult {
  sent: number;
  /** Faux si l'org n'avait ni campagne active ni cible : rien à faire. */
  attempted: boolean;
}

export async function reengageOrganization(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<ReengageOrgResult> {
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, auto_reengage")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw new Error(orgError.message);
  // Option désactivée entre le dépôt du job et son exécution : no-op.
  if (!org || !org.auto_reengage) return { sent: 0, attempted: false };

  // Lien de jeu : un QR d'une campagne active. Sans destination, on saute.
  const { data: activeCampaign } = await admin
    .from("campaigns")
    .select("id")
    .eq("organization_id", org.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!activeCampaign) return { sent: 0, attempted: false };

  const { data: qr } = await admin
    .from("qr_codes")
    .select("slug")
    .eq("campaign_id", activeCampaign.id)
    .limit(1)
    .maybeSingle();
  if (!qr) return { sent: 0, attempted: false };

  const { data: targets, error: targetsError } = await admin.rpc(
    "org_reengagement_targets",
    { p_organization_id: org.id },
  );
  if (targetsError) throw new Error(targetsError.message);

  const recipients = (
    (targets ?? []) as { subscriber_id: string; email: string }[]
  ).slice(0, MAX_TARGETS_PER_ORG);
  if (recipients.length === 0) return { sent: 0, attempted: false };

  const { sent, sentEmails } = await sendReengagementEmails({
    organizationName: org.name,
    playUrl: `${APP_URL}/play/${qr.slug}`,
    recipients: recipients.map((r) => ({
      email: r.email,
      unsubscribeToken: signUnsubscribeToken(r.subscriber_id),
    })),
  });

  if (sentEmails.length > 0) {
    const sentIds = recipients
      .filter((recipient) => sentEmails.includes(recipient.email))
      .map((recipient) => recipient.subscriber_id);
    const { error: stampError } = await admin
      .from("newsletter_subscribers")
      .update({ last_reengaged_at: new Date().toISOString() })
      .in("id", sentIds);
    if (stampError) reportError("reengage.stamp", stampError.message);
  }

  const { error: rotationError } = await admin
    .from("organizations")
    .update({ last_reengage_run_at: new Date().toISOString() })
    .eq("id", org.id);
  if (rotationError) reportError("reengage.rotation", rotationError.message);

  return { sent, attempted: true };
}
