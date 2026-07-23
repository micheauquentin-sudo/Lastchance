import { NextResponse } from "next/server";
import {
  archiveElapsedCalendars,
  runCalendarReminders,
} from "@/lib/calendar-reminders";
import { optionalEnv } from "@/lib/env";
import { monitored } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rappel quotidien du Calendrier : GET /api/cron/calendar-reminders
 * (CRON_SECRET, quotidien — plan Hobby = crons quotidiens max).
 *
 * Deux tâches :
 *  1. envoie « votre case du jour est prête » aux joueurs opt-in reminder d'un
 *     calendrier actif ayant une case ouvrable aujourd'hui, non encore ouverte
 *     (calendar_reminder_targets), dédoublonné inter-runs via email_log ;
 *  2. archive les calendriers entièrement écoulés depuis la rétention de leur
 *     organisation — relais du socle qui débloque la purge RGPD
 *     (purge_expired_calendar_players ne purge que les calendriers archivés,
 *     branchée dans /api/cron/purge-data).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return monitored("cron.calendar-reminders", async () => {
    const admin = createAdminClient();
    const reminders = await runCalendarReminders(admin);
    const archived = await archiveElapsedCalendars(admin);
    return NextResponse.json(
      {
        ok: true,
        targeted: reminders.targeted,
        sent: reminders.sent,
        archived,
      },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
