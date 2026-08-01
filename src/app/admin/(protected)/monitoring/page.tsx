import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getMonitoringSnapshot } from "@/lib/admin/data";
import { getOpsSnapshot, listWorkerCadenceDefinitions } from "@/lib/admin/ops";
import { buildWorkerCadenceRows } from "@/lib/admin/worker-cadence";
import { PageHeader, Panel, StatCard } from "@/components/admin/ui";
import { WorkerCadencePanel } from "@/components/admin/worker-cadence-panel";
import { WorkerProbeButton } from "@/components/admin/worker-probe-button";
import { can } from "@/lib/admin/rbac";

export const metadata: Metadata = { title: "Monitoring · Back-office", robots: { index: false } };

// Toujours à jour : pas de cache pour l'état de santé.
export const dynamic = "force-dynamic";

const OP_LABELS: Record<string, string> = {
  "play.spinWheel": "Participation (spin)",
  "play.claimPrize": "Réclamation de gain",
  "stripe.webhook": "Webhook Stripe",
  "pronostics.register": "Inscription pronostics",
  "pronostics.update-player": "Profil pronostics",
  "pronostics.predict": "Dépôt de pronostic",
};

const WORKER_LABELS: Record<string, string> = {
  jobs: "File de travaux",
  "sync-contests": "Synchronisation sportive",
};

const WORKER_REASON_LABELS: Record<string, string> = {
  ok: "opérationnel",
  vault_missing: "secrets Vault manquants",
  never_succeeded: "aucune exécution réussie",
  heartbeat_stale: "heartbeat trop ancien",
  last_run_failed: "dernière exécution en échec",
  last_run_degraded: "dernière exécution dégradée",
  job_backlog_stale: "job dû depuis plus de 30 min",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 48 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `il y a ${Math.round(min / 1440)} j`;
}

