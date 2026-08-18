import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { z } from "zod";
import { optionalEnv } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs";
import { monitored, reportError } from "@/lib/monitoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDateKey } from "@/lib/date-time";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Scénarios d'emails automatiques : GET /api/cron/automations
 * (CRON_SECRET, quotidien).
 *
 * Le cron ne traite rien lui-même : il DÉPOSE un job
 * `automation.run-scenarios` par organisation ayant au moins un scénario
 * activé (automation_settings.enabled), idempotent par jour — un cron
 * rejoué ne double aucun envoi. Le worker /api/cron/jobs exécute ensuite
 * chaque organisation avec erreurs isolées et retys
 * (src/lib/automations.ts) ; l'anti-doublon final vit dans email_log.
 *
 * ── Bornage EXPLICITE, ordre TOTAL, reprise ──────────────────────
 * Le passage traite au plus MAX_ORGANIZATIONS organisations, lues dans
 * l'ordre de leur identifiant — sans `order`, PostgREST ne garantit aucun
 * ordre, et deux passages successifs pouvaient couvrir deux sous-ensembles
 * différents. Le plafond ne fait plus disparaître le reliquat :
 *   - `deferred` compte les organisations éligibles vues et non traitées ;
 *   - `followUpRequired` dit qu'une suite est nécessaire, et le passage se
 *     clôt en `degraded` (code `organizations_deferred`) au journal de santé ;
 *   - `nextCursor` donne le point de reprise : rappeler la route avec
 *     `?after=<uuid>` reprend STRICTEMENT après la dernière organisation
 *     traitée — aucune n'est traitée deux fois, aucune n'est sautée.
 * La clé d'idempotence (organisation + jour local) reste le garde-fou
 * final : même mal rappelée, la route ne peut pas doubler un envoi.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bornes accordées : `automation_settings` a une clé primaire
 * (organization_id, scenario) et un CHECK à 4 scénarios, donc au plus 4
 * lignes par organisation. Lire 2000 lignes garantit d'avoir vu au moins
 * 500 organisations distinctes — la borne de lecture ne peut donc pas
 * rogner la borne de traitement en silence.
 */
const MAX_SETTINGS_ROWS = 2000;
const MAX_ORGANIZATIONS = 500;

/** Point de reprise : l'identifiant de la dernière organisation traitée. */
const cursorSchema = z.uuid();

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const rawCursor = new URL(request.url).searchParams.get("after");
  const parsedCursor =
    rawCursor === null ? null : cursorSchema.safeParse(rawCursor);
  if (parsedCursor !== null && !parsedCursor.success) {
    // Un curseur illisible ne doit pas se dégrader en « reprise au début » :
    // ce serait un second passage complet, donc un doublon potentiel.
    return NextResponse.json({ error: "Curseur invalide" }, { status: 400 });
  }
  const cursor =
    parsedCursor !== null && parsedCursor.success ? parsedCursor.data : null;

  return monitored("cron.automations", () => enqueueAutomationJobs(cursor));
}

async function enqueueAutomationJobs(cursor: string | null): Promise<NextResponse> {
  const admin = createAdminClient();
  // Heartbeat ouvert après l'authentification (faite par GET) : le
  // journal de santé ne compte que des exécutions réelles. Ouverture
  // BEST-EFFORT — le dépôt des jobs ne dépend pas du journal ; `null` =
  // pas de journal, l'échec est déjà remonté à Sentry par startWorkerRun.
  const run = await startWorkerRunSafely(admin, "automations");

  const enabledSettings = admin
    .from("automation_settings")
    .select("organization_id", { count: "exact" })
    .eq("enabled", true);
  const {
    data,
    error,
    // Total éligible, renvoyé indépendamment du `limit` : c'est lui qui
    // révèle une lecture tronquée.
    count: eligibleRows,
  } = await (cursor ? enabledSettings.gt("organization_id", cursor) : enabledSettings)
    .order("organization_id", { ascending: true })
    .limit(MAX_SETTINGS_ROWS);
  if (error) {
    reportError("cron.automations.settings", error.message);
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
      "settings_read_failed",
    );
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  const rows = data ?? [];
  // Ordre conservé par le dédoublonnage : `Set` itère dans l'ordre d'insertion.
  const candidates = [...new Set(rows.map((row) => row.organization_id as string))];
  const selectedIds = candidates.slice(0, MAX_ORGANIZATIONS);
  const deferred = candidates.length - selectedIds.length;
  // Lecture tronquée : il reste des lignes éligibles au-delà de ce passage,
  // dont on ne connaît pas le nombre d'organisations — d'où un signal
  // distinct du compteur.
  const readTruncated = (eligibleRows ?? rows.length) > rows.length;

  if (selectedIds.length === 0) {
    await finishWorkerRunSafely(admin, run, "succeeded", {
      organizations: 0,
      enqueued: 0,
      deferred: 0,
      follow_up_required: 0,
    });
    return NextResponse.json(
      {
        ok: true,
        organizations: 0,
        enqueued: 0,
        deferred: 0,
        followUpRequired: false,
        nextCursor: null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id, timezone")
    .in("id", selectedIds)
    .order("id", { ascending: true });
  if (organizationsError) {
    reportError("cron.automations.organizations", organizationsError.message);
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
      "organizations_read_failed",
    );
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  const now = new Date();
  let enqueued = 0;
  for (const organization of organizations ?? []) {
    const day = localDateKey(now, organization.timezone);
    const ok = await enqueueJob(admin, {
      type: "automation.run-scenarios",
      payload: { organizationId: organization.id, date: day },
      organizationId: organization.id,
      idempotencyKey: `automations:${organization.id}:${day}`,
    });
    if (ok) enqueued += 1;
  }

  const processed = organizations?.length ?? 0;
  const followUpRequired = deferred > 0 || readTruncated;
  // Reprise après la dernière organisation RETENUE (et non la dernière
  // résolue) : une organisation supprimée entre les deux lectures ne doit
  // pas faire rejouer tout ce qui la suit.
  const nextCursor = followUpRequired
    ? (selectedIds[selectedIds.length - 1] ?? null)
    : null;

  // Clôture best-effort : les jobs sont déposés, un journal muet ne doit
  // pas transformer un dépôt réussi en échec. `degraded` quand une suite
  // est nécessaire : le dépôt a réussi, la couverture est partielle.
  await finishWorkerRunSafely(
    admin,
    run,
    followUpRequired ? "degraded" : "succeeded",
    {
      organizations: processed,
      enqueued,
      deferred,
      follow_up_required: followUpRequired ? 1 : 0,
    },
    followUpRequired ? "organizations_deferred" : undefined,
  );

  return NextResponse.json(
    {
      ok: true,
      organizations: processed,
      enqueued,
      deferred,
      followUpRequired,
      nextCursor,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
