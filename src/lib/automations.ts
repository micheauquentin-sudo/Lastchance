import "server-only";

import { APP_URL } from "@/lib/env";
import type { JobOutcome, JobRow } from "@/lib/jobs";
import { getOrgOwnerEmail } from "@/lib/merchant-contact";
import { reportError } from "@/lib/monitoring";
import {
  isResendConfigured,
  sendBirthdayEmails,
  sendBudgetPausedEmail,
  sendInactiveEmails,
  sendLowStockEmail,
  sendPostRedemptionEmails,
  sendWonNotRedeemedEmails,
} from "@/lib/resend";
import type { createAdminClient } from "@/lib/supabase/admin";
import { signUnsubscribeToken } from "@/lib/unsubscribe";
import {
  automationConfigSchemas,
  type AutomationConfigByScenario,
} from "@/lib/validations/automations";
import type { AutomationScenario } from "@/types/database";

/**
 * Automatisations commerçant — orchestration des scénarios d'emails.
 *
 * Trois familles de jobs (file `jobs`, worker /api/cron/jobs) :
 * - `automation.budget-paused` / `automation.low-stock` : événementiels,
 *   déposés par la base (claim_winning_spin / trigger prizes) — simple
 *   notification au propriétaire de l'organisation ;
 * - `automation.run-scenarios` : quotidien, déposé par
 *   /api/cron/automations pour chaque org ayant au moins un scénario
 *   activé — cible via les RPC service_role (anti-doublon email_log),
 *   envoie par lots, journalise chaque envoi accepté dans email_log.
 *
 * NB : la relance historique (/api/cron/reengage, opt-in
 * organizations.auto_reengage, cooldown 30 j) reste indépendante du
 * scénario `inactive` configurable ici.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** Cibles maximum par scénario et par passage quotidien (RPC bornées à 500). */
const MAX_TARGETS_PER_SCENARIO = 200;

/**
 * Lecture TOLÉRANTE de automation_settings.config : une config invalide
 * ou hors bornes retombe sur les défauts du scénario — le worker ne
 * doit jamais échouer sur un jsonb abîmé.
 */
export function parseScenarioConfig<S extends AutomationScenario>(
  scenario: S,
  raw: unknown,
): AutomationConfigByScenario[S] {
  const schema = automationConfigSchemas[scenario];
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data as AutomationConfigByScenario[S];
  return schema.parse({}) as AutomationConfigByScenario[S];
}

// ── Jobs événementiels : notifications commerçant ────────────────────

/** `automation.budget-paused` : campagne auto-pausée, budget atteint. */
export async function processBudgetPausedJob(
  admin: Admin,
  job: JobRow,
): Promise<JobOutcome> {
  const campaignId = String(job.payload.campaignId ?? "");
  const organizationId = String(job.payload.organizationId ?? "");
  if (!campaignId || !organizationId) {
    return { status: "failed", error: "payload incomplet" };
  }

  const { data: campaign, error } = await admin
    .from("campaigns")
    .select("id, name, budget_cents, budget_spent_cents")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) return { status: "retry", error: error.message };
  if (!campaign) return { status: "failed", error: "campagne introuvable" };

  const ownerEmail = await getOrgOwnerEmail(admin, organizationId);
  // Personne à prévenir : rien d'autre à faire (la pause est déjà posée).
  if (!ownerEmail) return { status: "completed" };

  const sent = await sendBudgetPausedEmail({
    to: ownerEmail,
    campaignName: campaign.name,
    budgetCents: campaign.budget_cents ?? 0,
    spentCents: campaign.budget_spent_cents ?? 0,
  });
  // Resend non configuré (dev) : best-effort, pas de tempête de retys.
  if (!sent && isResendConfigured()) {
    return { status: "retry", error: "envoi refusé par le fournisseur" };
  }
  return { status: "completed" };
}

/** `automation.low-stock` : seuil de stock faible franchi sur un lot. */
export async function processLowStockJob(
  admin: Admin,
  job: JobRow,
): Promise<JobOutcome> {
  const prizeId = String(job.payload.prizeId ?? "");
  const organizationId = String(job.payload.organizationId ?? "");
  if (!prizeId || !organizationId) {
    return { status: "failed", error: "payload incomplet" };
  }

  const { data: prize, error } = await admin
    .from("prizes")
    .select("id, label, stock, low_stock_threshold")
    .eq("id", prizeId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) return { status: "retry", error: error.message };
  if (!prize) return { status: "failed", error: "lot introuvable" };
  // Restock entre le dépôt et l'exécution : l'alerte n'a plus d'objet.
  if (
    prize.low_stock_threshold == null ||
    prize.stock == null ||
    prize.stock > prize.low_stock_threshold
  ) {
    return { status: "completed" };
  }

  const ownerEmail = await getOrgOwnerEmail(admin, organizationId);
  if (!ownerEmail) return { status: "completed" };

  const sent = await sendLowStockEmail({
    to: ownerEmail,
    prizeLabel: prize.label,
    stock: prize.stock,
    threshold: prize.low_stock_threshold,
  });
  if (!sent && isResendConfigured()) {
    return { status: "retry", error: "envoi refusé par le fournisseur" };
  }
  return { status: "completed" };
}

