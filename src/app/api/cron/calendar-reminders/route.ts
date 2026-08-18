import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import {
  archiveElapsedCalendars,
  runCalendarReminders,
} from "@/lib/calendar-reminders";
import { optionalEnv } from "@/lib/env";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

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
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  return monitored("cron.calendar-reminders", async () => {
    const admin = createAdminClient();
    // Ouverture BEST-EFFORT : les rappels du jour et l'archivage qui
    // débloque la purge RGPD ne dépendent pas du journal de santé.
    // `null` = pas de journal ; l'échec est déjà remonté à Sentry par
    // startWorkerRun, sans destinataire ni identifiant.
    const run = await startWorkerRunSafely(admin, "calendar-reminders");

    let reminders: Awaited<ReturnType<typeof runCalendarReminders>>;
    let archived: number;
    try {
      reminders = await runCalendarReminders(admin);
      archived = await archiveElapsedCalendars(admin);
    } catch (error) {
      reportError("cron.calendar-reminders", error);
      // Aucun destinataire ni identifiant de calendrier au journal : un
      // code de catégorie suffit à distinguer la panne du silence.
      await finishWorkerRunSafely(
        admin,
        run,
        "failed",
        { targeted: 0, sent: 0, archived: 0 },
        "reminders_failed",
      );
      return NextResponse.json(
        { ok: false, error: "Rappels impossibles" },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }

    // Clôture best-effort : les emails sont partis, un journal muet ne
    // doit pas faire rejouer le cron.
    await finishWorkerRunSafely(admin, run, "succeeded", {
      targeted: reminders.targeted,
      sent: reminders.sent,
      archived,
    });

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
