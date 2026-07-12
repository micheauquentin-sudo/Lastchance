import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getDashboardMetrics, listMerchants } from "@/lib/admin/data";
import { optionalEnv } from "@/lib/env";
import { PageHeader, Panel, StatCard, StatusBadge, Table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Stripe · Back-office", robots: { index: false } };

function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default async function StripePage() {
  await requireAdmin("stripe.view");
  const [m, active] = await Promise.all([
    getDashboardMetrics(),
    listMerchants({ status: "active", pageSize: 50 }),
  ]);

  // Détection best-effort du mode clé Stripe (sans exposer la clé).
  const key = optionalEnv("STRIPE_SECRET_KEY") ?? "";
  const mode = key.startsWith("sk_live") ? "live" : key.startsWith("sk_test") ? "test" : "non configuré";

  return (
    <div>
      <PageHeader
        title="Stripe"
        description="Facturation et abonnements. Données dérivées de la base ; la source Stripe reste la référence."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="MRR" value={euros(m.mrr)} sub={`ARR ${euros(m.mrr * 12)}`} accent />
        <StatCard label="Abonnements actifs" value={m.activeSubs} />
        <StatCard label="Impayés" value={m.pastDue} sub="à relancer" />
        <StatCard label="Mode clé Stripe" value={<span className="text-base capitalize">{mode}</span>} />
      </div>

      <Panel className="mt-8 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Abonnements actifs</h2>
          <span className="text-xs text-zinc-500">{active.total} au total</span>
        </div>
        {active.rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucun abonnement actif.</p>
        ) : (
          <Table
            head={
              <tr>
                <th className="px-4 py-2.5">Commerçant</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            }
          >
            {active.rows.map((r) => (
              <tr key={r.id} className="text-zinc-300 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-medium text-white">{r.name}</td>
                <td className="px-4 py-3 capitalize">{r.plan}</td>
                <td className="px-4 py-3"><StatusBadge status={r.subscription_status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/merchants/${r.id}`} className="text-violet-300 hover:text-violet-200">
                    Fiche →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