// ── Job quotidien : scénarios d'emails d'une organisation ────────────

export interface ScenarioCounters {
  targeted: number;
  sent: number;
}

export interface AutomationRunResult {
  counters: Record<AutomationScenario, ScenarioCounters>;
  errors: string[];
}

function emptyCounters(): Record<AutomationScenario, ScenarioCounters> {
  return {
    won_not_redeemed: { targeted: 0, sent: 0 },
    inactive: { targeted: 0, sent: 0 },
    post_redemption: { targeted: 0, sent: 0 },
    birthday: { targeted: 0, sent: 0 },
  };
}

/** `automation.run-scenarios` : point d'entrée worker — mappe en JobOutcome. */
export async function processAutomationRunJob(
  admin: Admin,
  job: JobRow,
): Promise<JobOutcome> {
  const organizationId = String(job.payload.organizationId ?? "");
  if (!organizationId) {
    return { status: "failed", error: "payload sans organizationId" };
  }

  const { counters, errors } = await runAutomationScenarios(admin, organizationId);
  const targeted = Object.values(counters).reduce((n, c) => n + c.targeted, 0);
  const sent = Object.values(counters).reduce((n, c) => n + c.sent, 0);

  // Tout a échoué avant le moindre envoi (base indisponible…) : retry —
  // l'anti-doublon email_log rend le rejeu sûr.
  if (errors.length > 0 && sent === 0 && targeted === 0) {
    return { status: "retry", error: errors.join(" | ") };
  }
  if (errors.length > 0 || sent < targeted) {
    return {
      status: "partial",
      error: errors.length > 0 ? errors.join(" | ") : undefined,
    };
  }
  return { status: "completed" };
}

/**
 * Exécute les scénarios ACTIVÉS d'une organisation : ciblage RPC avec la
 * config du commerçant, envoi par lots, journal email_log (clé exacte
 * attendue par les RPC pour l'anti-doublon). Erreurs isolées par
 * scénario : un scénario en panne n'empêche pas les autres.
 */
