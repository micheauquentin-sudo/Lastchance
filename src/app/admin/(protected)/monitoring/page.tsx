import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getMonitoringSnapshot } from "@/lib/admin/data";
import { PageHeader, Panel, StatCard } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Monitoring · Back-office", robots: { index: false } };

// Toujours à jour : pas de cache pour l'état de santé.
export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  await requireAdmin("monitoring.view");
  const s = await getMonitoringSnapshot();

  const checks = [
    { label: "Base de données", ok: s.dbReachable, detail: s.dbReachable ? "Accessible" : "Injoignable" },
    { label: "Activité joueurs (24 h)", ok: true, detail: `${s.spins24h} tours` },
    { label: "Webhooks Stripe", ok: true, detail: `${s.stripeEventsTotal} événements traités` },
    { label: "File de validation", ok: s.pendingRedemptions < 500, detail: `${s.pendingRedemptions} gains en attente` },
  ];

  return (
    <div>
      <PageHeader title="Monitoring" description="État de santé de la plateforme en temps réel." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tours (24 h)" value={s.spins24h.toLocaleString("fr-FR")} accent />
        <StatCard label="Participations (24 h)" value={s.participations24h.toLocaleString("fr-FR")} />
        <StatCard label="Événements Stripe" value={s.stripeEventsTotal.toLocaleString("fr-FR")} />
        <StatCard label="Impayés" value={s.pastDueOrgs} sub="à surveiller" />
      </div>

      <Panel className="mt-8 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Contrôles</h2>
        <ul className="divide-y divide-white/5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${c.ok ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" : "bg-red-400 shadow-[0_0_8px] shadow-red-400/60"}`}
                />
                <span className="text-sm text-zinc-200">{c.label}</span>
              </div>
              <span className="text-sm text-zinc-500">{c.detail}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
