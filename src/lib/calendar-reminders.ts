import "server-only";

import { APP_URL } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { sendCalendarReminderEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Clé anti-doublon d'un rappel : un joueur ne reçoit qu'UN rappel par jour, quel
 * que soit le nombre de runs du cron (une case ouvrable/jour ⇒ au plus un
 * rappel/jour). `day` est la date UTC courante (le cron tourne une fois/jour).
 */
export function calendarReminderDedupKey(playerId: string, day: string): string {
  return `calendar-reminder:${playerId}:${day}`;
}

interface ReminderTarget {
  calendar_id: string;
  organization_id: string;
  player_id: string;
  email: string;
  calendar_name: string;
  public_slug: string;
  theme: string;
  day_id: string;
  day_index: number;
  unlock_at: string;
}

/**
 * Envoie les rappels quotidiens « votre case du jour est prête » (opt-in reminder
 * RGPD). Cible via calendar_reminder_targets (joueurs opt-in d'un calendrier
 * actif ayant une case ouvrable aujourd'hui et NON encore ouverte).
 *
 * DÉDUP inter-runs : on RÉSERVE d'abord les lignes email_log (on-conflict-do-
 * nothing sur dedup_key) et on n'envoie qu'aux cibles RÉELLEMENT insérées — un
 * second run le même jour ne réinsère rien, donc n'envoie rien. La réservation
 * atomique prime sur le rejeu (au pire un rappel manqué si Resend est indisponible
 * après réservation ; jamais un doublon), choix aligné sur le caractère best-
 * effort d'un rappel quotidien.
 */
export async function runCalendarReminders(
  admin: Admin,
  now: Date = new Date(),
): Promise<{ targeted: number; sent: number }> {
  const { data, error } = await admin.rpc("calendar_reminder_targets", {
    p_organization_id: undefined,
  });
  if (error) {
    reportError("calendar.reminders.targets", error.message);
    return { targeted: 0, sent: 0 };
  }

  const targets = ((data as ReminderTarget[] | null) ?? []).filter(
    (t) => Boolean(t.email) && Boolean(t.public_slug),
  );
  if (targets.length === 0) return { targeted: 0, sent: 0 };

  const day = now.toISOString().slice(0, 10);

  // Réservation atomique des rappels du jour (dedup_key unique).
  const logRows = targets.map((t) => ({
    organization_id: t.organization_id,
    scenario: "calendar_reminder",
    recipient: t.email,
    participation_id: null,
    dedup_key: calendarReminderDedupKey(t.player_id, day),
  }));
  const { data: reserved, error: logError } = await admin
    .from("email_log")
    .upsert(logRows, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("dedup_key");
  if (logError) {
    reportError("calendar.reminders.log", logError.message);
    return { targeted: targets.length, sent: 0 };
  }
  const reservedKeys = new Set(
    ((reserved as Array<{ dedup_key: string }> | null) ?? []).map((r) => r.dedup_key),
  );
  const toSend = targets.filter((t) =>
    reservedKeys.has(calendarReminderDedupKey(t.player_id, day)),
  );
  if (toSend.length === 0) return { targeted: targets.length, sent: 0 };

  // Nom de l'organisation (l'entête d'email) — la RPC ne le renvoie pas.
  const orgNames = await loadOrganizationNames(
    admin,
    [...new Set(toSend.map((t) => t.organization_id))],
  );

  let sent = 0;
  for (const t of toSend) {
    const ok = await sendCalendarReminderEmail({
      to: t.email,
      calendarName: t.calendar_name,
      organizationName: orgNames.get(t.organization_id) ?? "votre commerce",
      calendarUrl: `${APP_URL}/calendar/${t.public_slug}`,
    });
    if (ok) sent += 1;
  }

  return { targeted: targets.length, sent };
}

async function loadOrganizationNames(
  admin: Admin,
  organizationIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (organizationIds.length === 0) return names;
  const { data } = await admin
    .from("organizations")
    .select("id, name")
    .in("id", organizationIds);
  for (const o of (data as Array<{ id: string; name: string }> | null) ?? []) {
    names.set(o.id, o.name);
  }
  return names;
}

/**
 * Archive les calendriers ACTIFS entièrement écoulés depuis la rétention de leur
 * organisation (relais du socle : purge_expired_calendar_players ne purge QUE les
 * joueurs des calendriers ARCHIVÉS — sans archivage, la purge RGPD se figerait
 * pour un commerçant qui n'archive jamais). Un calendrier est archivable quand la
 * DERNIÈRE case (max unlock_at) est écoulée depuis plus que data_retention_months.
 * Les organisations sans rétention (opt-in explicite du commerçant : null) sont
 * ignorées — aucune purge n'est demandée, aucun archivage forcé.
 */
export async function archiveElapsedCalendars(
  admin: Admin,
  now: Date = new Date(),
): Promise<number> {
  const { data: calRows } = await admin
    .from("calendars")
    .select("id, organizations(data_retention_months)")
    .eq("status", "active")
    .limit(2000);

  const candidates = ((calRows as Array<{
    id: string;
    organizations: { data_retention_months: number | null } | null;
  }> | null) ?? [])
    .map((c) => ({
      id: c.id,
      retentionMonths: c.organizations?.data_retention_months ?? null,
    }))
    .filter((c): c is { id: string; retentionMonths: number } => c.retentionMonths !== null);
  if (candidates.length === 0) return 0;

  // Dernière case (max unlock_at) de chaque calendrier candidat.
  const { data: dayRows } = await admin
    .from("calendar_days")
    .select("calendar_id, unlock_at")
    .in("calendar_id", candidates.map((c) => c.id));
  const lastUnlock = new Map<string, number>();
  for (const d of (dayRows as Array<{ calendar_id: string; unlock_at: string }> | null) ?? []) {
    const ms = Date.parse(d.unlock_at);
    if (!Number.isFinite(ms)) continue;
    const prev = lastUnlock.get(d.calendar_id);
    if (prev === undefined || ms > prev) lastUnlock.set(d.calendar_id, ms);
  }

  const toArchive = candidates
    .filter((c) => {
      const last = lastUnlock.get(c.id);
      if (last === undefined) return false;
      return last < monthsAgo(now, c.retentionMonths).getTime();
    })
    .map((c) => c.id);
  if (toArchive.length === 0) return 0;

  const { error } = await admin
    .from("calendars")
    .update({ status: "archived" })
    .in("id", toArchive);
  if (error) {
    reportError("calendar.reminders.archive", error.message);
    return 0;
  }
  return toArchive.length;
}

/** Instant situé `months` mois avant `from` (arithmétique de calendrier). */
function monthsAgo(from: Date, months: number): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() - months);
  return d;
}