export async function runAutomationScenarios(
  admin: Admin,
  organizationId: string,
): Promise<AutomationRunResult> {
  const counters = emptyCounters();
  const errors: string[] = [];

  const { data: settings, error: settingsError } = await admin
    .from("automation_settings")
    .select("scenario, enabled, config")
    .eq("organization_id", organizationId)
    .eq("enabled", true);
  if (settingsError) {
    return { counters, errors: [`settings: ${settingsError.message}`] };
  }
  const enabled = (settings ?? []) as Array<{
    scenario: AutomationScenario;
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
  if (enabled.length === 0) return { counters, errors };

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, timezone")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) return { counters, errors: [`organization: ${orgError.message}`] };
  // Organisation supprimée entre le dépôt et l'exécution : no-op.
  if (!org) return { counters, errors };

  const playUrl = await findPlayUrl(admin, organizationId);

  for (const setting of enabled) {
    try {
      switch (setting.scenario) {
        case "won_not_redeemed":
          counters.won_not_redeemed = await runWonNotRedeemed(
            admin,
            organizationId,
            org,
            parseScenarioConfig("won_not_redeemed", setting.config),
          );
          break;
        case "inactive":
          counters.inactive = await runInactive(
            admin,
            organizationId,
            org,
            playUrl,
            parseScenarioConfig("inactive", setting.config),
          );
          break;
        case "post_redemption":
          counters.post_redemption = await runPostRedemption(
            admin,
            organizationId,
            org,
            playUrl,
            parseScenarioConfig("post_redemption", setting.config),
          );
          break;
        case "birthday":
          counters.birthday = await runBirthday(admin, organizationId, org, playUrl);
          break;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${setting.scenario}: ${message}`);
      reportError(`automations.${setting.scenario}`, err);
    }
  }

  return { counters, errors };
}

interface OrgInfo {
  name: string;
  timezone: string | null;
}

/** Lien de jeu (QR d'une campagne active) pour les CTA marketing — best-effort. */
async function findPlayUrl(
  admin: Admin,
  organizationId: string,
): Promise<string | null> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!campaign) return null;
  const { data: qr } = await admin
    .from("qr_codes")
    .select("slug")
    .eq("campaign_id", campaign.id)
    .limit(1)
    .maybeSingle();
  return qr ? `${APP_URL}/play/${qr.slug}` : null;
}

/** Journalise les envois acceptés (clé d'unicité : jamais deux fois le même). */
async function logSentEmails(
  admin: Admin,
  rows: Array<{
    organization_id: string;
    scenario: AutomationScenario;
    recipient: string;
    participation_id: string | null;
    dedup_key: string;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin
    .from("email_log")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true });
  // Best-effort : au pire, la RPC reciblera demain (l'email partirait
  // deux fois) — mais l'envoi du jour, lui, est déjà parti.
  if (error) reportError("automations.email-log", error.message);
}

/**
 * Ids des abonnés newsletter (org, email) → jeton de désinscription.
 * Les scénarios marketing n'envoient JAMAIS sans lien de désinscription :
 * un destinataire sans ligne d'abonné est simplement sauté.
 */
async function subscriberIdsByEmail(
  admin: Admin,
  organizationId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (emails.length === 0) return map;
  const { data, error } = await admin
    .from("newsletter_subscribers")
    .select("id, email")
    .eq("organization_id", organizationId)
    .in("email", emails);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Array<{ id: string; email: string }>) {
    map.set(row.email, row.id);
  }
  return map;
}

/** Année « courante » dans le fuseau de l'organisation (clé birthday). */
export function currentYearInTimezone(
  timezone: string | null,
  now: Date = new Date(),
): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone ?? "Europe/Paris",
        year: "numeric",
      }).format(now),
    );
  } catch {
    return now.getUTCFullYear();
  }
}

async function runWonNotRedeemed(
  admin: Admin,
  organizationId: string,
  org: OrgInfo,
  config: AutomationConfigByScenario["won_not_redeemed"],
): Promise<ScenarioCounters> {
  const { data, error } = await admin.rpc("automation_won_not_redeemed_targets", {
    p_organization_id: organizationId,
    p_min_age_hours: config.minAgeHours,
    p_limit: MAX_TARGETS_PER_SCENARIO,
  });
  if (error) throw new Error(error.message);
  const targets = (data ?? []) as Array<{
    participation_id: string;
    email: string;
    first_name: string | null;
    redeem_code: string;
    redeem_expires_at: string | null;
    prize_label: string | null;
  }>;
  if (targets.length === 0) return { targeted: 0, sent: 0 };

  const { sent, sentEmails } = await sendWonNotRedeemedEmails({
    organizationName: org.name,
    timezone: org.timezone ?? "Europe/Paris",
    recipients: targets.map((t) => ({
      email: t.email,
      firstName: t.first_name ?? "",
      prizeLabel: t.prize_label ?? "Votre gain",
      redeemCode: t.redeem_code,
      redeemExpiresAt: t.redeem_expires_at,
    })),
  });

  const sentSet = new Set(sentEmails);
  await logSentEmails(
    admin,
    targets
      .filter((t) => sentSet.has(t.email))
      .map((t) => ({
        organization_id: organizationId,
        scenario: "won_not_redeemed" as const,
        recipient: t.email,
        participation_id: t.participation_id,
        dedup_key: `wnr:${t.participation_id}`,
      })),
  );
  return { targeted: targets.length, sent };
}

async function runInactive(
  admin: Admin,
  organizationId: string,
  org: OrgInfo,
  playUrl: string | null,
  config: AutomationConfigByScenario["inactive"],
): Promise<ScenarioCounters> {
  let targeted = 0;
  let sent = 0;
  // Du palier le plus profond au plus récent : un contact inactif depuis
  // 70 j avec des paliers [30, 60] ne reçoit que l'email du palier 60.
  const tiers = [...config.tiers].sort((a, b) => b - a);
  const handled = new Set<string>();

  for (const tier of tiers) {
    const { data, error } = await admin.rpc("automation_inactive_targets", {
      p_organization_id: organizationId,
      p_days: tier,
      p_limit: MAX_TARGETS_PER_SCENARIO,
    });
    if (error) throw new Error(error.message);
    const targets = (
      (data ?? []) as Array<{ email: string; first_name: string | null }>
    ).filter((t) => !handled.has(t.email));
    if (targets.length === 0) continue;
    targeted += targets.length;

    const tokens = await subscriberIdsByEmail(
      admin,
      organizationId,
      targets.map((t) => t.email),
    );
    const recipients = targets.flatMap((t) => {
      const subscriberId = tokens.get(t.email);
      if (!subscriberId) return [];
      return [{
        email: t.email,
        firstName: t.first_name ?? "",
        unsubscribeToken: signUnsubscribeToken(subscriberId),
      }];
    });
    if (recipients.length === 0) continue;

    const result = await sendInactiveEmails({
      organizationName: org.name,
      playUrl,
      recipients,
    });
    sent += result.sent;

    const sentSet = new Set(result.sentEmails);
    for (const t of targets) handled.add(t.email);
    await logSentEmails(
      admin,
      targets
        .filter((t) => sentSet.has(t.email))
        .map((t) => ({
          organization_id: organizationId,
          scenario: "inactive" as const,
          recipient: t.email,
          participation_id: null,
          dedup_key: `inactive:${tier}:${t.email}`,
        })),
    );
  }
  return { targeted, sent };
}

async function runPostRedemption(
  admin: Admin,
  organizationId: string,
  org: OrgInfo,
  playUrl: string | null,
  config: AutomationConfigByScenario["post_redemption"],
): Promise<ScenarioCounters> {
  const { data, error } = await admin.rpc("automation_post_redemption_targets", {
    p_organization_id: organizationId,
    p_delay_hours: config.delayHours,
    p_limit: MAX_TARGETS_PER_SCENARIO,
  });
  if (error) throw new Error(error.message);
  const targets = (data ?? []) as Array<{
    participation_id: string;
    email: string;
    first_name: string | null;
    prize_label: string | null;
  }>;
  if (targets.length === 0) return { targeted: 0, sent: 0 };

  const tokens = await subscriberIdsByEmail(
    admin,
    organizationId,
    targets.map((t) => t.email),
  );
  const eligible = targets.filter((t) => tokens.has(t.email));
  if (eligible.length === 0) return { targeted: targets.length, sent: 0 };

  const { sent, sentEmails } = await sendPostRedemptionEmails({
    organizationName: org.name,
    playUrl,
    recipients: eligible.map((t) => ({
      email: t.email,
      firstName: t.first_name ?? "",
      prizeLabel: t.prize_label ?? "votre gain",
      unsubscribeToken: signUnsubscribeToken(tokens.get(t.email) as string),
    })),
  });

  const sentSet = new Set(sentEmails);
  await logSentEmails(
    admin,
    eligible
      .filter((t) => sentSet.has(t.email))
      .map((t) => ({
        organization_id: organizationId,
        scenario: "post_redemption" as const,
        recipient: t.email,
        participation_id: t.participation_id,
        dedup_key: `postredeem:${t.participation_id}`,
      })),
  );
  return { targeted: targets.length, sent };
}

async function runBirthday(
  admin: Admin,
  organizationId: string,
  org: OrgInfo,
  playUrl: string | null,
): Promise<ScenarioCounters> {
  const { data, error } = await admin.rpc("automation_birthday_targets", {
    p_organization_id: organizationId,
    p_limit: MAX_TARGETS_PER_SCENARIO,
  });
  if (error) throw new Error(error.message);
  const targets = (data ?? []) as Array<{
    email: string;
    first_name: string | null;
  }>;
  if (targets.length === 0) return { targeted: 0, sent: 0 };

  const tokens = await subscriberIdsByEmail(
    admin,
    organizationId,
    targets.map((t) => t.email),
  );
  const eligible = targets.filter((t) => tokens.has(t.email));
  if (eligible.length === 0) return { targeted: targets.length, sent: 0 };

  const { sent, sentEmails } = await sendBirthdayEmails({
    organizationName: org.name,
    playUrl,
    recipients: eligible.map((t) => ({
      email: t.email,
      firstName: t.first_name ?? "",
      unsubscribeToken: signUnsubscribeToken(tokens.get(t.email) as string),
    })),
  });

  // Même année (fuseau de l'org) que la RPC : la clé doit coïncider.
  const year = currentYearInTimezone(org.timezone);
  const sentSet = new Set(sentEmails);
  await logSentEmails(
    admin,
    eligible
      .filter((t) => sentSet.has(t.email))
      .map((t) => ({
        organization_id: organizationId,
        scenario: "birthday" as const,
        recipient: t.email,
        participation_id: null,
        dedup_key: `birthday:${t.email}:${year}`,
      })),
  );
  return { targeted: targets.length, sent };
}
