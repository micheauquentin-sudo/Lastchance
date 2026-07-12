import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getParticipationsSeries, getTopMerchants } from "@/lib/admin/data";
import { PageHeader, Panel, StatCard } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Analytics · Back-office", robots: { index: false } };

export default async function AnalyticsPage() {
  await requireAdmin("analytics.view");
  const [series, top] = await Promise.all([
    getParticipationsSeries(30),
    getTopMerchants(8),
  ]);

  const total = series.reduce((a, b) => a + b.count, 0);
  const max = Math.max(1, ...series.map((s) => s.count));
  const avg = Math.round(total / Math.max(series.length, 1));
  const last7 = series.slice(-7).reduce((a, b) => a + b.count, 0);

  return (
    <div>
      <PageHeader title="Analytics" description="Activité des joueurs sur les 30 derniers jours." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Participations (30 j)" value={total.toLocaleString("fr-FR")} accent />
        <StatCard label="7 derniers jours" value={last7.toLocaleString("fr-FR")} />
        <StatCard label="Moyenne / jour" value={avg.toLocaleString("fr-FR")} />
        <StatCard label="Pic journalier" value={max.toLocaleString("fr-FR")} />
      </div>

      <Panel className="mt-8 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Participations par jour</h2>
        <div className="flex h-40 items-end gap-1">
          {series.map((s) => (
            <div key={s.date} className="group relative flex-1" title={`${s.date} : ${s.count}`}>
              <div
                className="w-full rounded-t bg-gradient-to-t from-violet-500/40 to-fuchsia-500/70 transition-colors group-hover:from-violet-400 group-hover:to-fuchsia-400"
                style={{ height: `${Math.max(2, Math.round((s.count / max) * 100))}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-600">
          <span>{series[0]?.date}</span>
          <span>{series[series.length - 1]?.date}</span>
        </div>
      </Panel>

      <Panel className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-white">Top commerçants — tours joués</h2>
        {top.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune donnée.</p>
        ) : (
          <ul className="space-y-3">
            {top.map((t) => {
              const tmax = Math.max(1, ...top.map((x) => x.spins));
              return (
                <li key={t.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-zinc-300">{t.name}</span>
                    <span className="font-mono text-zinc-500">{t.spins.toLocaleString("fr-FR")}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      style={{ width: `${Math.round((t.spins / tmax) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
