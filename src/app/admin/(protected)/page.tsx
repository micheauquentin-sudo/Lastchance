import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboardMetrics, getTopMerchants } from "@/lib/admin/data";
import { PageHeader, Panel, StatCard } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Dashboard · Back-office", robots: { index: false } };

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default async function AdminDashboardPage() {
  await requireAdmin("dashboard.view");
  const [m, top] = await Promise.all([getDashboardMetrics(), getTopMerchants(6)]);

  const arr = m.mrr * 12;
  const maxSpins = Math.max(1, ...top.map((t) => t.spins));

  return (
    <div>
      <PageHeader title="Dashboard" description="Vue d'ensemble de l'activité LastChance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="MRR" value={euros(m.mrr)} sub={`ARR ${euros(arr)}`} accent />
        <StatCard label="Abonnements actifs" value={m.activeSubs} sub={`${m.trialing} en essai`} />
        <StatCard label="Impayés" value={m.pastDue} sub={`${m.canceled} annulés`} />
        <StatCard label="Commerçants" value={m.totalOrgs} sub="au total" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Campagnes actives" value={m.activeCampaigns} />
        <StatCard label="Tours joués" value={m.totalSpins.toLocaleString("fr-FR")} />
        <StatCard label="Participations" value={m.totalParticipations.toLocaleString("fr-FR")} />
        <StatCard label="Gains à valider" value={m.pendingRedemptions} />
      </div>

      <Panel className="mt-8 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Top commerçants — tours joués</h2>
        {top.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune donnée pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-3">
            {top.map((t) => (
              <li key={t.name}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-zinc-300">{t.name}</span>
                  <span className="font-mono text-zinc-500">{t.spins.toLocaleString("fr-FR")}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    style={{ width: `${Math.round((t.spins / maxSpins) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