function Dot({ ok }: { ok: boolean | null }) {
  const color =
    ok === null
      ? "bg-zinc-500 shadow-zinc-500/60"
      : ok
        ? "bg-emerald-400 shadow-emerald-400/60"
        : "bg-red-400 shadow-red-400/60";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px] ${color}`} />;
}

export default async function MonitoringPage() {
  const admin = await requireAdmin("monitoring.view");
  const [s, ops, cadenceDefinitions] = await Promise.all([
    getMonitoringSnapshot(),
    getOpsSnapshot(),
    listWorkerCadenceDefinitions(),
  ]);

  /* Le drapeau `configured` est la LECTURE EXISTANTE d'`ops_workers_health()` :
   * on la réutilise telle quelle plutôt que de rouvrir le Vault. Un worker du
   * registre absent de cette table n'est pas supervisé — la ligne le dira
   * « inconnue » au lieu d'affirmer une cadence que personne ne mesure. */
  const cadenceRows = buildWorkerCadenceRows(
    cadenceDefinitions,
    new Map(ops.workers.map((worker) => [worker.worker, worker.configured])),
  );

  const migrationOk =
    ops.migrationApplied !== null && ops.migrationApplied >= ops.migrationExpected;

  return (
    <div>
      <PageHeader
        title="Monitoring"
        description="État de santé mesuré : objectifs, files, crons et latences réelles."
      />

      {/* ── Objectifs (SLO) ── */}
      <Panel className="p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Objectifs</h2>
        <ul className="divide-y divide-white/5">
          {ops.slos.map((slo) => (
            <li key={slo.key} className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-3">
                <Dot ok={slo.ok} />
                <span className="text-sm text-zinc-200">{slo.label}</span>
              </div>
              <span className="text-right text-sm text-zinc-500">{slo.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ── Release & migrations ── */}
      <Panel className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Release</h2>
        <ul className="divide-y divide-white/5">
          <li className="flex items-center justify-between py-3">
            <span className="text-sm text-zinc-200">Commit déployé</span>
            <code className="text-sm text-zinc-400">{ops.releaseSha}</code>
          </li>
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot ok={migrationOk} />
              <span className="text-sm text-zinc-200">Migrations base de données</span>
            </div>
            <span className="text-sm text-zinc-500">
              appliquée {ops.migrationApplied ?? "inconnue"}
              {ops.migrationCount !== null && ` (${ops.migrationCount})`} · attendue{" "}
              {ops.migrationExpected}
            </span>
          </li>
        </ul>
      </Panel>

      {/* ── Activité ── */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tours (24 h)" value={s.spins24h.toLocaleString("fr-FR")} accent />
        <StatCard label="Participations (24 h)" value={s.participations24h.toLocaleString("fr-FR")} />
        <StatCard
          label="Webhook Stripe"
          value={formatWhen(ops.lastStripeEvent)}
          sub={`${s.stripeEventsTotal.toLocaleString("fr-FR")} traités`}
        />
        <StatCard label="Impayés" value={s.pastDueOrgs} sub="à surveiller" />
      </div>

      {/* ── Files & crons ── */}
      <Panel className="mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Workers, files & crons</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Le heartbeat provient de la route exécutée, pas seulement de pg_cron.
            </p>
          </div>
          {can(admin.role, "monitoring.probe") && <WorkerProbeButton />}
        </div>
        <ul className="divide-y divide-white/5">
          {ops.workers.map((worker) => (
            <li key={worker.worker} className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-3">
                <Dot ok={worker.healthy} />
                <span className="text-sm text-zinc-200">
                  Worker {WORKER_LABELS[worker.worker] ?? worker.worker}
                </span>
              </div>
              <span className="text-right text-sm text-zinc-500">
                {worker.configured ? "Vault configuré" : "Vault incomplet"} ·{" "}
                {WORKER_REASON_LABELS[worker.reason] ?? worker.reason} · dernier succès{" "}
                {formatWhen(worker.lastSuccessAt)}
              </span>
            </li>
          ))}
          {ops.workers.length === 0 && (
            <li className="py-3 text-sm text-red-400">
              Santé réelle des workers indisponible.
            </li>
          )}
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot ok={ops.jobsFailed === 0} />
              <span className="text-sm text-zinc-200">File de travaux (jobs)</span>
            </div>
            <span className="text-sm text-zinc-500">
              {ops.jobsQueued} en attente · {ops.jobsFailed} en échec
              {ops.oldestJobAgeMin !== null && ` · plus ancien ${ops.oldestJobAgeMin} min`}
            </span>
          </li>
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot ok={ops.webhookDeadLetters === 0} />
              <span className="text-sm text-zinc-200">Webhooks sortants</span>
            </div>
            <span className="text-sm text-zinc-500">
              {ops.webhookBacklog} en file · {ops.webhookDeadLetters} en dead-letter
              {ops.oldestWebhookAgeMin !== null &&
                ` · plus ancien ${ops.oldestWebhookAgeMin} min`}
            </span>
          </li>
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot ok={s.pendingRedemptions < 500} />
              <span className="text-sm text-zinc-200">Gains en attente de retrait</span>
            </div>
            <span className="text-sm text-zinc-500">{s.pendingRedemptions}</span>
          </li>
          {ops.crons.map((c) => (
            <li key={c.jobname} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Dot ok={c.healthy} />
                <span className="text-sm text-zinc-200">
                  Cron <code className="text-zinc-400">{c.jobname}</code>
                </span>
              </div>
              <span className="text-sm text-zinc-500">
                {c.schedule} · dernier succès {formatWhen(c.lastSuccess)}
                {c.lastStatus && c.lastStatus !== "succeeded" && ` · dernier run : ${c.lastStatus}`}
              </span>
            </li>
          ))}
          {ops.crons.length === 0 && (
            <li className="py-3 text-sm text-zinc-500">
              Aucun job pg_cron visible (secrets Vault non posés ?).
            </li>
          )}
        </ul>
      </Panel>

      {/* ── Cadence des workers (registre + Vault) ── */}
      <WorkerCadencePanel
        rows={cadenceRows}
        labels={WORKER_LABELS}
        canEnable={can(admin.role, "monitoring.cadence")}
      />

      {/* ── Synchronisation sportive & emails ── */}
      <Panel className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Synchro sportive & emails</h2>
        <ul className="divide-y divide-white/5">
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot ok={ops.laggingResults === 0} />
              <span className="text-sm text-zinc-200">Dernière synchro sportive</span>
            </div>
            <span className="text-sm text-zinc-500">{formatWhen(ops.lastContestSync)}</span>
          </li>
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot
                ok={
                  ops.fixtureCacheOldestMin === null
                    ? null
                    : ops.fixtureCacheErrors === 0
                }
              />
              <span className="text-sm text-zinc-200">Cache fournisseur (calendriers)</span>
            </div>
            <span className="text-sm text-zinc-500">
              {ops.fixtureCacheOldestMin === null
                ? "aucune ligue en cache"
                : `copie la plus ancienne : ${ops.fixtureCacheOldestMin} min · ${ops.fixtureCacheErrors} ligue(s) en erreur`}
            </span>
          </li>
          <li className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Dot
                ok={
                  ops.emails7d.targeted === 0
                    ? null
                    : ops.emails7d.sent / ops.emails7d.targeted >= 0.98
                }
              />
              <span className="text-sm text-zinc-200">Emails newsletter (7 j)</span>
            </div>
            <span className="text-sm text-zinc-500">
              {ops.emails7d.targeted === 0
                ? "aucun envoi"
                : `${ops.emails7d.sent}/${ops.emails7d.targeted} acceptés (${Math.round((ops.emails7d.sent / ops.emails7d.targeted) * 100)} %)`}{" "}
              · rebonds non instrumentés (webhooks Resend non branchés)
            </span>
          </li>
        </ul>
      </Panel>

      {/* ── Latences réelles (24 h) ── */}
      <Panel className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">
          Latences mesurées (24 h)
        </h2>
        {ops.metrics.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Aucune opération critique sur les dernières 24 h.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="pb-2 font-medium">Opération</th>
                <th className="pb-2 text-right font-medium">Appels</th>
                <th className="pb-2 text-right font-medium">Erreurs</th>
                <th className="pb-2 text-right font-medium">p50</th>
                <th className="pb-2 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ops.metrics.map((m) => (
                <tr key={m.op}>
                  <td className="py-2 text-zinc-200">{OP_LABELS[m.op] ?? m.op}</td>
                  <td className="py-2 text-right text-zinc-400">{m.calls}</td>
                  <td
                    className={`py-2 text-right ${m.errorRate >= 0.01 ? "text-red-400" : "text-zinc-400"}`}
                  >
                    {(m.errorRate * 100).toFixed(1)} %
                  </td>
                  <td className="py-2 text-right text-zinc-400">{m.p50Ms} ms</td>
                  <td className="py-2 text-right text-zinc-400">{m.p95Ms} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
