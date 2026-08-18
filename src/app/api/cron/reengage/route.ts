import { authorizeCronRequest } from "@/lib/timing-safe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/jobs";
import { optionalEnv } from "@/lib/env";
import { reportError } from "@/lib/monitoring";
import { localDateKey } from "@/lib/date-time";
import { finishWorkerRunSafely, startWorkerRunSafely } from "@/lib/worker-health";

/**
 * Relance clients automatique : GET /api/cron/reengage (CRON_SECRET).
 *
 * Le cron ne traite plus rien lui-même : il DÉPOSE un job par
 * organisation ayant activé la relance (file `jobs`, idempotent par
 * jour — un cron rejoué ne double aucun envoi), et le worker fréquent
 * exécute la relance org par org (src/lib/reengagement.ts) avec
 * erreurs isolées et retys. Le cron reste ainsi rapide et prévisible,
 * quel que soit le nombre d'organisations et de contacts.
 *
 * ── Bornage EXPLICITE ────────────────────────────────────────────
 * Le passage traite au plus MAX_ORGS organisations. Ce plafond n'est pas
 * silencieux : le décompte des organisations éligibles est demandé à la
 * base (`count: "exact"`, indépendant du `limit`), le reste est publié
 * comme `deferred`, et le passage se clôt en `degraded` avec le code
 * `organizations_deferred` — un plafond atteint devient un signal, pas
 * une disparition.
 *
 * L'ordre est TOTAL et déterministe : `last_reengage_run_at` d'abord (la
 * plus ancienne relance en tête, jamais relancée en premier), puis `id`
 * pour départager les ex æquo — sans ce second critère, deux passages
 * successifs pouvaient traiter deux sous-ensembles différents des mêmes
 * organisations à égalité. La rotation est portée par
 * `last_reengage_run_at`, que le worker met à jour dès qu'il a une
 * relance à tenter : les organisations différées remontent en tête au
 * passage suivant. Réserve connue : une organisation éligible SANS cible
 * ne fait rien mettre à jour (src/lib/reengagement.ts sort avant
 * l'estampille) et reste donc en tête — sans effet tant que le total
 * éligible tient sous le plafond, et visible via `deferred` sinon.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ORGS = 200;

export async function GET(request: Request) {
  const secret = optionalEnv("CRON_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant" }, { status: 500 });
  }
  if (!authorizeCronRequest(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Heartbeat ouvert APRÈS l'authentification : une requête non autorisée
  // ne doit laisser aucune trace d'exécution. Ouverture BEST-EFFORT : la
  // relance ne dépend en rien du journal de santé — `null` = pas de
  // journal, le travail métier continue (l'échec est déjà remonté à
  // Sentry par startWorkerRun, sans message brut ni PII).
  const run = await startWorkerRunSafely(admin, "reengage");

  const {
    data: orgs,
    error: orgsError,
    // Nombre TOTAL d'organisations éligibles : PostgREST le renvoie sans
    // tenir compte du `limit`, c'est lui qui rend le reliquat mesurable.
    count: eligibleCount,
  } = await admin
    .from("organizations")
    .select("id, timezone", { count: "exact" })
    .eq("auto_reengage", true)
    .order("last_reengage_run_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true })
    .limit(MAX_ORGS);

  if (orgsError) {
    reportError("cron.reengage.orgs", orgsError.message);
    // Code de catégorie, jamais le message du pilote : le journal de santé
    // n'accueille ni détail de requête, ni identifiant d'organisation.
    await finishWorkerRunSafely(
      admin,
      run,
      "failed",
      { organizations: 0, enqueued: 0, deferred: 0, follow_up_required: 0 },
      "orgs_read_failed",
    );
    return NextResponse.json({ error: "Erreur de chargement" }, { status: 500 });
  }

  const selected = orgs ?? [];
  const now = new Date();
  let enqueued = 0;
  for (const org of selected) {
    const day = localDateKey(now, org.timezone);
    const ok = await enqueueJob(admin, {
      type: "reengage.org",
      payload: { organizationId: org.id },
      organizationId: org.id,
      // Clé d'idempotence par organisation ET par jour local : ni le
      // bornage ni un rejeu ne peuvent produire un second envoi.
      idempotencyKey: `reengage:${org.id}:${day}`,
    });
    if (ok) enqueued += 1;
  }

  const organizations = selected.length;
  const deferred = Math.max(0, (eligibleCount ?? organizations) - organizations);
  const followUpRequired = deferred > 0;

  // Clôture best-effort elle aussi : les jobs sont déposés, les annuler
  // n'est pas possible et signaler un échec ferait rejouer le cron pour
  // rien. Une clôture impossible est remontée par finishWorkerRun.
  // `degraded` quand il reste des organisations à couvrir : le travail
  // fait est réel, la couverture ne l'est pas.
  await finishWorkerRunSafely(
    admin,
    run,
    followUpRequired ? "degraded" : "succeeded",
    {
      organizations,
      enqueued,
      deferred,
      follow_up_required: followUpRequired ? 1 : 0,
    },
    followUpRequired ? "organizations_deferred" : undefined,
  );

  return NextResponse.json(
    { ok: true, organizations, enqueued, deferred, followUpRequired },
    { headers: { "cache-control": "no-store" } },
  );
}
