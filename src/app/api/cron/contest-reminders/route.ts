import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { runContestReminders } from "@/lib/contest-reminders";
import { optionalEnv } from "@/lib/env";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Rappel hebdomadaire des Pronostics : GET /api/cron/contest-reminders
 * (CRON_SECRET, hebdomadaire — le jeudi, avant les matchs du week-end).
 *
 * Envoie « il vous manque N pronostics » aux joueurs qui l'ont DEMANDÉ
 * (`reminder_opt_in`) et à qui il manque réellement des pronostics sur les
 * matchs des sept prochains jours. Un joueur à jour ne reçoit rien : c'est ce
 * qui sépare ce rappel d'une newsletter, et la raison pour laquelle il n'a pas
 * besoin d'être désactivé pour rester supportable.
 *
 * Dédoublonné inter-runs par `email_log` (clé joueur + lundi de la semaine) :
 * deux passages la même semaine n'envoient qu'un courriel.
 *
 * ── POURQUOI LE JEUDI ──
 *
 * Une journée de Ligue 1 s'ouvre le vendredi soir. Le jeudi laisse un jour
 * plein pour remplir sa grille, sans prévenir si tôt que le joueur oublie de
 * nouveau d'ici le coup d'envoi.
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

  return monitored("cron.contest-reminders", async () => {
    const admin = createAdminClient();
    // Ouverture BEST-EFFORT, comme le rappel du Calendrier : une relance ne
    // dépend pas du journal de santé, et son échec est déjà remonté à Sentry.
    const run = await startWorkerRunSafely(admin, "contest-reminders");

    let rappels: Awaited<ReturnType<typeof runContestReminders>>;
    try {
      rappels = await runContestReminders(admin);
    } catch (error) {
      reportError("cron.contest-reminders", error);
      // Aucun destinataire ni identifiant au journal : un code de catégorie
      // suffit à distinguer la panne du silence.
      await finishWorkerRunSafely(
        admin,
        run,
        "failed",
        { sent: 0, skipped: 0 },
        "reminders_failed",
      );
      return NextResponse.json(
        { ok: false, error: "Rappels impossibles" },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }

    // Clôture best-effort : les courriels sont partis, un journal muet ne doit
    // pas faire rejouer le cron.
    await finishWorkerRunSafely(admin, run, "succeeded", {
      sent: rappels.sent,
      skipped: rappels.skipped,
    });

    return NextResponse.json(
      { ok: true, sent: rappels.sent, skipped: rappels.skipped },
      { headers: { "cache-control": "no-store" } },
    );
  });
}
